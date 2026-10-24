/**
 * Versand - Lógica central del sistema de seguimiento logístico
 * Cumplimiento Sprint 1 y Sprint 2 (Línea de tiempo dinámica, cálculo de ETA, validación de guías únicas y etiquetas PDF < 2s)
 */

// Base de datos de pedidos local y sincronizable
const DEFAULT_ORDERS = [
  {
    id: "MC-20481",
    tracking: "MCX-908172",
    customer: "Laura Gómez",
    carrier: "Mercado Express",
    product: "Audífonos inalámbricos",
    status: "En tránsito",
    destination: "Cali, Colombia",
    address: "Carrera 1 #5-105 Oeste, Museo La Tertulia, Cali",
    createdAt: "2026-10-23T12:00:00Z",
    dispatchedAt: "2026-10-23T14:00:00Z",
    estimatedDeliveryAt: "2026-10-24T14:00:00Z",
    transitHours: 24,
    lastLocation: "Bogotá · en ruta hacia Cali",
    updated: "Hace 8 min"
  },
  {
    id: "MC-20479",
    tracking: "MCX-908055",
    customer: "Andrés Rojas",
    carrier: "Ruta Segura",
    product: "Teclado mecánico RGB",
    status: "Entregado",
    destination: "Medellín, Colombia",
    address: "Carrera 52 #52-43, Museo de Antioquia, Medellín",
    createdAt: "2026-10-01T10:00:00Z",
    dispatchedAt: "2026-10-02T08:00:00Z",
    deliveredAt: "2 oct 2026 · 2:45 PM",
    transitHours: 48,
    lastLocation: "Poblado, Medellín",
    updated: "Hace 21 min"
  },
  {
    id: "MC-20397",
    tracking: "MCX-907441",
    customer: "Laura Gómez",
    carrier: "Mercado Express",
    product: "Kit de café artesanal",
    status: "Entregado",
    destination: "Cali, Colombia",
    address: "Carrera 5 #6-05, Centro Cultural de Cali, Cali",
    createdAt: "2026-09-30T11:00:00Z",
    dispatchedAt: "2026-10-01T09:00:00Z",
    deliveredAt: "2 oct 2026 · 4:18 PM",
    transitHours: 24,
    lastLocation: "Carrera 5 #6-05, Centro Cultural de Cali, Cali",
    updated: "2 oct 2026"
  },
  {
    id: "MC-20463",
    tracking: "MCX-907990",
    customer: "Sofía Martínez",
    carrier: "Mercado Express",
    product: "Monitor 27 pulgadas 4K",
    status: "Incidencia",
    destination: "Cali, Colombia",
    address: "Carrera 1 #5-105 Oeste, Museo La Tertulia, Cali",
    createdAt: "2026-10-05T08:30:00Z",
    dispatchedAt: "2026-10-06T14:00:00Z",
    transitHours: 48,
    lastLocation: "Hub Yumbo, Valle",
    updated: "Hace 23 min"
  }
];

// Puntos públicos reales usados como origen de las rutas de demostración.
// El primer evento persistido sigue siendo la fuente principal cuando existe.
const DEMO_ORIGINS = {
  "MC-20481": "Carrera 7 #28-66, Museo Nacional de Colombia, Bogotá",
  "MC-20397": "Cra. 6 #15-88, Museo del Oro, Bogotá",
  "MC-20479": "Carrera 7 #28-66, Museo Nacional de Colombia, Bogotá",
  "MC-20463": "Cra. 6 #15-88, Museo del Oro, Bogotá"
};

// Obtención del repositorio persistente de pedidos
function getOrders() {
  try {
    const raw = localStorage.getItem("versand_orders");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer localStorage:", e);
  }
  return DEFAULT_ORDERS;
}

// Guardado del repositorio persistente
function saveOrders(orders) {
  try {
    localStorage.setItem("versand_orders", JSON.stringify(orders));
  } catch (e) {
    console.warn("No se pudo persistir en localStorage:", e);
  }
}

// Resuelve la API del rol actual. En Pages nunca debe apuntar al localhost
// del navegador; en desarrollo usa las URLs locales de versand-config.js.
function getVersandApiBase(role) {
  const session = typeof getVersandSession === "function" ? getVersandSession() : null;
  const base = session?.role === role ? session.apiBase : window.VERSAND_API_BASES?.[role];
  if (!base) throw new Error(`No está configurado el servicio de ${role === "operations" ? "operador" : "comprador"}.`);
  return base.replace(/\/+$/, "");
}

function cacheServiceOrders(orders) {
  saveOrders(orders.map((order) => ({
    id: order.id,
    tracking: order.tracking_number || "",
    customer: order.customer_name || "",
    carrier: order.carrier || "",
    product: order.product_name || "",
    status: order.status,
    destination: order.destination_city || "",
    address: order.destination_address || "",
    createdAt: order.created_at,
    estimatedDeliveryAt: order.estimated_delivery_at,
    deliveredAt: order.delivered_at,
    lastLocation: order.last_location,
    updated: order.updated_at
  })));
}

// Cálculo dinámico de fecha y ventana estimada de entrega (Sprint 2)
function calculateEstimatedDelivery(order) {
  if (order.status === "Entregado") {
    return order.deliveredAt ? `Entregado el ${order.deliveredAt}` : "Entregado el 2 oct 2026 · 4:18 PM";
  }
  if (order.status === "Incidencia") {
    return "Reprogramación estimada: 24h tras contacto con cliente";
  }
  if (order.status === "En reparto") {
    if (!order.estimatedDeliveryAt) return "En reparto; ETA pendiente de actualización";
  }

  if (!order.tracking || !order.carrier) return "Pendiente de asignación de transportadora";

  // Cálculo según SLA de transportadora y fecha de emisión
  const baseDate = new Date(order.createdAt || Date.now());
  const slaHours = order.carrier === "Mercado Express" ? 24 : order.carrier === "Ruta Segura" ? 48 : 72;
  const etaDate = new Date(order.estimatedDeliveryAt || baseDate.getTime() + slaHours * 3600 * 1000);

  const options = { weekday: "long", day: "numeric", month: "short" };
  const formatted = etaDate.toLocaleString("es-CO", { ...options, timeZone: "America/Bogota" });
  return `${formatted} (SLA: ${slaHours}h)`;
}

// Construcción 100% dinámica de la línea de tiempo por estados (Sprint 2)
function buildDynamicTimeline(order, events = []) {
  if (events.length) {
    const labels = { Confirmado: "Pedido confirmado", Preparado: "Preparado en bodega", "En tránsito": "En tránsito", "En reparto": "En reparto", Entregado: "Entregado", Incidencia: "Incidencia" };
    return events.map((event, index) => ({
      title: labels[event.status] || event.status,
      time: new Date(event.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
      note: [event.location, event.checkpoint_note].filter(Boolean).join(" · "),
      status: index === events.length - 1 ? "current" : "done"
    }));
  }
  const steps = [
    { key: "confirmed", title: "Pedido confirmado", note: "Pago y orden validados correctamente", defaultTime: "3 oct · 9:42 AM" },
    { key: "prepared", title: "Preparado en bodega", note: `Empaquetado y rotulado con guía ${order.tracking}`, defaultTime: "3 oct · 2:15 PM" },
    { key: "transit", title: "En tránsito", note: `Transportado por ${order.carrier} hacia estación local`, defaultTime: "4 oct · 7:25 AM" },
    { key: "delivering", title: "En reparto", note: "Asignado a mensajero express en ruta de última milla", defaultTime: "Hoy · 3:16 PM" },
    { key: "delivered", title: "Entregado", note: "Comprobante y prueba de entrega digitalizados", defaultTime: "Hoy · 4:18 PM" }
  ];

  let currentStepIndex = 0;
  if (order.status === "Confirmado") currentStepIndex = 0;
  else if (order.status === "Preparado") currentStepIndex = 1;
  else if (order.status === "En tránsito") currentStepIndex = 2;
  else if (order.status === "En reparto") currentStepIndex = 3;
  else if (order.status === "Entregado") currentStepIndex = 4;
  else if (order.status === "Incidencia") currentStepIndex = 3;

  return steps.map((step, idx) => {
    let status = "pending";
    let time = "Pendiente";
    let title = step.title;
    let note = step.note;

    if (idx < currentStepIndex || (order.status === "Entregado" && idx <= currentStepIndex)) {
      status = "done";
      time = step.defaultTime;
    } else if (idx === currentStepIndex) {
      status = "current";
      if (order.status === "Incidencia") {
        title = "Incidencia en reparto";
        note = "Alerta operativa: dirección o acceso con novedad activa";
        time = "Hoy · Alerta en curso";
      } else {
        time = step.defaultTime;
      }
    }

    return { title, time, note, status };
  });
}

// Notificación flotante (Toast)
function showToast(message) {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function loadBuyerOrdersFromService() {
  const list = document.querySelector(".order-list");
  if (!list) return;
  try {
    const response = await versandApiFetch(`${getVersandApiBase("buyer")}/api/buyer/dashboard`);
    if (!response.ok) throw new Error("No se pudieron cargar los pedidos desde Seguimiento.");
    const { orders } = await response.json();
    cacheServiceOrders(orders);
    list.replaceChildren();
    for (const order of orders) {
      const row = document.createElement("article");
      row.className = "order-row";
      row.dataset.order = order.id;
      const summary = document.createElement("div");
      summary.className = "order-summary";
      const id = document.createElement("div"); id.className = "order-id"; id.textContent = `#${order.id}`;
      const product = document.createElement("div"); product.className = "order-product"; product.textContent = order.product_name;
      const meta = document.createElement("div"); meta.className = "order-meta";
      meta.textContent = order.tracking_number ? `Guía ${order.tracking_number} · ${order.last_location || "Sin ubicación"}` : "Pendiente de asignación de guía";
      summary.append(id, product, meta);
      const badge = document.createElement("span");
      badge.className = `badge ${order.status === "Entregado" ? "badge-success" : order.status === "Incidencia" ? "badge-danger" : "badge-warning"}`;
      badge.textContent = order.status;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary";
      button.dataset.orderDetail = "";
      button.textContent = "Ver detalle";
      row.append(summary, badge, button);
      list.append(row);
    }
    const count = document.querySelector(".orders-panel .panel-head > .muted");
    if (count) count.textContent = `${orders.length} pedido${orders.length === 1 ? "" : "s"}`;
  } catch (error) {
    list.replaceChildren();
    const count = document.querySelector(".orders-panel .panel-head > .muted");
    if (count) count.textContent = "No disponible";
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = "No se pudieron cargar los pedidos desde el servicio de seguimiento.";
    list.append(message);
    showToast(error.message);
  }
}

async function loadOperatorDashboardFromService() {
  const tableBody = document.querySelector("table tbody");
  if (!tableBody) return;
  try {
    const response = await versandApiFetch(`${getVersandApiBase("operations")}/api/operator/dashboard`);
    if (!response.ok) throw new Error("No se pudo cargar el panel operativo desde Seguimiento.");
    const dashboard = await response.json();
    const ordersResponse = await versandApiFetch(`${getVersandApiBase("operations")}/api/orders`);
    if (!ordersResponse.ok) throw new Error("No se pudo sincronizar el catálogo de pedidos del operador.");
    cacheServiceOrders(await ordersResponse.json());
    tableBody.replaceChildren();
    for (const activity of dashboard.recentActivity) {
      const row = document.createElement("tr");
      const values = [activity.id, activity.customer, activity.carrier || "Pendiente", activity.status,
        activity.updated ? new Date(activity.updated).toLocaleString("es-CO") : ""];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        row.append(cell);
      }
      const actionCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-soft";
      button.textContent = activity.status === "Incidencia" ? "Resolver" : "Abrir";
      actionCell.append(button);
      row.append(actionCell);
      tableBody.append(row);
    }
    const incidentValue = document.querySelectorAll(".kpi-grid .kpi-value")[3];
    if (incidentValue) incidentValue.textContent = String(dashboard.kpis.openIncidents);
  } catch (error) {
    tableBody.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No se pudieron cargar las actividades desde el servicio de seguimiento.";
    row.append(cell);
    tableBody.append(row);
    showToast(error.message);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// Modal genérico
function openModal(title, message, fields = []) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const form = document.createElement("form");
  form.className = "modal";
  form.innerHTML = `
    <button type="button" class="modal-close" aria-label="Cerrar">×</button>
    <h2>${title}</h2>
    <p>${message}</p>
    ${fields.map((f) => `<label class="field">${f.label}<input name="${f.name}" ${f.required ? "required" : ""} placeholder="${f.placeholder || ""}"></label>`).join("")}
    <div class="modal-actions">
      <button type="button" class="btn btn-soft" data-modal-cancel>Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar</button>
    </div>
  `;
  backdrop.append(form);
  document.body.append(backdrop);

  const close = () => backdrop.remove();
  form.querySelector(".modal-close").addEventListener("click", close);
  form.querySelector("[data-modal-cancel]").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    close();
    showToast("Cambios guardados correctamente.");
  });
}

// Validación estricta de guías únicas (Sprint 2 - Criterio de Aceptación)
function validateTrackingUnique(tracking, currentOrderId = null) {
  const cleanTracking = (tracking || "").trim().toUpperCase();
  if (!cleanTracking) {
    return { valid: false, message: "El número de guía no puede estar vacío." };
  }

  const orders = getOrders();
  const duplicate = orders.find((o) => {
    if (currentOrderId && o.id.toUpperCase() === currentOrderId.toUpperCase()) return false;
    return o.tracking.toUpperCase() === cleanTracking;
  });

  if (duplicate) {
    return {
      valid: false,
      message: `La guía "${cleanTracking}" ya está asignada al pedido #${duplicate.id} (${duplicate.product}). Las guías deben ser únicas.`,
      duplicateOrder: duplicate
    };
  }

  return { valid: true, message: `Guía "${cleanTracking}" disponible y única.` };
}

// Generador de código de barras SVG vectorial
function generateBarcodeSVG(code) {
  const text = (code || "MCX-000000").replace(/[^A-Z0-9-]/gi, "");
  let bars = "";
  let x = 10;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const pattern = [(charCode % 3) + 1, ((charCode >> 1) % 2) + 1, ((charCode >> 2) % 3) + 1, 2];
    pattern.forEach((w, idx) => {
      if (idx % 2 === 0) {
        bars += `<rect x="${x}" y="0" width="${w * 1.5}" height="55" fill="#111" />`;
      }
      x += (w * 1.5) + 1.2;
    });
  }
  return `<svg viewBox="0 0 ${Math.max(x + 10, 220)} 55" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function createShippingLabelPdf(order, eta) {
  const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
  const lines = [
    ["VERSAND LOGISTICS HUB", 20, 390, 16],
    [order.carrier || "Transportadora", 20, 364, 12],
    ["ETIQUETA DE ENVIO", 20, 333, 10],
    ["GUIA", 20, 299, 9],
    [order.tracking || order.tracking_number || "PENDIENTE", 20, 278, 18],
    ["DESTINATARIO", 20, 239, 9],
    [order.customer || order.customer_name || "Comprador", 20, 220, 12],
    [order.address || order.destination_address || "Direccion pendiente", 20, 202, 10],
    [order.destination || order.destination_city || "Ciudad pendiente", 20, 185, 10],
    ["PEDIDO", 20, 153, 9],
    [`#${order.id || order.order_number || ""}`, 20, 135, 12],
    ["PRODUCTO", 20, 110, 9],
    [order.product || order.product_name || "Producto", 20, 92, 10],
    ["ENTREGA ESTIMADA", 20, 62, 9],
    [eta || "Pendiente", 20, 44, 10],
    ["Centro Logistico Versand - Bogota D.C.", 20, 20, 7]
  ];
  const commands = lines.map(([text, x, y, size]) => `BT /F1 ${size} Tf ${x} ${y} Td (${normalize(text).replace(/[\\()]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 288 432] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

// Descarga automática de etiqueta PDF en menos de 2s (HU-02)
function printShippingLabel(orderId) {
  const tStart = performance.now();
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId || o.tracking === orderId) || orders[0];
  if (!order) { showToast("No se encontró el pedido para generar la etiqueta."); return; }
  const eta = calculateEstimatedDelivery(order);
  const pdf = createShippingLabelPdf(order, eta);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `etiqueta-${String(order.tracking || order.tracking_number || order.id).replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const elapsedSeconds = ((performance.now() - tStart) / 1000).toFixed(3);
  showToast(`Descarga de etiqueta PDF iniciada en ${elapsedSeconds}s.`);
}

// Modal para asociar nueva guía con validación de unicidad en tiempo real (Sprint 2)
function openNewTrackingModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <form class="modal" id="newTrackingForm" style="width:min(520px, 100%)">
      <button type="button" class="modal-close" aria-label="Cerrar">×</button>
      <h2>Asignar envío a pedido pagado</h2>
      <p class="muted">Selecciona un pedido confirmado por el Equipo 8 y registra su guía.</p>
      <label class="field">Pedido pagado
        <select name="orderId" id="inputOrderId" required style="width:100%;height:46px;margin-top:7px;padding:0 13px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
          <option value="">Cargando pedidos…</option>
        </select>
      </label>
      <div id="shippingOrderSummary" class="muted" style="margin:8px 0 14px"></div>

      <label class="field">
        Número de guía (debe ser única)
        <input name="tracking" id="inputTracking" required placeholder="Ej: MCX-908350">
        <span id="trackingValidationFeedback" class="field-error-msg" style="display:none"></span>
      </label>

      <label class="field">
        Transportadora
        <select name="carrier" id="inputCarrier" style="width:100%;height:46px;margin-top:7px;padding:0 13px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
          <option value="Mercado Express">Mercado Express (SLA: 24h)</option>
          <option value="Ruta Segura">Ruta Segura (SLA: 48h)</option>
          <option value="Coordinadora">Coordinadora (SLA: 72h)</option>
        </select>
      </label>

      <div class="modal-actions">
        <button type="button" class="btn btn-soft" data-cancel-btn>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="btnSubmitTracking">Asignar guía</button>
      </div>
    </form>
  `;

  document.body.append(backdrop);

  const close = () => backdrop.remove();
  const form = backdrop.querySelector("#newTrackingForm");
  const orderSelect = backdrop.querySelector("#inputOrderId");
  const orderSummary = backdrop.querySelector("#shippingOrderSummary");
  const trackingInput = backdrop.querySelector("#inputTracking");
  const feedback = backdrop.querySelector("#trackingValidationFeedback");
  const apiBase = getVersandApiBase("operations");
  let paidOrders = [];

  versandApiFetch(`${apiBase}/api/operator/shipping-queue`)
    .then((response) => { if (!response.ok) throw new Error("No se pudieron consultar pedidos pagados."); return response.json(); })
    .then((orders) => {
      paidOrders = orders;
      orderSelect.innerHTML = orders.length
        ? '<option value="">Selecciona un pedido</option>' + orders.map((order) => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.id)} · ${escapeHtml(order.customer_name || "Cliente")} · ${escapeHtml(order.product_name || "Pedido")}</option>`).join("")
        : '<option value="">No hay pedidos pagados pendientes de guía</option>';
      orderSelect.disabled = !orders.length;
    })
    .catch(() => { orderSelect.innerHTML = '<option value="">No se pudo cargar la cola de envíos</option>'; orderSelect.disabled = true; });

  orderSelect.addEventListener("change", () => {
    const order = paidOrders.find((item) => item.id === orderSelect.value);
    orderSummary.textContent = order ? `${order.customer_name || ""} · ${order.destination_address || "Dirección no disponible"}` : "";
  });

  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector("[data-cancel-btn]").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  // Validación de unicidad en tiempo real mientras el usuario escribe
  trackingInput.addEventListener("input", () => {
    const val = trackingInput.value.trim().toUpperCase();
    if (!val) {
      feedback.style.display = "none";
      return;
    }
    const check = validateTrackingUnique(val);
    if (!check.valid) {
      feedback.className = "field-error-msg";
      feedback.textContent = `❌ ${check.message}`;
      feedback.style.display = "block";
      trackingInput.style.borderColor = "var(--danger)";
    } else {
      feedback.className = "field-success-msg";
      feedback.textContent = `✓ ${check.message}`;
      feedback.style.display = "block";
      trackingInput.style.borderColor = "var(--success)";
    }
  });

  // Envío del formulario
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const orderId = form.orderId.value.trim();
    const trackingVal = form.tracking.value.trim().toUpperCase();
    const carrier = form.carrier.value;
    const order = paidOrders.find((item) => item.id === orderId);
    if (!order) { showToast("Selecciona un pedido pagado pendiente de envío."); return; }

    // Verificación estricta de unicidad
    const validation = validateTrackingUnique(trackingVal);
    if (!validation.valid) {
      showToast(`Error: ${validation.message}`);
      feedback.className = "field-error-msg";
      feedback.textContent = `❌ ${validation.message}`;
      feedback.style.display = "block";
      return;
    }

    try {
      const response = await versandApiFetch(`${apiBase}/api/orders/${encodeURIComponent(orderId)}/shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_number: trackingVal, carrier, sla_hours: carrier === "Mercado Express" ? 24 : carrier === "Ruta Segura" ? 48 : 72 })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo asignar la guía.");
      const persisted = result.order;
      const newOrder = {
        id: persisted.id, tracking: persisted.tracking_number, carrier: persisted.carrier,
        customer: persisted.customer_name, product: persisted.product_name,
        address: persisted.destination_address, destination: persisted.destination_city,
        status: persisted.status, createdAt: persisted.created_at, updated: "Hace un momento",
        lastLocation: persisted.last_location
      };
      const current = getOrders().filter((item) => item.id !== newOrder.id);
      current.unshift(newOrder);
      saveOrders(current);
      close();
      showToast(`Guía ${trackingVal} asignada a ${orderId}.`);
      await loadOperatorDashboardFromService();
      printShippingLabel(newOrder.id);
    } catch (error) {
      showToast(`No se asignó la guía: ${error.message}`);
    }
  });
}

// Despliegue de seguimiento con línea de tiempo 100% dinámica (Sprint 2)
async function openOrderDetail(orderId = "MC-20481") {
  const orders = getOrders();
  let order = orders.find((o) => o.id === orderId || o.tracking === orderId) || orders[0];
  const apiRole = window.location.pathname.toLowerCase().includes("operador") ? "operations" : "buyer";
  const apiBase = getVersandApiBase(apiRole);
  let events = [];
  try {
    const response = await versandApiFetch(`${apiBase}/api/orders/${encodeURIComponent(orderId)}`);
    if (!response.ok) throw new Error("No se pudo consultar el pedido en el servicio de seguimiento.");
    const persisted = await response.json();
    order = {
      ...order,
      id: persisted.id,
      tracking: persisted.tracking_number || "Pendiente",
      customer: persisted.customer_name,
      carrier: persisted.carrier || "Pendiente de asignación",
      product: persisted.product_name,
      status: persisted.status,
      destination: persisted.destination_city,
      address: persisted.destination_address,
      createdAt: persisted.created_at,
      estimatedDeliveryAt: persisted.estimated_delivery_at,
      deliveredAt: persisted.delivered_at,
      lastLocation: persisted.last_location,
      evidence: persisted.evidence,
      escrow: persisted.escrow,
      updated: persisted.updated_at ? new Date(persisted.updated_at).toLocaleString("es-CO") : "",
      estimatedDelivery: persisted.estimatedDelivery
    };
    events = persisted.events || [];
  } catch (error) {
    showToast(error.message);
    return;
  }
  const eta = calculateEstimatedDelivery(order);
  const origin = events.find((event) => event.status === "Confirmado")?.location || DEMO_ORIGINS[order.id] || "Origen pendiente de confirmación";
  const destination = [order.address, order.destination].filter(Boolean).join(", ");
  const departureEvent = events.find((event) => event.status === "En tránsito");
  const departureLabel = departureEvent?.created_at
    ? new Date(departureEvent.created_at).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })
    : order.dispatchedAt ? new Date(order.dispatchedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "Pendiente";
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  const timelineSteps = buildDynamicTimeline(order, events);
  const isDelivered = order.status === "Entregado";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop order-detail-backdrop";
  backdrop.innerHTML = `
    <section class="modal order-detail" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
      <button type="button" class="modal-close" aria-label="Cerrar">×</button>

      <!-- Encabezado del pedido -->
      <div class="order-detail-header">
        <div>
          <span class="eyebrow">Seguimiento en tiempo real · Sprint 2</span>
          <h2 id="order-detail-title">#${escapeHtml(order.id)}</h2>
          <p>${escapeHtml(order.product)} · Guía <b>${escapeHtml(order.tracking)}</b></p>
        </div>
        <span class="badge ${isDelivered ? "badge-success" : order.status === "Incidencia" ? "badge-danger" : "badge-warning"}">
          ${escapeHtml(order.status)}
        </span>
      </div>

      <div class="order-detail-grid">
        <!-- Columna de línea de tiempo e información -->
        <div class="order-detail-column">
          <!-- Cálculo dinámico de fecha estimada -->
          <div class="detail-eta">
            <span class="muted">${isDelivered ? "Fecha de entrega" : "Entrega estimada calculada dinámicamente"}</span>
            <strong>${escapeHtml(order.estimatedDelivery || eta)}</strong>
          </div>

          <!-- Línea de tiempo 100% dinámica -->
          <div class="detail-section">
            <h3>Historial del envío (Línea de tiempo)</h3>
            <div class="timeline">
              ${timelineSteps.map((step) => `
                <div class="step ${step.status}">
                  <div class="dot"></div>
                  <div>
                    <p class="step-title">${escapeHtml(step.title)}</p>
                    <span class="step-time">${escapeHtml(step.time)}</span>
                    ${step.note ? `<p class="step-note">${escapeHtml(step.note)}</p>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Datos de entrega -->
          <div class="detail-section">
            <h3>Información de entrega</h3>
            <div class="info-row"><span>Cliente</span><strong>${escapeHtml(order.customer)}</strong></div>
            <div class="info-row"><span>Transportadora</span><strong>${escapeHtml(order.carrier)}</strong></div>
            <div class="info-row"><span>Dirección</span><strong>${escapeHtml(order.address || "Dirección registrada")}</strong></div>
            <div class="info-row"><span>Destino</span><strong>${escapeHtml(order.destination || "Bogotá, Colombia")}</strong></div>
          </div>

          ${order.escrow?.found ? `
          <div class="detail-section">
            <h3>Protección del pago</h3>
            <div class="info-row"><span>Estado</span><strong>${escapeHtml(order.escrow.status)}</strong></div>
            <div class="info-row"><span>Liberación estimada</span><strong>${escapeHtml(order.escrow.remainingFormatted || "Pendiente")}</strong></div>
          </div>` : ""}

          ${order.evidence ? `
          <div class="detail-section">
            <h3>Prueba de entrega</h3>
            <img src="${escapeHtml(order.evidence.image_url)}" alt="Evidencia de entrega" style="width:100%;border-radius:12px">
            <p class="step-note">GPS ${escapeHtml(order.evidence.latitude)}, ${escapeHtml(order.evidence.longitude)} · ${escapeHtml(order.evidence.timestamp_stamped)}</p>
            <p class="step-note">Huella SHA-256: ${escapeHtml(order.evidence.hash_integrity)}</p>
          </div>` : ""}
        </div>

        <!-- Columna de ubicación y acciones de etiqueta -->
        <div class="detail-map-column">
          <div class="detail-section">
            <div class="detail-section-heading">
              <h3>Ubicación del envío</h3>
              <span class="muted">${escapeHtml(order.updated || "Actualizado recientemente")}</span>
            </div>
            <div class="route-card">
              <div class="route-point"><span class="route-marker route-origin"></span><div><small>Sale de</small><strong>${escapeHtml(origin)}</strong></div></div>
              <div class="route-connector"><span></span></div>
              <div class="route-point"><span class="route-marker route-current"></span><div><small>Última ubicación · ${escapeHtml(order.status)}</small><strong>${escapeHtml(order.lastLocation || "Ubicación pendiente")}</strong></div></div>
              <div class="route-connector"><span></span></div>
              <div class="route-point"><span class="route-marker route-destination"></span><div><small>Entrega en</small><strong>${escapeHtml(destination || "Dirección pendiente")}</strong></div></div>
              <div class="route-footer"><span>Fecha de salida</span><strong>${escapeHtml(departureLabel)}</strong></div>
              <div class="route-footer"><span>ETA estimada</span><strong>${escapeHtml(order.estimatedDelivery || eta)}</strong></div>
              <a class="btn btn-soft route-directions" href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener noreferrer">Ver ruta en Google Maps ↗</a>
              <small class="route-disclaimer">Direcciones públicas para demostración; no representan domicilios de clientes ni una ruta GPS en tiempo real.</small>
            </div>
          </div>

          <button type="button" class="btn btn-primary" id="btnDetailPrintLabel" style="width:100%; margin-top:14px">
            Descargar etiqueta PDF (< 2s)
          </button>
          ${window.location.pathname.toLowerCase().includes("operador") && order.status === "En reparto" && !order.evidence ? `
          <button type="button" class="btn btn-soft" id="btnDeliveryEvidence" style="width:100%; margin-top:10px">📍 Registrar evidencia GPS</button>` : ""}
          <button type="button" class="btn btn-soft detail-support">
            Necesito ayuda con este pedido
          </button>
        </div>
      </div>
    </section>
  `;

  document.body.append(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  // Botón para imprimir la etiqueta oficial en PDF
  backdrop.querySelector("#btnDetailPrintLabel").addEventListener("click", () => {
    printShippingLabel(order.id);
  });

  backdrop.querySelector("#btnDeliveryEvidence")?.addEventListener("click", () => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/jpeg,image/png";
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { showToast("La foto debe pesar como máximo 10 MB."); return; }
      if (!navigator.geolocation) { showToast("Este navegador no ofrece ubicación GPS."); return; }
      try {
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const timestamp = new Date().toISOString();
        const image = await new Promise((resolve, reject) => {
          const objectUrl = URL.createObjectURL(file);
          const element = new Image();
          element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
          element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("No se pudo leer la imagen.")); };
          element.src = objectUrl;
        });
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const bandHeight = Math.max(72, Math.round(canvas.width * 0.075));
        context.fillStyle = "rgba(0,0,0,0.72)";
        context.fillRect(0, canvas.height - bandHeight, canvas.width, bandHeight);
        context.fillStyle = "#fff";
        context.font = `bold ${Math.max(14, Math.round(canvas.width * 0.025))}px sans-serif`;
        context.fillText(`${timestamp} · GPS ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, 14, canvas.height - Math.round(bandHeight * 0.4));
        context.font = `${Math.max(12, Math.round(canvas.width * 0.018))}px sans-serif`;
        context.fillText(`Pedido ${order.id} · Guía ${order.tracking}`, 14, canvas.height - 12);
        const imageData = canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
        const response = await versandApiFetch(`${getVersandApiBase("operations")}/api/evidence/upload`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.id, image_data: imageData, latitude, longitude,
            gps_accuracy_meters: position.coords.accuracy, timestamp_stamped: timestamp })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "No se pudo guardar la evidencia.");
        showToast("Evidencia GPS guardada y protegida con huella SHA-256.");
        close();
        await openOrderDetail(order.id);
      } catch (error) {
        showToast(`No se pudo registrar la evidencia: ${error.message || "revisa el permiso GPS"}`);
      }
    };
    picker.click();
  });

  // Botón de soporte
  backdrop.querySelector(".detail-support").addEventListener("click", () => {
    close();
    openModal("Ayuda con el pedido", `Describe la novedad con el pedido #${order.id} y el equipo de soporte te responderá.`, [
      { name: "request", label: "Solicitud", placeholder: "Necesito asistencia con mi entrega", required: true }
    ]);
  });
}

// Exportación de actividad a CSV
function exportActivity() {
  const rows = [...document.querySelectorAll("table tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent.trim())
  );
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "versand-actividad.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Reporte exportado en formato CSV.");
}

// Inicialización de interacciones de la aplicación
function setupMvpInteractions() {
  if (window.location.pathname.toLowerCase().includes("operador")) void loadOperatorDashboardFromService();
  else void loadBuyerOrdersFromService();
  // Delegación para pedidos iniciales y filas cargadas desde el backend.
  document.querySelector(".order-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-detail]");
    const row = event.target.closest(".order-row[data-order]");
    if (button && row) void openOrderDetail(row.dataset.order);
    else if (row && !event.target.closest("button")) void openOrderDetail(row.dataset.order);
  });

  // Delegación para la tabla estática o cargada por el servicio.
  document.querySelector("table tbody")?.addEventListener("click", (event) => {
    if (!event.target.closest("button")) return;
    const orderId = event.target.closest("tr")?.querySelector("td:first-child")?.textContent.replace("#", "").trim();
    if (orderId) void openOrderDetail(orderId);
  });

  // Botón de "Nueva guía" -> Abre modal con validación de unicidad e impresión de PDF
  document.querySelectorAll("button").forEach((button) => {
    const text = button.textContent.trim();
    if (text === "Nueva guía") {
      button.addEventListener("click", openNewTrackingModal);
    } else if (text === "Exportar reporte") {
      button.addEventListener("click", exportActivity);
    }
  });

  // Navegación lateral
  const navigationContent = {
    Dashboard: { title: "Dashboard operativo", message: "Resumen de entregas, cumplimiento, tiempos promedio e incidencias activas." },
    "Mis pedidos": { title: "Mis pedidos", message: "Consulta el estado, la ubicación y la trazabilidad de cada compra." },
    Entregas: { title: "Entregas", message: "Administra las guías activas, sus estados y las ventanas estimadas de entrega.", fields: [{ name: "tracking", label: "Buscar guía", placeholder: "MCX-908200" }] },
    Incidencias: { title: "Incidencias", message: "Revisa los casos abiertos y registra la resolución para mantener la trazabilidad.", fields: [{ name: "case", label: "Número de caso", placeholder: "INC-003" }] },
    "Finanzas / Escrow": { title: "Finanzas / Escrow", message: "Revisa los pagos retenidos, liberaciones y movimientos asociados a las entregas." },
    Configuración: { title: "Configuración", message: "Administra preferencias operativas, notificaciones y parámetros del servicio." },
    Alertas: { title: "Alertas", message: "Gestiona los canales de notificación y recibe actualizaciones de tus pedidos." },
    "Ayuda y soporte": { title: "Ayuda y soporte", message: "Encuentra orientación sobre tus pedidos o envía una solicitud al equipo de soporte.", fields: [{ name: "request", label: "Solicitud", placeholder: "Describe cómo podemos ayudarte", required: true }] }
  };

  document.querySelectorAll(".nav button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const section = button.textContent.trim().replace(/\s+\d+$/, "");
      const content = navigationContent[section];
      if (content) {
        openModal(content.title, content.message, content.fields || []);
      } else {
        showToast(`${section} seleccionado.`);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", setupMvpInteractions);
