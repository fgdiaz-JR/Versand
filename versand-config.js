/* URLs públicas de los servicios. En desarrollo local se usan los puertos
 * habituales; en GitHub Pages se conectan los servicios de Render. */
const versandIsLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
window.VERSAND_API_BASES = window.VERSAND_API_BASES || (versandIsLocal ? {
  operations: "http://localhost:4001",
  buyer: "http://localhost:4002"
} : {
  operations: "https://versand-seguimiento-operator-fgdia-jr.onrender.com",
  buyer: "https://versand-seguimiento-buyer-fgdia-jr.onrender.com"
});
