/* Configuración pública del navegador. Nunca poner secretos aquí. En producción
 * se pueden indicar los dos endpoints HTTPS antes de cargar versand-auth.js. */
window.VERSAND_API_BASES = window.VERSAND_API_BASES || {
  operations: "http://localhost:4001",
  buyer: "http://localhost:4002"
};
