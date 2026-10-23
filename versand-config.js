/* URLs públicas de los servicios; no contienen secretos. Tras crear los
 * servicios del Blueprint de Render, sustituir "" por las URLs asignadas.
 * En desarrollo local se mantienen los puertos habituales. */
const versandIsLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
window.VERSAND_API_BASES = window.VERSAND_API_BASES || (versandIsLocal ? {
  operations: "http://localhost:4001",
  buyer: "http://localhost:4002"
} : {
  operations: "",
  buyer: ""
});
