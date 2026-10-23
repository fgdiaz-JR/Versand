-- Versand: migración para esquemas Supabase previamente creados.
-- Ejecutar en el SQL Editor de Supabase con una cuenta administrativa.

ALTER TABLE public.orders ALTER COLUMN tracking_number DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN carrier DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN customer_phone DROP DEFAULT;
ALTER TABLE public.tracking_events ALTER COLUMN tracking_number DROP NOT NULL;
ALTER TABLE public.tracking_events ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_events_idempotency ON public.tracking_events(idempotency_key);

ALTER TABLE public.escrow_vault ALTER COLUMN retention_started_at DROP NOT NULL;
ALTER TABLE public.escrow_vault ALTER COLUMN retention_started_at DROP DEFAULT;
ALTER TABLE public.escrow_vault ALTER COLUMN auto_release_at DROP NOT NULL;
ALTER TABLE public.escrow_vault ALTER COLUMN auto_release_at DROP DEFAULT;
ALTER TABLE public.escrow_vault ALTER COLUMN status SET DEFAULT 'AWAITING_DELIVERY';
UPDATE public.escrow_vault e SET status = 'AWAITING_DELIVERY', retention_started_at = NULL, auto_release_at = NULL
FROM public.orders o WHERE o.id = e.order_id AND o.delivered_at IS NULL AND e.status = 'RETAINED';
UPDATE public.escrow_vault e SET retention_started_at = COALESCE(e.retention_started_at, o.delivered_at),
    auto_release_at = COALESCE(e.auto_release_at, o.delivered_at + INTERVAL '72 hours')
FROM public.orders o WHERE o.id = e.order_id AND o.delivered_at IS NOT NULL AND e.status = 'RETAINED';

ALTER TABLE public.notification_logs ALTER COLUMN delivery_latency_ms DROP NOT NULL;
ALTER TABLE public.notification_logs ALTER COLUMN delivery_latency_ms DROP DEFAULT;
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS delivery_error TEXT;
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS source_event_key VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_source_event_key ON public.notification_logs(source_event_key);
CREATE INDEX IF NOT EXISTS idx_notification_pending ON public.notification_logs(delivery_status, created_at);

CREATE TABLE IF NOT EXISTS public.accounting_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(30) NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    delivery_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_accounting_pending ON public.accounting_outbox(delivery_status, created_at);

CREATE OR REPLACE FUNCTION public.enqueue_notification(p_notification JSONB)
RETURNS SETOF public.notification_logs
LANGUAGE plpgsql
AS $$
DECLARE saved public.notification_logs;
BEGIN
    INSERT INTO public.notification_logs (order_id, event_type, recipient_id, channel, payload, source_event_key)
    VALUES (p_notification->>'order_id', COALESCE(p_notification->>'event_type', 'EstadoCambiado'),
        COALESCE(p_notification->>'recipient_id', 'unknown'), COALESCE(p_notification->>'channel', 'Push'),
        p_notification->'payload', p_notification->>'source_event_key')
    ON CONFLICT (source_event_key) DO NOTHING
    RETURNING * INTO saved;
    IF NOT FOUND THEN
        SELECT * INTO saved FROM public.notification_logs WHERE source_event_key = p_notification->>'source_event_key';
    END IF;
    RETURN NEXT saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_paid_order(p_order JSONB)
RETURNS SETOF public.orders
LANGUAGE plpgsql
AS $$
DECLARE saved_order public.orders;
BEGIN
    INSERT INTO public.orders (
        id, order_number, customer_id, customer_name, customer_phone, customer_email,
        seller_id, destination_city, destination_address, product_name, total_amount,
        status, sla_hours, last_location
    ) VALUES (
        p_order->>'id', p_order->>'order_number', p_order->>'customer_id', p_order->>'customer_name',
        p_order->>'customer_phone', p_order->>'customer_email', p_order->>'seller_id',
        p_order->>'destination_city', p_order->>'destination_address', p_order->>'product_name',
        (p_order->>'total_amount')::NUMERIC, 'Confirmado', COALESCE((p_order->>'sla_hours')::INT, 48), 'Pago confirmado'
    )
    ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
    WHERE public.orders.order_number = EXCLUDED.order_number
      AND public.orders.customer_id = EXCLUDED.customer_id
      AND public.orders.seller_id = EXCLUDED.seller_id
      AND public.orders.total_amount = EXCLUDED.total_amount
    RETURNING * INTO saved_order;

    IF NOT FOUND THEN RAISE EXCEPTION 'El identificador de orden ya existe con otra referencia'; END IF;

    INSERT INTO public.tracking_events (order_id, tracking_number, status, location, checkpoint_note, source, signature_verified, idempotency_key)
    VALUES (saved_order.id, NULL, 'Confirmado', 'Pasarela de pago', 'Pago confirmado por Equipo 8 (OrderPaid)', 'system_event', TRUE, 'order-paid:' || saved_order.id)
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.escrow_vault (order_id, seller_id, retained_amount, status)
    VALUES (saved_order.id, saved_order.seller_id, saved_order.total_amount, 'AWAITING_DELIVERY')
    ON CONFLICT (order_id) DO NOTHING;

    RETURN NEXT saved_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_order_shipping(p_order_id VARCHAR, p_carrier VARCHAR, p_tracking_number VARCHAR, p_sla_hours INT)
RETURNS SETOF public.orders
LANGUAGE plpgsql
AS $$
DECLARE
    saved_order public.orders;
    event_key VARCHAR(64);
BEGIN
    PERFORM 1 FROM public.escrow_vault
    WHERE order_id = p_order_id AND status = 'AWAITING_DELIVERY';
    IF NOT FOUND THEN RAISE EXCEPTION 'Solo se puede asignar envío a pedidos pagados pendientes de despacho'; END IF;

    UPDATE public.orders SET carrier = p_carrier, tracking_number = UPPER(TRIM(p_tracking_number)),
        sla_hours = p_sla_hours, status = 'Preparado',
        estimated_delivery_at = NOW() + make_interval(hours => p_sla_hours), updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO saved_order;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

    event_key := md5(saved_order.id || ':' || saved_order.tracking_number);
    INSERT INTO public.tracking_events (order_id, tracking_number, status, location, checkpoint_note, source, signature_verified, idempotency_key)
    VALUES (saved_order.id, saved_order.tracking_number, 'Preparado', 'Bodega de Despacho', 'Transportadora asignada; SLA ' || p_sla_hours || ' horas.', 'integration', TRUE, event_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN NEXT saved_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_escrow(p_order_id VARCHAR, p_resolved_by TEXT DEFAULT 'system')
RETURNS SETOF public.escrow_vault
LANGUAGE plpgsql
AS $$
DECLARE saved public.escrow_vault;
BEGIN
    UPDATE public.escrow_vault SET status = 'RELEASED', released_at = NOW()
    WHERE order_id = p_order_id AND status = 'RETAINED' AND auto_release_at <= NOW()
    RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Custodia no vencida, inexistente o congelada'; END IF;
    INSERT INTO public.accounting_outbox (order_id, event_type, idempotency_key, payload)
    VALUES (p_order_id, 'FundsReleased', 'release:' || p_order_id,
        jsonb_build_object('order_id', p_order_id, 'amount', saved.retained_amount, 'seller_id', saved.seller_id, 'resolved_by', p_resolved_by))
    ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN NEXT saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tracking_event(p_event JSONB)
RETURNS SETOF public.tracking_events
LANGUAGE plpgsql
AS $$
DECLARE
    saved_event public.tracking_events;
    saved_order public.orders;
    event_time TIMESTAMPTZ := COALESCE((p_event->>'created_at')::TIMESTAMPTZ, NOW());
BEGIN
    SELECT * INTO saved_order FROM public.orders WHERE id = p_event->>'order_id' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

    INSERT INTO public.tracking_events (order_id, tracking_number, status, location, checkpoint_note, source, signature_verified, raw_payload, idempotency_key, created_at)
    VALUES (saved_order.id, saved_order.tracking_number, p_event->>'status', p_event->>'location', p_event->>'checkpoint_note',
        COALESCE(p_event->>'source', 'carrier_webhook'), COALESCE((p_event->>'signature_verified')::BOOLEAN, FALSE),
        p_event->'raw_payload', p_event->>'idempotency_key', event_time)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING * INTO saved_event;

    IF NOT FOUND THEN
        SELECT * INTO saved_event FROM public.tracking_events WHERE idempotency_key = p_event->>'idempotency_key';
        RETURN NEXT saved_event;
        RETURN;
    END IF;

    UPDATE public.orders SET status = p_event->>'status', last_location = p_event->>'location', updated_at = event_time,
        delivered_at = CASE WHEN p_event->>'status' = 'Entregado' THEN COALESCE(delivered_at, event_time) ELSE delivered_at END
    WHERE id = saved_order.id;

    IF p_event->>'status' = 'Entregado' THEN
        UPDATE public.escrow_vault SET status = 'RETAINED', retention_started_at = event_time,
            auto_release_at = event_time + INTERVAL '72 hours'
        WHERE order_id = saved_order.id AND status = 'AWAITING_DELIVERY';
    END IF;

    RETURN NEXT saved_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.freeze_order_escrow(p_order_id VARCHAR, p_reason TEXT, p_dispute_id VARCHAR)
RETURNS SETOF public.escrow_vault
LANGUAGE plpgsql
AS $$
DECLARE saved public.escrow_vault;
BEGIN
    UPDATE public.escrow_vault SET status = 'FROZEN_DISPUTE', dispute_id = p_dispute_id,
        dispute_reason = p_reason, dispute_registered_at = NOW()
    WHERE order_id = p_order_id AND status IN ('AWAITING_DELIVERY', 'RETAINED')
    RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Custodia inexistente o ya liberada/congelada'; END IF;
    UPDATE public.orders SET status = 'Incidencia', updated_at = NOW() WHERE id = p_order_id;
    INSERT INTO public.tracking_events (order_id, tracking_number, status, location, checkpoint_note, source, signature_verified, idempotency_key)
    SELECT id, tracking_number, 'Incidencia', 'Portal de Soporte y Reclamaciones',
        'Fondos congelados por PQR ' || saved.dispute_id, 'system_event', TRUE, md5('dispute:' || saved.dispute_id)
    FROM public.orders WHERE id = p_order_id
    ON CONFLICT (idempotency_key) DO NOTHING;
    INSERT INTO public.accounting_outbox (order_id, event_type, idempotency_key, payload)
    VALUES (p_order_id, 'FundsFrozen', 'freeze:' || p_order_id || ':' || saved.dispute_id,
        jsonb_build_object('order_id', p_order_id, 'amount', saved.retained_amount, 'dispute_id', saved.dispute_id))
    ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN NEXT saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_expired_escrows()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE released_count INT;
BEGIN
    WITH released AS (
        UPDATE public.escrow_vault SET status = 'RELEASED', released_at = NOW()
        WHERE status = 'RETAINED' AND auto_release_at <= NOW()
        RETURNING order_id, retained_amount, seller_id
    ), queued AS (
        INSERT INTO public.accounting_outbox (order_id, event_type, idempotency_key, payload)
        SELECT order_id, 'FundsReleased', 'release:' || order_id,
            jsonb_build_object('order_id', order_id, 'amount', retained_amount, 'seller_id', seller_id, 'resolved_by', 'auto')
        FROM released ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
    ) SELECT COUNT(*)::INT INTO released_count FROM released;
    RETURN released_count;
END;
$$;

REVOKE ALL ON FUNCTION public.register_paid_order(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_order_shipping(VARCHAR, VARCHAR, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_tracking_event(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.freeze_order_escrow(VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order_escrow(VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_escrows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_paid_order(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_order_shipping(VARCHAR, VARCHAR, VARCHAR, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_tracking_event(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.freeze_order_escrow(VARCHAR, TEXT, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_escrow(VARCHAR, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_escrows() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(JSONB) TO service_role;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('delivery-evidence', 'delivery-evidence', FALSE, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = FALSE, allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orders, public.tracking_events, public.escrow_vault, public.delivery_evidence, public.notification_logs, public.accounting_outbox FROM anon, authenticated;
GRANT ALL ON public.orders, public.tracking_events, public.escrow_vault, public.delivery_evidence, public.notification_logs, public.accounting_outbox TO service_role;
