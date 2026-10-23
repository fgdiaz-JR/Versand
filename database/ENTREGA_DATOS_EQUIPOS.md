# Entrega de contratos y datos de prueba por equipo

## Estado

Hasta el 22 de octubre de 2026 no se han recibido contratos técnicos de los equipos 1, 3, 2 y 6. Este documento define lo que falta para conectar sus módulos al seguimiento. La base local `database/local_test_data.sqlite` contiene fixtures sintéticos y registros de entrega pendientes; no representa contratos aprobados.

## Cómo entregar la información

Cada grupo debe enviar un paquete versionado con esta estructura:

```text
equipo-<n>-v1/
  README.md                 # responsable, versión, fecha, ambiente y contacto
  openapi.yaml              # OpenAPI 3.0/3.1, rutas, headers, auth y respuestas
  test-cases.md             # flujo feliz, errores, reintentos e idempotencia
  samples/
    request.json            # solicitud sintética
    success.json            # respuesta sintética
    error-4xx.json          # error funcional
    error-5xx.json          # error temporal
```

Entrega en la carpeta compartida oficial del proyecto o como ZIP adjunto. Incluyan el número de equipo y versión en el nombre. El responsable de integración registra la fecha y valida el paquete antes de modificar contratos o datos semilla.

No envíen contraseñas, tokens, claves privadas, firmas válidas ni datos personales reales en el repositorio, capturas, chat o muestras. Para credenciales, indiquen solo el mecanismo y nombre de variable requerido; el valor se configura por `.env` local o un gestor seguro. Anonimicen correos, teléfonos, direcciones e identificadores de pago.

## Información común obligatoria

- URL base por ambiente (local/pruebas), método y ruta; OpenAPI ejecutable.
- Autenticación, headers, permisos, formato de fecha/hora UTC y moneda.
- JSON válido de solicitud, éxito y errores, con campos requeridos y opcionales.
- Clave idempotente, duplicados y efecto esperado cuando se reintenta.
- Timeout, cantidad/pausa de reintentos, SLA y cómo se mide.
- Al menos un caso normal, uno inválido, uno duplicado y uno de indisponibilidad.
- Persona responsable y cómo notificar cambios incompatibles.

## Entrega de cada equipo

### Equipo 1 — Envíos, operadores y transportadora

Enviar contrato de pedido listo para despacho y asignación: `order_id`, número de pedido, vendedor, comprador, destino, producto, valor, transportadora, operador asignado, SLA en horas y guía única. Definir si etiqueta PDF se entrega como archivo, URL temporal o se genera en este módulo; indicar dimensiones/plantilla y campos obligatorios.

Para eventos de la transportadora, documentar URL y método del webhook, estados permitidos, `event_id` único, `order_id`, guía, estado, ubicación, nota y `occurred_at` UTC. Especificar HMAC-SHA256 sobre el cuerpo HTTP exacto, nombre/formato del header de firma, rotación de secreto, respuestas, duplicados y reintentos. Nunca incluir el secreto, solo el nombre acordado de variable. Proveer casos: evento válido, firma incorrecta, guía inexistente, evento duplicado y transición inválida.

### Equipo 3 — Notificaciones

Definir evento de entrada, identificador del destinatario, canales soportados (Push/WhatsApp/SMS), plantilla y variables, consentimiento requerido, respuesta del proveedor (`provider_message_id`, resultado y hora), errores reintentables y definitivos. Aclarar quién mide el requisito de entrega menor a 5 segundos (desde recepción del evento hasta aceptación o entrega del proveedor) y aportar muestras de éxito, timeout, rechazo y duplicado.

### Equipo 2 — Billetera/Escrow y PQR

Documentar creación y consulta de retención, monto/moneda, vendedor, momento inicial de las 72 horas, precisión de vencimiento, identificador de PQR y flujo de congelar/descongelar/resolver. Definir estados permitidos, reglas de transición, respuesta y casos de conflicto (custodia vencida, inexistente o ya liberada). Enviar datos sintéticos que permitan probar custodia abierta, retenida y congelada.

### Equipo 6 — Contabilidad

Definir endpoint receptor de `FundsFrozen` y `FundsReleased`, autenticación entre servicios, campos contables, moneda, referencia única e idempotencia. Especificar respuesta de aceptación, rechazo funcional, indisponibilidad, conciliación y política de reintentos. Indicar cómo se consulta y confirma la recepción para que el outbox no marque como entregado antes de tiempo. Enviar muestras JSON y escenarios de duplicado/reconciliación.

### Equipo 8 — Checkout/Pedidos (dependencia de integración)

Aunque no está pendiente entre los equipos consultados, el disparador necesita contrato de `OrderPaid`: identificador estable de pedido, referencia, comprador, vendedor, destino, producto, monto y moneda, fecha UTC de pago y clave idempotente. Adjuntar confirmación firmada o mecanismo de autenticidad, respuesta, reintentos y casos de pago rechazado/duplicado.

## Contrato vigente del módulo

La propuesta de endpoints y cuerpos iniciales está en [CONTRATOS_INTEGRACION_V1.md](CONTRATOS_INTEGRACION_V1.md). Es una base para revisión y no sustituye la aprobación de cada equipo. Registrar cambios como nueva versión y actualizar los fixtures antes de dar por validada una integración.
