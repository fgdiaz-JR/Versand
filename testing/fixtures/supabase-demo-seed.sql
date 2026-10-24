-- Datos totalmente ficticios para demostración del módulo de seguimiento.
-- Repetible: IDs e idempotency keys estables; no sobrescribe pedidos existentes.

INSERT INTO public.orders
(id, order_number, tracking_number, carrier, customer_id, customer_name, customer_phone, customer_email, seller_id, destination_city, destination_address, product_name, total_amount, status, sla_hours, estimated_delivery_at, delivered_at, last_location, created_at)
VALUES
('MC-20481','ORD-2026-8812','MCX-908172','Mercado Express','buyer-001','Comprador Demo',NULL,'comprador.demo@versand.test','seller-901','Bogotá, Colombia','Dirección de demostración 127','Audífonos inalámbricos de prueba',320000,'En reparto',24,NOW()+INTERVAL '3 hours',NULL,'Centro Norte, Bogotá',NOW()-INTERVAL '1 day'),
('MC-20397','ORD-2026-7441','MCX-907441','Mercado Express','buyer-001','Comprador Demo',NULL,'comprador.demo@versand.test','seller-504','Bogotá, Colombia','Dirección de demostración 127','Kit de café artesanal de prueba',185000,'Entregado',24,NOW()-INTERVAL '20 hours',NOW()-INTERVAL '20 hours','Bogotá, Colombia',NOW()-INTERVAL '3 days'),
('MC-20479','ORD-2026-8055','MCX-908055','Ruta Segura','buyer-002','Andrés Demo',NULL,'andres@example.test','seller-312','Medellín, Colombia','Dirección sintética 43','Teclado mecánico de prueba',410000,'Entregado',48,NOW()-INTERVAL '80 hours',NOW()-INTERVAL '80 hours','Medellín, Colombia',NOW()-INTERVAL '6 days'),
('MC-20463','ORD-2026-7990','MCX-907990','Coordinadora','buyer-003','Sofía Demo',NULL,'sofia@example.test','seller-780','Cali, Colombia','Dirección sintética 6N','Monitor de prueba',1450000,'Incidencia',72,NOW()+INTERVAL '24 hours',NULL,'Hub de pruebas, Valle',NOW()-INTERVAL '2 days')
 ,('MC-20480','ORD-2026-8809',NULL,NULL,'buyer-001','Comprador Demo',NULL,'comprador.demo@versand.test','seller-880','Bogotá, Colombia','Dirección sintética demo 880','Paquete pendiente de despacho',87000,'Confirmado',24,NULL,NULL,'Pago confirmado · listo para despacho',NOW()-INTERVAL '2 hours'),
('MC-20501','ORD-2026-9021','MCX-908201','Coordinadora','buyer-001','Comprador Demo',NULL,'comprador.demo@versand.test','seller-330','Cali, Colombia','Carrera 1 #5-105 Oeste, Museo La Tertulia, Cali','Artesanías nariñenses (pedido demo)',245000,'En tránsito',24,'2026-10-24 02:01:16-05',NULL,'Pasto · en ruta hacia Cali','2026-10-23 17:30:00-05')
ON CONFLICT (id) DO NOTHING;

-- Actualiza únicamente pedidos de demostración existentes para que el mapa
-- use direcciones públicas colombianas, verificables y reconocibles.
UPDATE public.orders SET destination_address='Carrera 1 #5-105 Oeste, Museo La Tertulia, Cali', destination_city='Cali, Colombia', status='En tránsito', sla_hours=24, estimated_delivery_at='2026-10-24 01:27:15-05', delivered_at=NULL, last_location='Bogotá · en ruta hacia Cali', created_at='2026-10-23 16:30:00-05', updated_at=NOW() WHERE id='MC-20481';
UPDATE public.orders SET destination_address='Carrera 5 #6-05, Centro Cultural de Cali, Cali', destination_city='Cali, Colombia', last_location='Carrera 5 #6-05, Centro Cultural de Cali, Cali' WHERE id='MC-20397';
UPDATE public.orders SET destination_address='Carrera 52 #52-43, Museo de Antioquia, Medellín', destination_city='Medellín, Colombia' WHERE id='MC-20479';
UPDATE public.orders SET destination_address='Carrera 1 #5-105 Oeste, Museo La Tertulia, Cali', destination_city='Cali, Colombia' WHERE id='MC-20463';

INSERT INTO public.tracking_events(order_id,tracking_number,status,location,checkpoint_note,source,signature_verified,idempotency_key,created_at)
VALUES
('MC-20481','MCX-908172','Confirmado','Checkout demo','Pago sintético confirmado','system_event',TRUE,'demo:MC-20481:1',NOW()-INTERVAL '24 hours'),
('MC-20481','MCX-908172','Preparado','Bodega demo','Guía asignada para demostración','manual',TRUE,'demo:MC-20481:2',NOW()-INTERVAL '18 hours'),
('MC-20481','MCX-908172','En tránsito','Hub de pruebas','Evento sintético de transportadora','carrier_webhook',TRUE,'demo:MC-20481:3',NOW()-INTERVAL '8 hours'),
('MC-20481','MCX-908172','En reparto','Centro Norte, Bogotá','Evento sintético en ruta','carrier_webhook',TRUE,'demo:MC-20481:4',NOW()-INTERVAL '45 minutes'),
('MC-20397','MCX-907441','Confirmado','Checkout demo','Pago sintético confirmado','system_event',TRUE,'demo:MC-20397:1',NOW()-INTERVAL '72 hours'),
('MC-20397','MCX-907441','Preparado','Bodega demo','Pedido preparado','manual',TRUE,'demo:MC-20397:2',NOW()-INTERVAL '60 hours'),
('MC-20397','MCX-907441','En tránsito','Hub Bogotá','Evento sintético en tránsito','carrier_webhook',TRUE,'demo:MC-20397:3',NOW()-INTERVAL '36 hours'),
('MC-20397','MCX-907441','En reparto','Usaquén','Evento sintético de reparto','carrier_webhook',TRUE,'demo:MC-20397:4',NOW()-INTERVAL '24 hours'),
('MC-20397','MCX-907441','Entregado','Bogotá, Colombia','Entrega sintética; no tiene foto ni firma real','carrier_webhook',TRUE,'demo:MC-20397:5',NOW()-INTERVAL '20 hours'),
('MC-20479','MCX-908055','Entregado','Medellín, Colombia','Entrega sintética para probar vencimiento de Escrow','carrier_webhook',TRUE,'demo:MC-20479:1',NOW()-INTERVAL '80 hours'),
('MC-20463','MCX-907990','Incidencia','Portal PQR demo','PQR sintética con custodia congelada','system_event',TRUE,'demo:MC-20463:1',NOW()-INTERVAL '1 hour')
 ,('MC-20480',NULL,'Confirmado','Checkout demo','Pago sintético confirmado; pedido listo para asignación de guía.','system_event',TRUE,'demo:MC-20480:1',NOW()-INTERVAL '2 hours')
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE public.tracking_events SET location='Carrera 7 #28-66, Museo Nacional de Colombia, Bogotá', checkpoint_note='Origen de ruta de demostración; salida hacia Cali.', created_at='2026-10-23 16:30:00-05' WHERE idempotency_key='demo:MC-20481:1';
UPDATE public.tracking_events SET location='Cra. 6 #15-88, Museo del Oro, Bogotá', checkpoint_note='Origen de ruta de demostración; dirección pública del Museo del Oro.' WHERE idempotency_key='demo:MC-20397:1';
UPDATE public.tracking_events SET created_at='2026-10-23 16:45:00-05' WHERE idempotency_key='demo:MC-20481:2';
UPDATE public.tracking_events SET location='Hub Regional Fontibón, Bogotá', checkpoint_note='Despacho hacia Cali. Estimación por carretera OSRM: 8 h 27 min, 394,7 km; sin tráfico en vivo.', raw_payload='{"route_duration_seconds":30435,"route_distance_meters":394700,"route_provider":"OSRM / OpenStreetMap"}'::jsonb, created_at='2026-10-23 17:00:00-05' WHERE idempotency_key='demo:MC-20481:3';
UPDATE public.tracking_events SET status='En tránsito', location='Bogotá · en ruta hacia Cali', checkpoint_note='Actualización de ruta desde Bogotá hacia Cali.', created_at='2026-10-23 19:00:00-05' WHERE idempotency_key='demo:MC-20481:4';
UPDATE public.tracking_events SET location='Carrera 5 #6-05, Centro Cultural de Cali, Cali', checkpoint_note='Entrega sintética en dirección pública del Centro Cultural de Cali.' WHERE idempotency_key='demo:MC-20397:5';

INSERT INTO public.tracking_events(order_id,tracking_number,status,location,checkpoint_note,source,signature_verified,idempotency_key,created_at,raw_payload)
VALUES
('MC-20501','MCX-908201','Confirmado','Carrera 6 #16D-50, Terminal de Transportes de Pasto, Pasto','Origen del pedido demo desde la Terminal de Transportes de Pasto.','system_event',TRUE,'demo:MC-20501:1','2026-10-23 17:30:00-05',NULL),
('MC-20501','MCX-908201','Preparado','Terminal de Transportes de Pasto, Pasto','Pedido preparado para despacho hacia Cali.','manual',TRUE,'demo:MC-20501:2','2026-10-23 17:45:00-05',NULL),
('MC-20501','MCX-908201','En tránsito','Carrera 6 #16D-50, Terminal de Transportes de Pasto, Pasto','Despacho hacia Cali. Estimación por carretera OSRM: 8 h 1 min, 461,5 km; sin tráfico en vivo.','carrier_webhook',TRUE,'demo:MC-20501:3','2026-10-23 18:00:00-05','{"route_duration_seconds":28876,"route_distance_meters":461536,"route_provider":"OSRM / OpenStreetMap"}'::jsonb),
('MC-20501','MCX-908201','En tránsito','Pasto · en ruta hacia Cali','Actualización de ruta del pedido demo.','carrier_webhook',TRUE,'demo:MC-20501:4','2026-10-23 19:15:00-05',NULL)
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.escrow_vault(order_id,seller_id,retained_amount,status)
VALUES ('MC-20501','seller-330',245000,'AWAITING_DELIVERY')
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO public.escrow_vault(order_id,seller_id,retained_amount,status,retention_started_at,auto_release_at,released_at,dispute_id,dispute_reason,dispute_registered_at,accounting_notified)
VALUES
('MC-20481','seller-901',320000,'AWAITING_DELIVERY',NULL,NULL,NULL,NULL,NULL,NULL,FALSE),
('MC-20397','seller-504',185000,'RETAINED',NOW()-INTERVAL '20 hours',NOW()+INTERVAL '52 hours',NULL,NULL,NULL,NULL,FALSE),
('MC-20479','seller-312',410000,'RELEASED',NOW()-INTERVAL '80 hours',NOW()-INTERVAL '8 hours',NOW()-INTERVAL '8 hours',NULL,NULL,NULL,TRUE),
('MC-20463','seller-780',1450000,'FROZEN_DISPUTE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '48 hours',NULL,'PQR-DEMO-20463','Reclamo sintético de demostración',NOW()-INTERVAL '1 hour',FALSE)
 ,('MC-20480','seller-880',87000,'AWAITING_DELIVERY',NULL,NULL,NULL,NULL,NULL,NULL,FALSE)
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO public.accounting_outbox(order_id,event_type,idempotency_key,payload,delivery_status,delivered_at)
VALUES
('MC-20479','FundsReleased','demo:release:MC-20479','{"order_id":"MC-20479","amount":410000,"seller_id":"seller-312","demo":true}'::jsonb,'DELIVERED',NOW()-INTERVAL '8 hours'),
('MC-20463','FundsFrozen','demo:freeze:MC-20463','{"order_id":"MC-20463","amount":1450000,"dispute_id":"PQR-DEMO-20463","demo":true}'::jsonb,'PENDING',NULL)
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.notification_logs(order_id,event_type,recipient_id,channel,delivery_status,source_event_key,payload)
VALUES
('MC-20481','EstadoCambiado','buyer-001','Push','PENDING','demo:notification:MC-20481:en-reparto','{"status":"En reparto","demo":true}'::jsonb),
('MC-20463','PQRAbierta','buyer-003','Push','PENDING','demo:notification:MC-20463:pqr','{"status":"Incidencia","demo":true}'::jsonb)
ON CONFLICT (source_event_key) DO NOTHING;

-- No se inserta una evidencia fotográfica falsa: las evidencias deben cargarse
-- mediante la aplicación a Storage privado para probar URL firmada e integridad.
