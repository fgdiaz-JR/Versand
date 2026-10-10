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

// Cálculo dinámico de fecha estimada según fecha base y transportadora (Sprint 2)
function calculateEstimatedDelivery(order) {
  if (order.status === "Entregado") {
    return order.deliveredAt || "2 oct 2026 · 4:18 PM";
  }
  if (order.status === "Incidencia") {
    return "Reprogramación estimada: 24h tras contacto con cliente";
  }
  if (order.status === "En reparto") {
    return "Hoy, entre 4:00 y 6:00 PM (En ruta activa)";
  }

  const baseDate = new Date(order.createdAt || Date.now());
  const slaHours = order.carrier === "Mercado Express" ? 24 : order.carrier === "Ruta Segura" ? 48 : 72;
  const deliveryDate = new Date(baseDate.getTime() + slaHours * 3600 * 1000);
  
  const options = { weekday: "short", day: "numeric", month: "short" };
  const dateStr = deliveryDate.toLocaleDateString("es-ES", options);
  return `${dateStr}, entre 2:00 y 6:00 PM (SLA: ${slaHours}h)`;
}

// Generación dinámica de la línea de tiempo según estado del pedido (Sprint 2)
function buildDynamicTimeline(order) {
  const stepsDefinition = [
    { key: "confirmed", title: "Pedido confirmado", note: "Pago y orden validados correctamente", defaultTime: "3 oct · 9:42 AM" },
    { key: "prepared", title: "Preparado en bodega", note: `Empaquetado y rotulado con guía ${order.tracking}`, defaultTime: "3 oct · 2:15 PM" },
    { key: "transit", title: "En tránsito", note: "Hub regional hacia estación local", defaultTime: "4 oct · 7:25 AM" },
    { key: "delivering", title: "En reparto", note: "Asignado a mensajero express en ruta", defaultTime: "Hoy · 3:16 PM" },
    { key: "delivered", title: "Entregado", note: "Recibido a satisfacción con comprobante", defaultTime: "Hoy · 4:18 PM" }
  ];

  let currentStepIndex = 0;
  if (order.status === "Confirmado") currentStepIndex = 0;
  else if (order.status === "Preparado") currentStepIndex = 1;
  else if (order.status === "En tránsito") currentStepIndex = 2;
  else if (order.status === "En reparto") currentStepIndex = 3;
  else if (order.status === "Entregado") currentStepIndex = 4;
  else if (order.status === "Incidencia") currentStepIndex = 3;

  return stepsDefinition.map((step, index) => {
    let status = "pending";
    let time = "Pendiente";

    if (index < currentStepIndex || (order.status === "Entregado" && index <= currentStepIndex)) {
      status = "done";
      time = step.defaultTime;
    } else if (index === currentStepIndex) {
      if (order.status === "Incidencia") {
        status = "current";
        time = "Hoy · Alerta activa";
        step.title = "Incidencia en reparto";
        step.note = "Dirección o acceso requiere verificación telefónica";
      } else {
        status = "current";
        time = step.defaultTime;
      }
    }

    return {
      title: step.title,
      time,
      note: step.note,
      status
    };
  });
}

// Almacén central de pedidos con guías registradas
const ordersStore = [
  {
    id: "MC-20481",
    tracking: "MCX-908172",
    customer: "Laura Gómez",
    carrier: "Mercado Express",
    product: "Audífonos inalámbricos",
    status: "En reparto",
    destination: "Bogotá, Colombia",
    address: "Calle 127 # 19-45, Apto 502",
    createdAt: "2026-10-06T09:42:00Z",
    updated: "Hace 8 min",
    lastLocation: "Centro Norte, Bogotá"
  },
  {
    id: "MC-20479",
    tracking: "MCX-908055",
    customer: "Andrés Rojas",
    carrier: "Ruta Segura",
    product: "Teclado mecánico RGB",
    status: "Entregado",
    destination: "Medellín, Colombia",
    address: "Carrera 43A # 1 Sur-220",
    createdAt: "2026-10-01T10:00:00Z",
    deliveredAt: "2 oct 2026 · 2:45 PM",
    updated: "Hace 21 min",
    lastLocation: "Poblado, Medellín"
  },
  {
    id: "MC-20397",
    tracking: "MCX-907441",
    customer: "Laura Gómez",
    carrier: "Mercado Express",
    product: "Kit de café artesanal",
    status: "Entregado",
    destination: "Bogotá, Colombia",
    address: "Calle 127 # 19-45, Apto 502",
    createdAt: "2026-09-30T11:00:00Z",
    deliveredAt: "2 oct 2026 · 4:18 PM",
    updated: "2 oct 2026",
    lastLocation: "Bogotá, Colombia"
  },
  {
    id: "MC-20463",
    tracking: "MCX-907990",
    customer: "Sofía Martínez",
    carrier: "Mercado Express",
    product: "Monitor 27 pulgadas 4K",
    status: "Incidencia",
    destination: "Cali, Colombia",
    address: "Avenida 6N # 28N-40",
    createdAt: "2026-10-05T08:30:00Z",
    updated: "Hace 23 min",
    lastLocation: "Hub Yumbo, Valle"
  }
];

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  const reqUrl = new URL(request.url, `http://localhost:${configuration.port}`);

  if (request.method === "OPTIONS") return sendJson(response, 204, {});
  if (reqUrl.pathname === "/health") return sendJson(response, 200, { service: role, status: "ok", port: configuration.port });

  // Autenticación
  if (request.method === "POST" && reqUrl.pathname === configuration.path) {
    try {
      const credentials = await readBody(request);
      if (!credentials.email || !credentials.password) {
        return sendJson(response, 400, { authenticated: false, message: "Correo y contraseña son obligatorios" });
      }
      return sendJson(response, 200, { authenticated: true, token: `demo-${role}-token`, user: configuration.user, service: role });
    } catch (error) {
      return sendJson(response, 400, { authenticated: false, message: error.message });
    }
  }

  // Validación de unicidad de guías (Sprint 2 - Must Have)
  if (request.method === "GET" && reqUrl.pathname === "/api/tracking/validate") {
    const tracking = reqUrl.searchParams.get("tracking")?.trim().toUpperCase();
    if (!tracking) {
      return sendJson(response, 400, { valid: false, message: "Debe proporcionar un número de guía" });
    }
    const existing = ordersStore.find((o) => o.tracking.toUpperCase() === tracking);
    if (existing) {
      return sendJson(response, 200, {
        valid: false,
        message: `La guía ${tracking} ya se encuentra registrada en el pedido #${existing.id} (${existing.product}). Las guías deben ser únicas.`,
        existingOrderId: existing.id
      });
    }
    return sendJson(response, 200, { valid: true, message: `La guía ${tracking} está disponible y es única.` });
  }

  // Consulta de todos los pedidos con cálculo de fecha estimada y timeline dinámico (Sprint 2)
  if (request.method === "GET" && reqUrl.pathname === "/api/orders") {
    const enrichedOrders = ordersStore.map((order) => ({
      ...order,
      estimatedDelivery: calculateEstimatedDelivery(order),
      timeline: buildDynamicTimeline(order)
    }));
    return sendJson(response, 200, enrichedOrders);
  }

  // Registro y asociación de nueva guía con validación estricta de unicidad (Sprint 2)
  if (request.method === "POST" && reqUrl.pathname === "/api/orders") {
    try {
      const newOrder = await readBody(request);
      if (!newOrder.tracking || !newOrder.id) {
        return sendJson(response, 400, { success: false, message: "Número de pedido y número de guía son obligatorios" });
      }

      const trackingUpper = newOrder.tracking.trim().toUpperCase();
      const existing = ordersStore.find((o) => o.tracking.toUpperCase() === trackingUpper);
      if (existing) {
        return sendJson(response, 409, {
          success: false,
          message: `Conflicto: La guía ${trackingUpper} ya está asociada al pedido #${existing.id}. No se permiten guías duplicadas.`
        });
      }

      const createdOrder = {
        id: newOrder.id.trim().toUpperCase(),
        tracking: trackingUpper,
        customer: newOrder.customer || "Cliente Versand",
        carrier: newOrder.carrier || "Mercado Express",
        product: newOrder.product || "Paquete Estándar",
        status: newOrder.status || "En tránsito",
        destination: newOrder.destination || "Bogotá, Colombia",
        address: newOrder.address || "Dirección registrada",
        createdAt: new Date().toISOString(),
        updated: "Hace un momento",
        lastLocation: "Centro de Despacho Principal"
      };

      ordersStore.unshift(createdOrder);

      return sendJson(response, 201, {
        success: true,
        message: "Guía única validada y registrada correctamente",
        order: {
          ...createdOrder,
          estimatedDelivery: calculateEstimatedDelivery(createdOrder),
          timeline: buildDynamicTimeline(createdOrder)
        }
      });
    } catch (err) {
      return sendJson(response, 500, { success: false, message: err.message });
    }
  }

  // Dashboard de operador
  if (request.method === "GET" && reqUrl.pathname === "/api/operator/dashboard") {
    return sendJson(response, 200, {
      kpis: {
        totalDeliveries: 842 + (ordersStore.length - 4),
        onTimeRate: 94.6,
        averageDays: 2.8,
        openIncidents: ordersStore.filter((o) => o.status === "Incidencia").length
      },
      recentActivity: ordersStore.map((o) => ({
        id: o.id,
        customer: o.customer,
        carrier: o.carrier,
        status: o.status,
        updated: o.updated
      }))
    });
  }

  // Dashboard de comprador
  if (request.method === "GET" && reqUrl.pathname === "/api/buyer/dashboard") {
    const buyerOrders = ordersStore
      .filter((o) => o.customer === "Laura Gómez" || o.customer === "Cliente Versand")
      .map((order) => ({
        ...order,
        estimatedDelivery: calculateEstimatedDelivery(order),
        timeline: buildDynamicTimeline(order)
      }));
    return sendJson(response, 200, { orders: buyerOrders });
  }

  return sendJson(response, 404, { message: "Ruta no encontrada" });
});

server.listen(configuration.port, "127.0.0.1", () => {
  console.log(`[${role}] escuchando en http://localhost:${configuration.port}`);
});
