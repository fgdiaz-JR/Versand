-- ==============================================================================
-- VERSAND - ESQUEMA DE BASE DE DATOS PARA SUPABASE (POSTGRESQL)
-- Cumplimiento integral: Sprint 1, Sprint 2, Sprint 3 y Acuerdos Inter-Equipos
-- ==============================================================================

-- 1. TABLA PRINCIPAL DE PEDIDOS / ENVÍOS (HU-01, HU-02, ACUERDOS EQUIPO 1 Y 8)
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(30) PRIMARY KEY,                         -- Identificador de pedido (Ej: MC-20481)
    order_number VARCHAR(50) NOT NULL UNIQUE,          -- Referencia generada por Carrito & Órdenes (Equipo 8)
    tracking_number VARCHAR(50) UNIQUE,                -- Se asigna después de OrderPaid desde Envíos (Equipo 1, HU-02)
    carrier VARCHAR(50),                               -- Se asigna después de OrderPaid
    customer_id VARCHAR(50) NOT NULL,                  -- ID del comprador (Ej: buyer-001)
    customer_name VARCHAR(120) NOT NULL,               -- Nombre del comprador (Laura Gómez)
    customer_phone VARCHAR(30),                         -- Teléfono informado por Equipo 8 (opcional)
    customer_email VARCHAR(120),
    seller_id VARCHAR(50) NOT NULL,                    -- ID del vendedor (seller-001)
    destination_city VARCHAR(80) NOT NULL,
    destination_address TEXT NOT NULL,
    product_name TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Monto total para retención en Escrow (HU-03)
    status VARCHAR(30) NOT NULL DEFAULT 'Confirmado',  -- Confirmado, Preparado, En tránsito, En reparto, Entregado, Incidencia
    sla_hours INT NOT NULL DEFAULT 48,                 -- SLA acordado con transportadora (24h, 48h, 72h)
    estimated_delivery_at TIMESTAMPTZ,                -- Fecha estimada calculada dinámicamente (HU-01)
    delivered_at TIMESTAMPTZ,                          -- Timestamp de entrega real que inicia la ventana Escrow 72h
    last_location VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABLA INMUTABLE DE HISTORIAL DE ESTADOS (TRAZABILIDAD Y AUDITORÍA HU-01, HU-04)
CREATE TABLE IF NOT EXISTS tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tracking_number VARCHAR(50),
    status VARCHAR(30) NOT NULL,
    location VARCHAR(120) NOT NULL,
    checkpoint_note TEXT,
    source VARCHAR(40) NOT NULL DEFAULT 'carrier_webhook', -- carrier_webhook, manual, system_event
    signature_verified BOOLEAN NOT NULL DEFAULT TRUE,       -- Validación criptográfica HMAC SHA-256 (HU-04)
    raw_payload JSONB,
    idempotency_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABLA DE PROTECCIÓN FINANCIERA ESCROW 72H (HU-03, ACUERDO EQUIPOS 2 Y 6)
CREATE TABLE IF NOT EXISTS escrow_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(30) NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    seller_id VARCHAR(50) NOT NULL,
    retained_amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AWAITING_DELIVERY', -- AWAITING_DELIVERY, RETAINED, RELEASED, FROZEN_DISPUTE
    retention_started_at TIMESTAMPTZ,                  -- Se establece con delivered_at
    auto_release_at TIMESTAMPTZ,                        -- delivered_at + 72 horas exactas
    released_at TIMESTAMPTZ,
    dispute_id VARCHAR(50),                             -- Identificador de reclamo / PQR activa
    dispute_reason TEXT,
    dispute_registered_at TIMESTAMPTZ,
    accounting_notified BOOLEAN NOT NULL DEFAULT FALSE, -- Notificación enviada a Contabilidad (Equipo 6)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABLA DE EVIDENCIAS DE ENTREGA CON METADATOS GPS INALTERABLES (HU-06)
CREATE TABLE IF NOT EXISTS delivery_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tracking_number VARCHAR(50) NOT NULL,
    image_url TEXT NOT NULL,                           -- Ruta privada en Supabase Storage; URL firmada solo al consultar
    latitude NUMERIC(10, 7) NOT NULL,                  -- Coordenada GPS
    longitude NUMERIC(10, 7) NOT NULL,                 -- Coordenada GPS
    gps_accuracy_meters NUMERIC(6, 2) DEFAULT 5.0,
    timestamp_stamped TIMESTAMPTZ NOT NULL,            -- Estampa inalterable grabada
    hash_integrity VARCHAR(64) NOT NULL,               -- Hash SHA-256 de seguridad
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABLA DE LOGS DE NOTIFICACIONES EMITIDAS (< 5s) (ACUERDO EQUIPO 3)
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,                   -- 'EstadoCambiado'
    recipient_id VARCHAR(50) NOT NULL,
    channel VARCHAR(30) NOT NULL DEFAULT 'Push',       -- Push, WhatsApp, SMS
    delivery_latency_ms INT,                           -- Se registra solo tras una entrega real
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    delivery_error TEXT,
    attempted_at TIMESTAMPTZ,
    source_event_key VARCHAR(64) UNIQUE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_order ON tracking_events(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_vault(status);
CREATE INDEX IF NOT EXISTS idx_evidence_order ON delivery_evidence(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_pending ON notification_logs(delivery_status, created_at);

-- Eventos contables pendientes de confirmación del módulo externo.
CREATE TABLE IF NOT EXISTS accounting_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    delivery_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_accounting_pending ON accounting_outbox(delivery_status, created_at);

