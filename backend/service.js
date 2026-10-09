const http = require("node:http");

const role = process.argv[2];
const configuration = {
  operator: {
    port: 4001,
    path: "/api/auth/operator",
    user: { id: "op-001", name: "Equipo Versand", email: "operaciones@versand.co", role: "operator" }
  },
  buyer: {
    port: 4002,
    path: "/api/auth/buyer",
    user: { id: "buyer-001", name: "Laura Gómez", email: "laura.gomez@versand.co", role: "buyer" }
  }
}[role];

if (!configuration) {
  console.error("Uso: node backend/service.js operator|buyer");
  process.exit(1);
}

const responses = {
  operator: {
    kpis: { totalDeliveries: 842, onTimeRate: 94.6, averageDays: 2.8, openIncidents: 3 },
    recentActivity: [
      { id: "MC-20481", customer: "Laura Gómez", carrier: "Mercado Express", status: "En reparto", updated: "Hace 8 min" },
      { id: "MC-20479", customer: "Andrés Rojas", carrier: "Ruta Segura", status: "Entregado", updated: "Hace 21 min" },
      { id: "MC-20463", customer: "Sofía Martínez", carrier: "Mercado Express", status: "Incidencia", updated: "Hace 23 min" }
    ]
  },
  buyer: {
    orders: [
      {
        id: "MC-20481",
        tracking: "MCX-908172",
        product: "Audífonos inalámbricos",
        status: "En reparto",
        estimatedDelivery: "Hoy, entre 4:00 y 6:00 PM",
        lastLocation: "Centro Norte",
        updated: "Hace 8 min",
        timeline: [
          { status: "Pedido confirmado", date: "3 oct · 9:42 AM", completed: true },
          { status: "En tránsito", date: "4 oct · 7:25 AM · Centro Norte", completed: true },
          { status: "En reparto", date: "Hoy · 3:16 PM · Bogotá", current: true },
          { status: "Entregado", date: "Pendiente", completed: false }
        ]
      },
      { id: "MC-20397", tracking: "MCX-907414", product: "Kit de café artesanal", status: "Entregado", estimatedDelivery: "2 oct 2026", updated: "2 oct 2026" }
    ]
  }
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("JSON inválido")); }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return sendJson(response, 204, {});
  if (request.url === "/health") return sendJson(response, 200, { service: role, status: "ok", port: configuration.port });
  if (request.method === "POST" && request.url === configuration.path) {
    try {
      const credentials = await readBody(request);
      if (!credentials.email || !credentials.password) return sendJson(response, 400, { authenticated: false, message: "Correo y contraseña son obligatorios" });
      return sendJson(response, 200, { authenticated: true, token: `demo-${role}-token`, user: configuration.user, service: role });
    } catch (error) {
      return sendJson(response, 400, { authenticated: false, message: error.message });
    }
  }
  if (request.method === "GET" && request.url === `/api/${role}/dashboard`) return sendJson(response, 200, responses[role]);
  return sendJson(response, 404, { message: "Ruta no encontrada" });
});

server.listen(configuration.port, "127.0.0.1", () => {
  console.log(`[${role}] escuchando en http://localhost:${configuration.port}`);
});
