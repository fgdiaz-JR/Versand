# Evidencia de validación de flujos internos

## Fixtures de desarrollo

- fixtures/supabase-demo-seed.sql: pedidos de demostración sintéticos; aplicar solo en un proyecto Supabase de desarrollo.
- fixtures/local_test_data.sql: datos locales sintéticos para probar contratos; el archivo SQLite generado se excluye.
- provision-demo-users.js: utilidad administrativa para cuentas demo; lee .env en la raíz y nunca debe ejecutarse en producción.

Ejecución: 22 de octubre de 2026, navegador Chrome local contra los servicios Versand y el proyecto Supabase configurado.

## Capturas

- `01-roles.png`: autenticación de comprador/operador y alcance por rol.
- `02-timeline.png` y `10-linea-tiempo-eta.png`: historial y ETA HU-01; la segunda es la vista del pedido en la aplicación.
- `03-unique-guide.png`: rechazo de guía duplicada y aceptación de una guía única.
- `04-webhook.png`: HMAC inválido (401), válido (200) y reenvío idempotente sin evento duplicado.
- `05-push-queue.png`: el evento se encola; el estado queda `PENDING` porque falta el proveedor externo.
- `06-pqr-freeze.png`: PQR congela la custodia y crea `FundsFrozen` en el outbox.
- `07-escrow-release.png`: entrega inicia Escrow y se simula el vencimiento de 72 horas adelantando la fecha solo en un pedido temporal.
- `08-evidence.png` y `13-evidencia-en-detalle.png`: carga de imagen sintética, GPS, hash, URL privada y vista del detalle.
- `09-comprador-dashboard.png` y `12-operador-dashboard.png`: vistas reales autenticadas durante la ejecución.
- `09-pdf-download.png` y `11-descarga-pdf.png`: resultado de descarga y pantalla de la aplicación; el PDF descargado está en `descargas/etiqueta-MCX-908172.pdf`.
- `10-ui-roles-pdf-evidence.png`: resumen de vistas, evidencia y descarga.

Los detalles y horas de ejecución están en `resultados.json`. La imagen `demo-package.png` es un fixture sintético utilizado para la prueba de evidencia. El reporte navegable está en `reporte.html`.

## Datos para presentación

Supabase conserva cuatro pedidos de demostración de los flujos ya probados y un quinto pedido, `MC-20480`, para mostrar el flujo de despacho. El comprador demo (`buyer-001`) ve tres pedidos: uno listo para despacho, uno en reparto y uno entregado. El operador ve los cinco pedidos, incluida la cola de asignación de guía para `MC-20480`. Desde la sesión de operador se puede abrir la asignación, registrar una guía y luego consultar el avance desde la sesión del comprador. Las credenciales están en las variables `VERSAND_DEMO_*_EMAIL` y `VERSAND_DEMO_*_PASSWORD` del `.env` local.

## Limpieza

Los cuatro pedidos temporales, sus eventos y su evidencia se eliminaron de Supabase al cerrar la ejecución. La consulta final verificó 0 pedidos/eventos/evidencias `TST-*` y en esa ejecución permanecían 4 pedidos demo `MC-*`. Después se añadió `MC-20480` para la presentación. Las capturas y el PDF se conservan como evidencia.

Para repetir: con el backend (`npm start`) y el servidor estático en el puerto 5500 activos, ejecutar `node testing/validar-flujos.js`. La corrida requiere acceso de red a Supabase y elimina los registros con prefijo temporal creados por ella.
