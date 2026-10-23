const http = require("node:http");
const crypto = require("node:crypto");
const db = require("./supabase-client");

const role = process.argv[2];
const configuration = {
  operator: {
    port: Number(process.env.VERSAND_OPERATOR_PORT || 4001),
    path: "/api/auth/operator",
    user: { id: "op-001", name: "Equipo Versand", email: "operaciones@versand.co", role: "operator" }
  },
  buyer: {
    port: Number(process.env.VERSAND_BUYER_PORT || 4002),
    path: "/api/auth/buyer",
    user: { id: "buyer-001", name: "Laura Gómez", email: "laura.gomez@versand.co", role: "buyer" }
  }
}[role];

if (!configuration) {
  console.error("Uso: node backend/service.js operator|buyer");
  process.exit(1);
}

const CARRIER_WEBHOOK_SECRET = process.env.CARRIER_WEBHOOK_SECRET || "";
const INTEGRATION_SHARED_SECRET = process.env.INTEGRATION_SHARED_SECRET || "";
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production" && !process.env.CORS_ALLOWED_ORIGINS) {
  throw new Error("En producción debes definir CORS_ALLOWED_ORIGINS con los orígenes HTTPS autorizados.");
}

// Cálculo dinámico de fecha estimada según SLA de transportadora (Sprint 1, HU-01)
function calculateEstimatedDelivery(order) {
  if (order.status === "Entregado") {
    const delivered = order.delivered_at || order.deliveredAt;
    if (delivered) {
      const d = new Date(delivered);
      return `Entregado el ${d.toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    }
    return "Entregado";
  }
  if (order.status === "Incidencia") {
    return "Reprogramación estimada: 24h tras contacto con cliente";
  }
  if (!order.tracking_number || !order.carrier) return "Pendiente de asignación de transportadora";

  const baseDate = new Date(order.created_at || order.createdAt || Date.now());
  const slaHours = order.sla_hours || (order.carrier === "Mercado Express" ? 24 : order.carrier === "Ruta Segura" ? 48 : 72);
  const deliveryDate = new Date(order.estimated_delivery_at || baseDate.getTime() + slaHours * 3600 * 1000);

  const options = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  const dateStr = deliveryDate.toLocaleDateString("es-CO", options);
  return `${dateStr} (SLA: ${slaHours}h)`;
}

// Verificación criptográfica HMAC SHA-256 (Sprint 2, HU-04)
function verifyCarrierHmac(rawBody, signatureHeader) {
  if (!CARRIER_WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    const cleanSignature = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
    const hmac = crypto.createHmac("sha256", CARRIER_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const expected = hmac.digest("hex").toLowerCase();
    if (cleanSignature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(cleanSignature), Buffer.from(expected));
  } catch (err) {
    return false;
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...(res.corsOrigin ? { "Access-Control-Allow-Origin": res.corsOrigin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-carrier-signature, x-hub-signature-256",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
  });
  res.end(JSON.stringify(data));
}

function getErrorStatus(err, fallback = 400) {
  if (err.status === 413) return err.status;
  if (err.status === 409 || err.status === 404 || err.code === "23505") return err.code === "23505" ? 409 : err.status;
  if (err.status >= 500 || err.message?.includes("No se pudo conectar con Supabase")) return 502;
  if (err.message?.startsWith("Supabase ")) return 502;
  return fallback;
}

function readBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let oversized = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { oversized = true; return; }
      body += chunk;
    });
    req.on("end", () => {
      if (oversized) {
        const error = new Error("El cuerpo de la solicitud supera el límite permitido.");
        error.status = 413;
        reject(error);
      } else resolve(body);
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const requestOrigin = req.headers.origin;
  if (requestOrigin && CORS_ALLOWED_ORIGINS.includes(requestOrigin)) res.corsOrigin = requestOrigin;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...(res.corsOrigin ? { "Access-Control-Allow-Origin": res.corsOrigin, "Vary": "Origin" } : {}),
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-carrier-signature, x-hub-signature-256",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    });
    return res.end();
  }

  if (reqUrl.pathname.startsWith("/api/integrations/")) {
    if (role !== "operator") return sendJson(res, 403, { success: false, message: "Integración disponible únicamente en el servicio de operador." });
    if (!INTEGRATION_SHARED_SECRET) return sendJson(res, 503, { success: false, message: "Falta configurar INTEGRATION_SHARED_SECRET." });
    const authorization = String(req.headers.authorization || "");
    const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));
    const expected = Buffer.from(INTEGRATION_SHARED_SECRET);
    if (!/^Bearer\s+/i.test(authorization) || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return sendJson(res, 401, { success: false, message: "Se requiere un Bearer válido para esta integración." });
    }
  }

  // Estado del servidor y conexión con base de datos (Supabase / Local)
  if (req.method === "GET" && reqUrl.pathname === "/api/health") {
    try {
      const database = await db.checkConnection();
      return sendJson(res, 200, {
        status: "online",
        role,
        port: configuration.port,
        database: { ...db.getStatus(), ...database },
        features: {
          sprint1: "Seguimiento persistente, guía única y descarga directa de etiqueta PDF",
          sprint2: "Webhook HMAC SHA-256; notificaciones quedan pendientes de proveedor",
          sprint3: "Custodia Escrow 72h automatizada; evidencia GPS en integración"
        }
      });
    } catch (err) {
      return sendJson(res, 503, { status: "degraded", role, database: { ...db.getStatus(), connected: false }, message: err.message });
    }
  }

  // Autenticación de roles (Operador y Comprador)
  if (req.method === "POST" && reqUrl.pathname === configuration.path) {
    try {
      const raw = await readBody(req);
      const credentials = JSON.parse(raw || "{}");
      if (!credentials.email || !credentials.password) {
        return sendJson(res, 400, { authenticated: false, message: "Correo y contraseña son obligatorios" });
      }
      const session = await db.signInWithPassword(String(credentials.email).trim().toLowerCase(), credentials.password);
      const profile = await db.getAuthenticatedProfile(session.access_token);
      if (!profile || profile.role !== role) return sendJson(res, 403, { authenticated: false, message: "Esta cuenta no tiene un perfil activo para este espacio." });
      return sendJson(res, 200, { authenticated: true, access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, user: { id: profile.auth_user_id, name: profile.display_name, email: profile.email, role: profile.role }, service: role });
    } catch (err) {
      return sendJson(res, err.status || 400, { authenticated: false, message: err.message });
    }
  }

  // Las integraciones y el webhook de transportadora usan sus propias credenciales.
  // Todas las rutas del navegador requieren un JWT de Supabase y un perfil activo.
  if (reqUrl.pathname !== "/api/health" && reqUrl.pathname !== "/api/webhooks/carrier" &&
      reqUrl.pathname !== "/api/webhooks/generate-signature" && !reqUrl.pathname.startsWith("/api/integrations/")) {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return sendJson(res, 401, { authenticated: false, message: "Inicia sesión para continuar." });
    try {
      req.authProfile = await db.getAuthenticatedProfile(token);
    } catch (err) {
      console.error("[AUTH] No se pudo validar sesión:", err.message);
    }
    if (!req.authProfile) return sendJson(res, 401, { authenticated: false, message: "La sesión expiró o la cuenta no está activa." });
    if (req.authProfile.role !== role) return sendJson(res, 403, { authenticated: false, message: "La sesión no corresponde a este servicio." });
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/auth/logout") {
    try {
      await db.signOut(req.headers.authorization.match(/^Bearer\s+(.+)$/i)?.[1]);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 502, { success: false, message: err.message });
    }
  }

  // Validación de unicidad de guías (Sprint 1, HU-02)
  if (req.method === "GET" && reqUrl.pathname === "/api/tracking/validate") {
    const tracking = reqUrl.searchParams.get("tracking");
    const orderId = reqUrl.searchParams.get("orderId");
    const check = await db.validateTrackingUnique(tracking, orderId);
    return sendJson(res, 200, check);
  }

  // Consulta de todos los pedidos enriquecidos
  if (req.method === "GET" && reqUrl.pathname === "/api/orders") {
    try {
      let orders = await db.getOrders();
      if (role === "buyer") orders = orders.filter((order) => order.customer_id === req.authProfile.customer_id);
      const enriched = orders.map((order) => ({
        ...order,
        tracking: order.tracking_number || order.tracking,
        customer: order.customer_name || order.customer,
        product: order.product_name || order.product,
        estimatedDelivery: calculateEstimatedDelivery(order)
      }));
      return sendJson(res, 200, enriched);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "GET" && reqUrl.pathname === "/api/operator/shipping-queue") {
    if (role !== "operator") return sendJson(res, 403, { message: "Solo operador." });
    try {
      const orders = await db.getOrders();
      const pending = [];
      for (const order of orders) {
        if (order.tracking_number || order.status !== "Confirmado") continue;
        const escrow = await db.getEscrowStatus(order.id);
        if (escrow?.status === "AWAITING_DELIVERY") pending.push(order);
      }
      return sendJson(res, 200, pending);
    } catch (err) {
      return sendJson(res, getErrorStatus(err, 500), { message: err.message });
    }
  }

  if (req.method === "POST" && /^\/api\/orders\/[^/]+\/shipping$/.test(reqUrl.pathname)) {
    if (role !== "operator") return sendJson(res, 403, { success: false, message: "Solo operador." });
    try {
      const orderId = decodeURIComponent(reqUrl.pathname.split("/")[3]);
      const data = JSON.parse(await readBody(req) || "{}");
      const order = await db.assignShipping(orderId, data.carrier, data.tracking_number, Number(data.sla_hours));
      return sendJson(res, 200, { success: true, order });
    } catch (err) {
      return sendJson(res, getErrorStatus(err), { success: false, message: err.message });
    }
  }

  // Consulta de un pedido específico con su historial inmutable y datos de Escrow
  if (req.method === "GET" && reqUrl.pathname.startsWith("/api/orders/")) {
    const identifier = decodeURIComponent(reqUrl.pathname.replace("/api/orders/", "")).trim();
    const order = await db.getOrder(identifier);
    if (!order) return sendJson(res, 404, { message: `Pedido ${identifier} no encontrado.` });
    if (role === "buyer" && order.customer_id !== req.authProfile.customer_id) {
      return sendJson(res, 404, { message: "Pedido no encontrado." });
    }

    const events = await db.getTrackingEvents(order.id);
    const escrow = await db.getEscrowStatus(order.id);
    const evidence = await db.getDeliveryEvidence(order.id);

    return sendJson(res, 200, {
      ...order,
      tracking: order.tracking_number,
      customer: order.customer_name,
      product: order.product_name,
      estimatedDelivery: calculateEstimatedDelivery(order),
      events,
      escrow,
      evidence
    });
  }

  // Registro de nueva guía y orden con validación estricta de unicidad (Sprint 1, HU-02)
  if (req.method === "POST" && reqUrl.pathname === "/api/orders") {
    if (role !== "operator") return sendJson(res, 403, { success: false, message: "Solo el servicio de operador puede registrar una guía." });
    try {
      const raw = await readBody(req);
      const newOrder = JSON.parse(raw || "{}");
      if (!newOrder.tracking_number && !newOrder.tracking) {
        return sendJson(res, 400, { success: false, message: "El número de guía es obligatorio" });
      }

      const trackingNumber = (newOrder.tracking_number || newOrder.tracking).trim().toUpperCase();
      const orderId = (newOrder.id || `MC-${Math.floor(10000 + Math.random() * 90000)}`).trim().toUpperCase();

      const created = await db.createOrder({
        id: orderId,
        order_number: newOrder.order_number || `ORD-${orderId}`,
        tracking_number: trackingNumber,
        carrier: newOrder.carrier || "Mercado Express",
        customer_id: newOrder.customer_id || "buyer-001",
        customer_name: newOrder.customer_name || newOrder.customer || "Cliente Versand",
        customer_phone: newOrder.customer_phone,
        customer_email: newOrder.customer_email,
        seller_id: newOrder.seller_id || "seller-001",
        destination_city: newOrder.destination_city || "Bogotá, Colombia",
        destination_address: newOrder.destination_address || newOrder.address || "Dirección registrada",
        product_name: newOrder.product_name || newOrder.product || "Paquete Estándar",
        total_amount: Number(newOrder.total_amount) || 160000.00,
        status: newOrder.status || "Preparado"
      });

      return sendJson(res, 201, {
        success: true,
        message: `Guía única ${trackingNumber} validada y registrada correctamente.`,
        order: {
          ...created,
          tracking: created.tracking_number,
          customer: created.customer_name,
          product: created.product_name,
          estimatedDelivery: calculateEstimatedDelivery(created)
        }
      });
    } catch (err) {
      const code = err.message.includes("ya se encuentra registrada") ? 409 : getErrorStatus(err, 400);
      return sendJson(res, code, { success: false, message: err.message });
    }
  }

  // ============================================================================
  // SPRINT 2: WEBHOOK SEGURO DE TRANSPORTADORA CON HMAC SHA-256 (HU-04)
  // ============================================================================
  if (req.method === "POST" && reqUrl.pathname === "/api/webhooks/carrier") {
    if (role !== "operator") return sendJson(res, 404, { success: false, message: "Webhook no disponible en este servicio." });
    const startTime = Date.now();
    if (!CARRIER_WEBHOOK_SECRET) {
      return sendJson(res, 503, { success: false, message: "Webhook no configurado: falta CARRIER_WEBHOOK_SECRET." });
    }
    try {
      const rawBody = await readBody(req);
      const signature = req.headers["x-carrier-signature"] || req.headers["x-hub-signature-256"];

      // Verificación de firma criptográfica HMAC SHA-256
      const isValidSignature = verifyCarrierHmac(rawBody, signature);
      if (!isValidSignature) {
        return sendJson(res, 401, {
          success: false,
          error: "Firma HMAC inválida o ausente.",
          message: "Se requiere encabezado x-carrier-signature con HMAC SHA-256 válido."
        });
      }

      const payload = JSON.parse(rawBody || "{}");
      const trackingNumber = (payload.tracking_number || payload.tracking || "").trim().toUpperCase();
      const allowedStatuses = new Set(["Preparado", "En tránsito", "En reparto", "Entregado", "Incidencia"]);
      const newStatus = payload.status;
      const location = payload.location || "Punto de control transportadora";
      const note = payload.note || `Evento reportado por ${payload.carrier || "Transportadora"}`;

      if (!trackingNumber || !allowedStatuses.has(newStatus) || typeof location !== "string" || typeof note !== "string") {
        return sendJson(res, 400, { success: false, message: "El webhook requiere tracking_number, un estado permitido, ubicación y nota válidas." });
      }

      // Buscar orden asociada a la guía
      const order = await db.getOrder(trackingNumber);
      if (!order) {
        return sendJson(res, 404, { success: false, message: `No se encontró pedido con la guía ${trackingNumber}.` });
      }

      // Registrar evento inmutable de trazabilidad (HU-01, HU-04)
      const eventRecord = await db.addTrackingEvent({
        order_id: order.id,
        tracking_number: trackingNumber,
        status: newStatus,
        location,
        checkpoint_note: note,
        source: "carrier_webhook",
        signature_verified: true,
        raw_payload: payload,
        idempotency_key: crypto.createHash("sha256").update(rawBody).digest("hex")
      });

      const notification = await db.logNotification({
        order_id: order.id,
        event_type: "EstadoCambiado",
        recipient_id: order.customer_id,
        channel: "Push",
        idempotency_key: crypto.createHash("sha256").update(rawBody).digest("hex"),
        payload: { orderId: order.id, trackingNumber, oldStatus: order.status, newStatus, location, timestamp: new Date().toISOString() }
      });

      const processingMs = Date.now() - startTime;

      return sendJson(res, 200, {
        success: true,
        message: `Evento de trazabilidad procesado y firma HMAC SHA-256 verificada.`,
        event: eventRecord,
        pushNotification: {
          delivered: false,
          status: notification.delivery_status || "PENDING",
          channel: "Push",
          message: "Evento en cola; el proveedor del Equipo 3 aún no está configurado.",
          logId: notification.id
        },
        processingMs
      });
    } catch (err) {
      return sendJson(res, getErrorStatus(err, 500), { success: false, message: err.message });
    }
  }

  // Generador de firmas HMAC para pruebas del simulador
  if (req.method === "POST" && reqUrl.pathname === "/api/webhooks/generate-signature") {
    if (process.env.NODE_ENV !== "development" || !CARRIER_WEBHOOK_SECRET) {
      return sendJson(res, 404, { error: "Ruta disponible únicamente en desarrollo con CARRIER_WEBHOOK_SECRET configurado." });
    }
    try {
      const raw = await readBody(req);
      const { payload } = JSON.parse(raw || "{}");
      const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
      const hmac = crypto.createHmac("sha256", CARRIER_WEBHOOK_SECRET).update(bodyStr).digest("hex");
      return sendJson(res, 200, {
        signature: hmac,
        header: `sha256=${hmac}`
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ============================================================================
  // SPRINT 3: GESTIÓN DE ESCROW 72H Y PROTECCIÓN FINANCIERA (HU-03)
  // ============================================================================
  // Consulta de estado de custodia Escrow
  if (req.method === "GET" && reqUrl.pathname.startsWith("/api/escrow/")) {
    const orderId = reqUrl.pathname.replace("/api/escrow/", "").split("/")[0];
    const order = await db.getOrder(orderId);
    if (!order || (role === "buyer" && order.customer_id !== req.authProfile.customer_id)) {
      return sendJson(res, 404, { found: false, message: "Pedido no encontrado." });
    }
    const status = await db.getEscrowStatus(orderId);
    return sendJson(res, 200, status);
  }

  // Congelar fondos por Reclamo / PQR (Comprador reporta problema)
  if (req.method === "POST" && reqUrl.pathname.endsWith("/dispute")) {
    if (role !== "buyer") return sendJson(res, 403, { success: false, message: "Solo el servicio de comprador puede abrir una PQR." });
    try {
      const parts = reqUrl.pathname.split("/");
      const orderId = parts[3];
      const order = await db.getOrder(orderId);
      if (!order || order.customer_id !== req.authProfile.customer_id) {
        return sendJson(res, 404, { success: false, message: "Pedido no encontrado." });
      }
      const raw = await readBody(req);
      const { reason } = JSON.parse(raw || "{}");

      const result = await db.freezeEscrow(orderId, reason);
      return sendJson(res, 200, {
        ...result,
        message: `Fondos de ${orderId} congelados por reclamo activo. El evento quedó pendiente para Contabilidad.`
      });
    } catch (err) {
      return sendJson(res, getErrorStatus(err), { success: false, message: err.message });
    }
  }

  // Liberar fondos anticipadamente al vendedor (Aprobado por Comprador o resolución)
  if (req.method === "POST" && reqUrl.pathname.endsWith("/release")) {
    if (role !== "operator") return sendJson(res, 403, { success: false, message: "Operación no disponible para el servicio de comprador." });
    try {
      const parts = reqUrl.pathname.split("/");
      const orderId = parts[3];
      const raw = await readBody(req);
      const { resolvedBy } = JSON.parse(raw || "{}");

      const result = await db.releaseEscrow(orderId, resolvedBy || "Comprador");
      return sendJson(res, 200, {
        ...result,
        message: `Fondos de ${orderId} liberados al vendedor. La transacción quedó pendiente para Contabilidad.`
      });
    } catch (err) {
      return sendJson(res, getErrorStatus(err), { success: false, message: err.message });
    }
  }

  // ============================================================================
  // SPRINT 3: EVIDENCIA DE ENTREGA CON MARCA DE AGUA GPS INALTERABLE (HU-06)
  // ============================================================================
  if (req.method === "POST" && reqUrl.pathname === "/api/evidence/upload") {
    if (role !== "operator") return sendJson(res, 403, { success: false, message: "Solo el servicio de operador puede cargar evidencia de entrega." });
    const tStart = Date.now();
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw || "{}");

      if (!data.order_id || !data.image_data) {
        return sendJson(res, 400, { success: false, message: "order_id e image_data (data URL base64) son requeridos." });
      }

      const order = await db.getOrder(data.order_id);
      if (!order || !order.tracking_number || order.status !== "En reparto") return sendJson(res, 409, { success: false, message: "La evidencia requiere un pedido existente en estado En reparto." });
      const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(data.image_data);
      if (!match) return sendJson(res, 400, { success: false, message: "La imagen debe ser JPEG o PNG en formato data URL." });
      const imageBytes = Buffer.from(match[2], "base64");
      if (!imageBytes.length || imageBytes.length > 10 * 1024 * 1024) return sendJson(res, 413, { success: false, message: "La imagen debe pesar como máximo 10 MB." });
      const isPng = imageBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg = imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff;
      if ((match[1] === "image/png" && !isPng) || (match[1] === "image/jpeg" && !isJpeg)) {
        return sendJson(res, 400, { success: false, message: "El contenido no coincide con el formato de imagen declarado." });
      }
      if (!Number.isFinite(Number(data.latitude)) || Number(data.latitude) < -90 || Number(data.latitude) > 90 || !Number.isFinite(Number(data.longitude)) || Number(data.longitude) < -180 || Number(data.longitude) > 180) {
        return sendJson(res, 400, { success: false, message: "Coordenadas GPS inválidas." });
      }

      // Hash de integridad SHA-256
      const timestampStamped = data.timestamp_stamped || new Date().toISOString();
      const hash = crypto.createHash("sha256").update(imageBytes).update(JSON.stringify({
        order_id: order.id,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        timestamp_stamped: timestampStamped
      })).digest("hex");

      const record = await db.saveDeliveryEvidence({
        ...data,
        tracking_number: order.tracking_number,
        image_bytes: imageBytes,
        image_content_type: match[1],
        timestamp_stamped: timestampStamped,
        hash_integrity: hash
      });

      const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(2);
      return sendJson(res, 201, {
        success: true,
        message: "Evidencia de entrega guardada correctamente.",
        evidence: record,
        benchmark: {
          elapsedSeconds: Number(elapsedSec),
          slaCompliant: Number(elapsedSec) < 3.0 // < 3s según HU-06
        }
      });
    } catch (err) {
      return sendJson(res, getErrorStatus(err, 400), { success: false, message: err.message });
    }
  }

  if (req.method === "GET" && reqUrl.pathname.startsWith("/api/evidence/")) {
    const orderId = reqUrl.pathname.replace("/api/evidence/", "").trim();
    const order = await db.getOrder(orderId);
    if (!order || (role === "buyer" && order.customer_id !== req.authProfile.customer_id)) {
      return sendJson(res, 404, { success: false, message: "Pedido no encontrado." });
    }
    const evidence = await db.getDeliveryEvidence(orderId);
    if (!evidence) {
      return sendJson(res, 404, { success: false, message: `No hay evidencia registrada para el pedido ${orderId}` });
    }
    return sendJson(res, 200, evidence);
  }

  // ============================================================================
  // ACUERDOS INTER-EQUIPOS (SPRINT COMPLEMENTARIO)
  // ============================================================================
  // 1. Carrito y Órdenes (Equipo 8, HU-ORD-01): Recibir orden creada y confirmada
  if (req.method === "POST" && reqUrl.pathname === "/api/integrations/order-paid") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw || "{}");
      const created = await db.registerPaidOrder({
        id: data.order_id,
        order_number: data.order_number,
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        seller_id: data.seller_id,
        product_name: data.items ? data.items.map((i) => i.name).filter(Boolean).join(", ") : data.product_name,
        total_amount: data.total_amount,
        destination_city: data.city || data.destination_city,
        destination_address: data.address || data.destination_address,
        sla_hours: data.sla_hours
      });
      return sendJson(res, 201, { success: true, event: "OrderPaid", message: "Pago registrado; seguimiento inicial y custodia pendiente de entrega creados.", order: created });
    } catch (err) {
      return sendJson(res, getErrorStatus(err), { success: false, message: err.message });
    }
  }

  // 2. Envíos (Equipo 1, HU-ENV-01): Asignar operador logístico, SLA y guía única
  if (req.method === "POST" && reqUrl.pathname === "/api/integrations/shipping-assigned") {
    try {
      const raw = await readBody(req);
      const { order_id, carrier, tracking_number, sla_hours } = JSON.parse(raw || "{}");
      const order = await db.assignShipping(order_id, carrier, tracking_number, sla_hours);
      return sendJson(res, 200, { success: true, message: "Asignación de transportadora, guía única y SLA registrados.", order });
    } catch (err) {
      return sendJson(res, getErrorStatus(err), { success: false, message: err.message });
    }
  }

  // 3. Notificaciones (Equipo 3, HU-NOT-03): Emisión del evento 'EstadoCambiado'
  if (req.method === "POST" && reqUrl.pathname === "/api/integrations/notify") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw || "{}");
      const log = await db.logNotification({
        order_id: data.order_id,
        event_type: "EstadoCambiado",
        recipient_id: data.customer_id,
        channel: data.channel || "Push",
        idempotency_key: data.idempotency_key || crypto.createHash("sha256").update(raw).digest("hex"),
        payload: data
      });
      return sendJson(res, 202, { success: true, deliveryStatus: log.delivery_status || "PENDING", message: "Notificación aceptada en la cola; entrega pendiente de integración con Equipo 3.", log });
    } catch (err) {
      return sendJson(res, 400, { success: false, message: err.message });
    }
  }

  // 4. Contabilidad (Equipos 2 y 6, HU-PG-03 / HU-CON-01): Auditoría de saldos Escrow
  if (req.method === "GET" && reqUrl.pathname === "/api/integrations/accounting/audit") {
    const orders = await db.getOrders();
    const escrows = await Promise.all(orders.map((o) => db.getEscrowStatus(o.id)));
    const totalRetained = escrows.filter((e) => e.status === "RETAINED").reduce((sum, e) => sum + Number(e.retainedAmount || 0), 0);
    const totalReleased = escrows.filter((e) => e.status === "RELEASED").reduce((sum, e) => sum + Number(e.retainedAmount || 0), 0);
    const totalDisputed = escrows.filter((e) => e.status === "FROZEN_DISPUTE").reduce((sum, e) => sum + Number(e.retainedAmount || 0), 0);

    return sendJson(res, 200, {
      summary: {
        totalRetained,
        totalReleased,
        totalDisputed,
        totalTransactions: escrows.length
      },
      records: escrows
    });
  }

  // Dashboard de operador
  if (req.method === "GET" && reqUrl.pathname === "/api/operator/dashboard") {
    const orders = await db.getOrders();
    const incidents = orders.filter((o) => o.status === "Incidencia").length;
    const delivered = orders.filter((o) => o.status === "Entregado" && o.delivered_at);
    const onTime = delivered.filter((o) => !o.estimated_delivery_at || new Date(o.delivered_at) <= new Date(o.estimated_delivery_at));
    const averageDays = delivered.length
      ? delivered.reduce((sum, o) => sum + (new Date(o.delivered_at) - new Date(o.created_at)) / 86400000, 0) / delivered.length
      : 0;
    return sendJson(res, 200, {
      kpis: {
        totalDeliveries: delivered.length,
        onTimeRate: delivered.length ? Number((onTime.length * 100 / delivered.length).toFixed(1)) : 0,
        averageDays: Number(averageDays.toFixed(1)),
        openIncidents: incidents
      },
      recentActivity: orders.map((o) => ({
        id: o.id,
        customer: o.customer_name,
        carrier: o.carrier,
        status: o.status,
        updated: o.updated_at
      }))
    });
  }

  // Dashboard de comprador
  if (req.method === "GET" && reqUrl.pathname === "/api/buyer/dashboard") {
    const orders = await db.getOrders();
    const buyerOrders = orders
        .filter((o) => o.customer_id === req.authProfile.customer_id)
      .map((o) => ({
        ...o,
        tracking: o.tracking_number,
        customer: o.customer_name,
        product: o.product_name,
        estimatedDelivery: calculateEstimatedDelivery(o)
      }));
    return sendJson(res, 200, { orders: buyerOrders });
  }

  return sendJson(res, 404, { message: "Ruta no encontrada" });
});

if (role === "operator") {
  const releaseDueEscrows = async () => {
    try {
      const count = await db.releaseExpiredEscrows();
      if (count > 0) console.log(`[escrow] ${count} custodia(s) vencida(s) liberada(s); eventos en cola para Contabilidad.`);
    } catch (err) {
      console.error(`[escrow] No se pudieron procesar liberaciones vencidas: ${err.message}`);
    }
  };
  const escrowTimer = setInterval(releaseDueEscrows, 60_000);
  escrowTimer.unref();
  void releaseDueEscrows();
}

const bindHost = process.env.VERSAND_BIND_HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
server.listen(configuration.port, bindHost, () => {
  console.log(`[${role}] Módulo de Seguimiento escuchando en http://${bindHost}:${configuration.port}`);
});
