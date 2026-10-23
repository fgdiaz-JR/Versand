# Versand — Módulo de Seguimiento

Aplicación web para que compradores consulten sus pedidos y operadores gestionen despacho, trazabilidad y novedades de entrega. El frontend estático y dos servicios Node.js consumen Supabase Auth, PostgreSQL y Storage.

## Funcionalidad implementada

- **Acceso por rol:** inicio de sesión con correo y contraseña de Supabase Auth; el backend valida JWT y perfil activo de comprador u operador.
- **Comprador:** lista de pedidos propios, búsqueda, detalle, historial cronológico de eventos y fecha estimada según transportadora/SLA.
- **Operador:** tablero de pedidos, cola de envíos pendientes y asignación de transportadora, guía única y SLA.
- **Etiqueta:** genera y descarga directamente un PDF con datos de envío desde el navegador.
- **Eventos externos:** endpoint de webhook de transportadora con firma HMAC SHA-256, validación e idempotencia.
- **Escrow:** custodia de fondos, ventana de 72 horas tras entrega, liberación de vencidos y congelamiento al abrir PQR; eventos contables se encolan en outbox.
- **Evidencia de entrega:** recepción de foto, GPS, precisión, fecha y hash; objeto en bucket privado y URL firmada de corta duración.
- **Integraciones:** endpoints autenticados para pago/creación de pedido, envío asignado, notificación y consulta de auditoría contable.
- **Interfaz:** paneles responsive, tema claro/oscuro, consulta de estado, actividad y exportación CSV.

Las notificaciones Push y la entrega de eventos contables no se consideran completadas por quedar en `PENDING`: faltan conectar los proveedores y acordar sus callbacks. La evidencia registra datos del dispositivo; el hash verifica integridad del archivo recibido, no certifica que el GPS o la hora sean auténticos.

## Arquitectura

- HTML/CSS/JavaScript estático: `index.html`, `comprador.html`, `operador.html`, `versand-auth.js`, `versand-mvp.js`, `versand.css` y `versand-config.js`.
- Node.js sin dependencias npm de terceros. `npm start` inicia el servicio de operador en el puerto 4001 y el de comprador en el 4002.
- Supabase Auth verifica usuarios; el backend accede a Postgres/Storage con la clave secreta de servidor. Esa clave nunca debe incluirse en archivos del navegador.
- `database/schema.sql` y `database/migrations/` contienen el esquema, restricciones, funciones RPC, permisos y perfiles requeridos. Aplicar primero el esquema y luego las migraciones numeradas en orden. El seed y la provisión de cuentas demo están en `testing/`; son exclusivamente para desarrollo y no deben ejecutarse en producción.

## Ejecución local

1. Usar Node.js 18 o superior y copiar `.env.example` como `.env`.
2. Completar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, secretos de webhook/integración y orígenes locales autorizados.
3. Aplicar `database/schema.sql` y luego `database/migrations/001_integracion_transaccional.sql`, `002_security_and_fk_indexes.sql` y `003_auth_user_profiles.sql`, en ese orden. Configurar el bucket privado indicado por `SUPABASE_EVIDENCE_BUCKET`.
4. Ejecutar `npm start`.
5. Servir la raíz como sitio estático (por ejemplo, en `http://localhost:5500`) y abrir `index.html`.

Las cuentas de producción deben existir en Supabase Auth y tener perfiles correctos en `app_user_profiles`. `testing/` contiene cuentas/órdenes de demostración y fixtures; solo deben usarse en entornos de prueba. Nunca se despliega el seed ni se configura la provisión de usuarios demo en producción.

## Despliegue

El archivo render.yaml define los servicios web de operador y comprador para conectarlos al repo desde Render. En Render, crear un Blueprint desde el repositorio y completar en ambos servicios SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, CARRIER_WEBHOOK_SECRET e INTEGRATION_SHARED_SECRET. El Blueprint configura PORT, enlaza en 0.0.0.0, verifica /api/health y autoriza como origen https://fgdia-jr.github.io.

Después de crear los servicios, copiar sus URLs HTTPS asignadas a `versand-config.js` (claves `operations` y `buyer`) y publicar el cambio en GitHub Pages. Mantener el servicio de operador activo para el ciclo de liberación Escrow; en un plan que suspenda instancias por inactividad, la tarea puede retrasarse. Para alta disponibilidad, moverla a un worker con exclusión distribuida antes de escalar réplicas.

Antes de aceptar tráfico real: rotar y gestionar secretos en el gestor del proveedor, habilitar HTTPS, aplicar migraciones revisadas, configurar backups/alertas, crear cuentas con mínimo privilegio, probar restauración y completar acuerdos e integración real con Equipos 1, 2, 3, 6 y 8. El estado actual implementa las rutas y flujos internos, pero las notificaciones Push y callbacks de Contabilidad siguen dependiendo de servicios externos pendientes.
