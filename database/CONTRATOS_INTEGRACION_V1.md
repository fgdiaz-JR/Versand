# Contratos de integración v1 — Versand

Estado: **borrador para acordar con los Equipos 1, 2, 3, 6 y 8**. Los endpoints marcados como implementados reflejan el backend actual; este documento no afirma que los sistemas externos ya estén conectados.

## Convenciones

- JSON UTF-8 sobre HTTPS.
- Las llamadas de sistema a `/api/integrations/*` requieren `Authorization: Bearer <INTEGRATION_SHARED_SECRET>`.
- Una respuesta `202` significa aceptado para procesamiento, no entregado al destinatario.
- El emisor debe reintentar `408`, `429` y `5xx` con espera exponencial y conservar la misma clave de idempotencia. No reintentar errores permanentes `4xx` sin corregir el payload.
- No incluir datos de tarjeta ni secretos dentro del payload. Usar identificadores estables de pedido, evento y destinatario.

## Equipo 8 — confirmación de pago

`POST /api/integrations/order-paid` (implementado)

```json
{
  "order_id": "MC-20481",
  "order_number": "ORD-2026-8812",
  "customer_id": "buyer-001",
  "customer_name": "Laura Gómez",
  "customer_phone": "+573105550192",
  "customer_email": "laura@example.co",
  "seller_id": "seller-901",
  "items": [{ "name": "Audífonos" }],
  "total_amount": 320000,
  "city": "Bogotá, Colombia",
  "address": "Dirección de entrega",
  "sla_hours": 48
}
```

Respuesta `201`: crea de forma idempotente el pedido pagado, el primer evento de seguimiento y una custodia `AWAITING_DELIVERY`. Debe enviarse solo después de confirmar el pago. `409` indica conflicto con datos previamente registrados.

## Equipo 1 — guía y transportadora

`POST /api/integrations/shipping-assigned` (implementado)

```json
{
  "order_id": "MC-20481",
  "carrier": "Mercado Express",
  "tracking_number": "MCX-908172",
  "sla_hours": 24
}
```

Respuesta `200`: pedido actualizado y evento `Preparado` insertado en la misma operación SQL. `409` si el pedido no está pendiente de despacho o la guía está duplicada.

## Transportadora — actualización de seguimiento

`POST /api/webhooks/carrier` (implementado en el servicio de operador)

Encabezado `x-carrier-signature: sha256=<hex HMAC-SHA256 del cuerpo HTTP exacto>`. Estados permitidos: `Preparado`, `En tránsito`, `En reparto`, `Entregado`, `Incidencia`. Payload mínimo:

```json
{
  "tracking_number": "MCX-908172",
  "status": "En tránsito",
  "location": "Centro de clasificación",
  "note": "Paquete recibido en centro",
  "event_id": "carrier-event-123",
  "occurred_at": "2026-10-22T16:00:00Z"
}
```

El backend actual deduplica por SHA-256 del cuerpo completo y encola una notificación. **Pendiente de acordar:** identificador estable `event_id`, formato/algoritmo exacto de firma, tolerancia de antigüedad, estados, zona horaria y si la transportadora entrega un timestamp de evento confiable.

## Equipo 3 — notificaciones

`POST /api/integrations/notify` (implementado como encolado, no despacho)

```json
{
  "order_id": "MC-20481",
  "customer_id": "buyer-001",
  "event_type": "EstadoCambiado",
  "channel": "Push",
  "idempotency_key": "carrier-event-123",
  "payload": {
    "orderId": "MC-20481",
    "trackingNumber": "MCX-908172",
    "oldStatus": "Preparado",
    "newStatus": "En tránsito",
    "location": "Centro de clasificación",
    "timestamp": "2026-10-22T16:00:00Z"
  }
}
```

Respuesta `202`: guardado en `notification_logs` con estado `PENDING`. **Pendiente de contrato y desarrollo:** URL/protocolo de despacho, autenticación del proveedor, identificador externo, callbacks de éxito/fallo, política de reintento y significado de latencia `Push < 5 s`.

## Equipos 2 y 6 — Contabilidad y PQR

`GET /api/integrations/accounting/audit` entrega un resumen para conciliación (implementado). La apertura de PQR se realiza en el servicio de comprador y crea un evento `FundsFrozen` en `accounting_outbox`; la liberación vencida crea `FundsReleased` (implementado en la base de datos).

**Pendiente de contrato y desarrollo:** endpoint de recepción de outbox, autenticación, acuse/callback correlacionado por `idempotency_key`, estados de aceptación/rechazo y política para reintentos. El estado `PENDING` actual no prueba entrega a Contabilidad.

## Códigos y observabilidad

- `400`: payload inválido; `401`: firma/Bearer inválido; `404`: pedido o guía desconocidos; `409`: conflicto de estado o unicidad; `413`: cuerpo demasiado grande; `502/503`: dependencia remota no disponible o no configurada.
- Correlacionar solicitudes con `order_id`, `event_id`/`idempotency_key` y la marca de tiempo UTC.
- Los tiempos HTTP de aceptación no deben reportarse como tiempo de entrega de notificación. Medirlo con el acuse real del proveedor.
