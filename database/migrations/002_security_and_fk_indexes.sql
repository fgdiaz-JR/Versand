-- Ajustes de seguridad y rendimiento posteriores a la instalación inicial.
-- Las tablas siguen reservadas a service_role; no se habilitan accesos públicos.

ALTER FUNCTION public.enqueue_notification(JSONB) SET search_path = pg_catalog;
ALTER FUNCTION public.register_paid_order(JSONB) SET search_path = pg_catalog;
ALTER FUNCTION public.assign_order_shipping(VARCHAR, VARCHAR, VARCHAR, INT) SET search_path = pg_catalog;
ALTER FUNCTION public.record_tracking_event(JSONB) SET search_path = pg_catalog;
ALTER FUNCTION public.freeze_order_escrow(VARCHAR, TEXT, VARCHAR) SET search_path = pg_catalog;
ALTER FUNCTION public.release_order_escrow(VARCHAR, TEXT) SET search_path = pg_catalog;
ALTER FUNCTION public.release_expired_escrows() SET search_path = pg_catalog;

-- Los UNIQUE declarados en columnas ya crean índices equivalentes; conservar los índices de constraint.
DROP INDEX IF EXISTS public.uq_tracking_events_idempotency;
DROP INDEX IF EXISTS public.uq_notification_source_event_key;

-- Índices para las claves foráneas consultadas por orden.
CREATE INDEX IF NOT EXISTS idx_notification_logs_order_id ON public.notification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_accounting_outbox_order_id ON public.accounting_outbox(order_id);
