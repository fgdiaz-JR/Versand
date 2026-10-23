PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS team_contracts (
  team_code TEXT PRIMARY KEY,
  module_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RECEIVED','REVIEW','APPROVED')),
  required_deliverables_json TEXT NOT NULL,
  received_at TEXT,
  owner_contact TEXT,
  notes TEXT NOT NULL DEFAULT 'Pendiente de entrega del equipo.',
  is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo = 1)
);

CREATE TABLE IF NOT EXISTS integration_fixtures (
  fixture_id TEXT PRIMARY KEY,
  team_code TEXT NOT NULL REFERENCES team_contracts(team_code),
  scenario TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  headers_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT NOT NULL,
  expected_status INTEGER NOT NULL,
  expected_effect TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo = 1)
);

INSERT INTO team_contracts(team_code,module_name,required_deliverables_json) VALUES
('1','Envíos, operadores y transportadora','["OpenAPI 3.0/3.1","asignación de operador, transportadora, guía única y SLA","webhook de estados con event_id","HMAC-SHA256: header y firma del cuerpo","muestras éxito, error, duplicado y firma inválida","formato de etiqueta PDF"]'),
('2','Billetera, Escrow y PQR','["OpenAPI 3.0/3.1","estados y transiciones de custodia","regla exacta de retención 72h","contrato PQR congelar, resolver y descongelar","muestras de conflicto e idempotencia"]'),
('3','Notificaciones','["OpenAPI 3.0/3.1","canales y plantillas Push/WhatsApp/SMS","respuesta y provider_message_id","definición de medición SLA <5s","timeout, retry y duplicados"]'),
('6','Contabilidad','["OpenAPI 3.0/3.1","endpoint FundsFrozen/FundsReleased","auth servicio a servicio","idempotencia y conciliación","respuestas de aceptación, rechazo y error temporal"]'),
('8','Checkout y pedidos (dependencia)','["OpenAPI 3.0/3.1","evento OrderPaid","datos mínimos de comprador, vendedor, destino e importe","moneda, fecha UTC e idempotencia","firma/autenticidad y reintentos"]')
ON CONFLICT(team_code) DO NOTHING;

INSERT INTO integration_fixtures(fixture_id,team_code,scenario,method,path,headers_json,payload_json,expected_status,expected_effect) VALUES
('demo-team8-order-paid','8','Pago aprobado; crea pedido y Escrow','POST','/api/integrations/order-paid','{"Authorization":"Bearer <INTEGRATION_SHARED_SECRET>","Content-Type":"application/json"}','{"id":"TST-80001","order_number":"TEST-PAID-80001","customer_id":"buyer-demo","customer_name":"Comprador Prueba","customer_email":"buyer@example.test","seller_id":"seller-demo","destination_city":"Bogota, Colombia","destination_address":"Direccion sintetica 123","product_name":"Producto de prueba","total_amount":99000,"sla_hours":24}',201,'Pedido confirmado, evento OrderPaid y Escrow AWAITING_DELIVERY'),
('demo-team1-shipping','1','Asignación de envío; respuesta a confirmar','POST','/api/integrations/shipping-assigned','{"Authorization":"Bearer <INTEGRATION_SHARED_SECRET>","Content-Type":"application/json"}','{"order_id":"TST-80001","carrier":"Transportadora Demo","tracking_number":"TEST-GUIDE-80001","sla_hours":24,"operator_id":"operator-demo"}',200,'Guía única y ETA en pedido'),
('demo-carrier-event','1','Evento webhook válido; firma se calcula en runtime','POST','/api/webhooks/carrier','{"x-carrier-signature":"sha256=<FIRMA_GENERADA_EN_RUNTIME>","Content-Type":"application/json"}','{"event_id":"test-event-80001-1","order_id":"TST-80001","tracking_number":"TEST-GUIDE-80001","status":"En tránsito","location":"Centro de pruebas","occurred_at":"2026-10-22T12:00:00Z"}',200,'Evento de seguimiento idempotente y cambio de estado'),
('demo-team3-notification','3','Notificación; respuesta del proveedor pendiente','POST','/api/integrations/notify','{"Authorization":"Bearer <INTEGRATION_SHARED_SECRET>","Content-Type":"application/json"}','{"order_id":"TST-80001","event_type":"EstadoCambiado","recipient_id":"buyer-demo","channel":"Push","payload":{"status":"En tránsito"}}',200,'Registro pendiente; proveedor debe devolver ID y resultado'),
('demo-team2-pqr','2','PQR congela custodia retenida','POST','/api/orders/TST-80001/dispute','{"Authorization":"Bearer <SESION_COMPRADOR>"}','{"reason":"Caso sintético de prueba"}',200,'Estado FROZEN_DISPUTE y FundsFrozen en outbox'),
('demo-team6-accounting','6','Acuse de contabilidad; endpoint definitivo pendiente','POST','/api/accounting/events','{"Authorization":"Bearer <CREDENCIAL_DE_PRUEBA>"}','{"event_id":"demo-freeze-80001","type":"FundsFrozen","order_id":"TST-80001","amount":99000,"currency":"COP","idempotency_key":"freeze:TST-80001:PQR-DEMO"}',202,'El receptor confirma aceptación e idempotencia'),
('demo-team1-bad-signature','1','Transportadora con firma inválida','POST','/api/webhooks/carrier','{"x-carrier-signature":"sha256:invalid"}','{"event_id":"test-event-bad-signature","order_id":"TST-80001","status":"Entregado"}',401,'No cambia pedido ni agrega evento')
ON CONFLICT(fixture_id) DO NOTHING;
