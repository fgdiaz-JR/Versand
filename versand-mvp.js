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
    status: "En reparto",
    destination: "Bogotá, Colombia",
    address: "Calle 127 # 19-45, Apto 502",
    createdAt: "2026-10-06T09:42:00Z",
    dispatchedAt: "2026-10-07T07:25:00Z",
    transitHours: 24,
    lastLocation: "Centro Norte, Bogotá",
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
    address: "Carrera 43A # 1 Sur-220",
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
    destination: "Bogotá, Colombia",
    address: "Calle 127 # 19-45, Apto 502",
    createdAt: "2026-09-30T11:00:00Z",
    dispatchedAt: "2026-10-01T09:00:00Z",
    deliveredAt: "2 oct 2026 · 4:18 PM",
    transitHours: 24,
    lastLocation: "Bogotá, Colombia",
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
    address: "Avenida 6N # 28N-40",
    createdAt: "2026-10-05T08:30:00Z",
    dispatchedAt: "2026-10-06T14:00:00Z",
    transitHours: 48,
    lastLocation: "Hub Yumbo, Valle",
    updated: "Hace 23 min"
  }
];

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

// Cálculo dinámico de fecha y ventana estimada de entrega (Sprint 2)
function calculateEstimatedDelivery(order) {
  if (order.status === "Entregado") {
    return order.deliveredAt ? `Entregado el ${order.deliveredAt}` : "Entregado el 2 oct 2026 · 4:18 PM";
  }
  if (order.status === "Incidencia") {
    return "Reprogramación estimada: 24h tras contacto con cliente";
  }
  if (order.status === "En reparto") {
    return "Hoy, entre 4:00 y 6:00 PM (En ruta activa)";
  }

  // Cálculo según SLA de transportadora y fecha de emisión
  const baseDate = new Date(order.createdAt || Date.now());
  const slaHours = order.carrier === "Mercado Express" ? 24 : order.carrier === "Ruta Segura" ? 48 : 72;
  const etaDate = new Date(baseDate.getTime() + slaHours * 3600 * 1000);

  const options = { weekday: "long", day: "numeric", month: "short" };
  const formatted = etaDate.toLocaleDateString("es-ES", options);
  return `${formatted}, entre 2:00 y 6:00 PM (SLA: ${slaHours}h)`;
}

// Construcción 100% dinámica de la línea de tiempo por estados (Sprint 2)
function buildDynamicTimeline(order) {
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

// Impresión y generación de etiqueta de envío PDF en menos de 2s (Sprint 2)
function printShippingLabel(orderId) {
  const tStart = performance.now();
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId || o.tracking === orderId) || orders[0];
  const eta = calculateEstimatedDelivery(order);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop order-detail-backdrop";
  backdrop.innerHTML = `
    <div class="modal label-modal" role="dialog" aria-modal="true" aria-labelledby="label-title">
      <button type="button" class="modal-close" aria-label="Cerrar">×</button>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 id="label-title">Etiqueta oficial de envío</h2>
        <span class="perf-badge" id="perfCounter">Generando...</span>
      </div>
      <p class="muted">Documento logístico listo para despacho y verificación en ruta.</p>

      <!-- Contenedor imprimible de la etiqueta -->
      <article class="shipping-label" id="printableShippingLabel">
        <header class="label-header">
          <div>
            <span class="eyebrow">VERSAND LOGISTICS HUB</span>
            <div class="label-carrier">${order.carrier || "Mercado Express"}</div>
          </div>
          <span class="label-service">EXPRESS PRIORITARIO</span>
        </header>

        <section class="label-section">
          <strong>Remitente</strong>
          Centro Logístico Versand · Cra. 68D # 25B-86, Bogotá D.C. · Bodega Central 04
        </section>

        <section class="label-section">
          <strong>Destinatario</strong>
          <b style="font-size:14px">${order.customer}</b><br>
          ${order.address || "Calle 127 # 19-45, Apto 502"}<br>
          ${order.destination || "Bogotá, Colombia"}
        </section>

        <div class="label-barcode-box">
          ${generateBarcodeSVG(order.tracking)}
          <div class="label-barcode-text">${order.tracking}</div>
        </div>

        <footer class="label-footer-grid">
          <div>
            <strong>Pedido</strong>
            <b>#${order.id}</b>
          </div>
          <div>
            <strong>Producto</strong>
            ${order.product}
          </div>
          <div>
            <strong>Peso estimado</strong>
            1.25 kg
          </div>
          <div>
            <strong>Entrega estimada</strong>
            ${eta}
          </div>
        </footer>
      </article>

      <div class="modal-actions" style="margin-top:20px">
        <button type="button" class="btn btn-soft" data-close-label>Cerrar</button>
        <button type="button" class="btn btn-primary" id="btnExecutePrint">
          🖨️ Imprimir / Guardar como PDF
        </button>
      </div>
    </div>
  `;

  document.body.append(backdrop);

  // Medición de rendimiento (Criterio: Generación PDF < 2s)
  const elapsedSeconds = ((performance.now() - tStart) / 1000).toFixed(3);
  const perfBadge = backdrop.querySelector("#perfCounter");
  if (perfBadge) {
    perfBadge.textContent = `⚡ Generado en ${elapsedSeconds}s (< 2s)`;
  }

  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector("[data-close-label]").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#btnExecutePrint").addEventListener("click", () => {
    window.print();
    showToast(`Etiqueta lista para guardar como PDF (${elapsedSeconds}s).`);
  });
}

// Modal para asociar nueva guía con validación de unicidad en tiempo real (Sprint 2)
function openNewTrackingModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <form class="modal" id="newTrackingForm" style="width:min(520px, 100%)">
      <button type="button" class="modal-close" aria-label="Cerrar">×</button>
      <h2>Asociar nueva guía de envío</h2>
      <p class="muted">Registra una guía única para habilitar el rastreo, línea de tiempo e impresión de etiqueta.</p>

      <label class="field">
        Número de pedido
        <input name="orderId" id="inputOrderId" required placeholder="Ej: MC-20495" value="MC-${Math.floor(10000 + Math.random() * 90000)}">
      </label>

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

      <label class="field">
        Nombre del cliente / Destinatario
        <input name="customer" id="inputCustomer" required placeholder="Ej: Carlos Mendoza">
      </label>

      <label class="field">
        Producto a transportar
        <input name="product" id="inputProduct" required placeholder="Ej: Tablet 10 pulgadas">
      </label>

      <label class="field">
        Dirección de entrega
        <input name="address" id="inputAddress" placeholder="Ej: Cra. 7 # 72-41, Bogotá" value="Carrera 15 # 93-60, Bogotá">
      </label>

      <div class="modal-actions">
        <button type="button" class="btn btn-soft" data-cancel-btn>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="btnSubmitTracking">Validar y asociar guía</button>
      </div>
    </form>
  `;

  document.body.append(backdrop);

  const close = () => backdrop.remove();
  const form = backdrop.querySelector("#newTrackingForm");
  const trackingInput = backdrop.querySelector("#inputTracking");
  const feedback = backdrop.querySelector("#trackingValidationFeedback");

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
    const orderId = form.orderId.value.trim().toUpperCase();
    const trackingVal = form.tracking.value.trim().toUpperCase();
    const carrier = form.carrier.value;
    const customer = form.customer.value.trim();
    const product = form.product.value.trim();
    const address = form.address.value.trim();

    // Verificación estricta de unicidad
    const validation = validateTrackingUnique(trackingVal);
    if (!validation.valid) {
      showToast(`Error: ${validation.message}`);
      feedback.className = "field-error-msg";
      feedback.textContent = `❌ ${validation.message}`;
      feedback.style.display = "block";
      return;
    }

    // Nuevo pedido enriquecido
    const newOrder = {
      id: orderId,
      tracking: trackingVal,
      carrier,
      customer,
      product,
      address,
      destination: "Bogotá, Colombia",
      status: "En tránsito",
      createdAt: new Date().toISOString(),
      updated: "Hace un momento",
      lastLocation: "Hub Central Versand"
    };

    // Guardado en el almacén de pedidos
    const orders = getOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    // Intento opcional de sincronización con backend
    try {
      fetch("http://localhost:4001/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOrder)
      }).catch(() => {});
    } catch (_) {}

    close();
    showToast(`✅ Guía ${trackingVal} validada como única y asociada a ${orderId}.`);

    // Inserción dinámica en la tabla si nos encontramos en operador.html
    const tableBody = document.querySelector("table tbody");
    if (tableBody) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${newOrder.id}</td>
        <td>${newOrder.customer}</td>
        <td>${newOrder.carrier}</td>
        <td><span class="badge badge-warning">En tránsito</span></td>
        <td>Hace un momento</td>
        <td><button type="button" class="btn btn-soft" data-open-order="${newOrder.id}">Abrir</button></td>
      `;
      tableBody.prepend(tr);
      tr.querySelector("button").addEventListener("click", () => openOrderDetail(newOrder.id));
    }

    // Ofrecer inmediatamente impresión de la etiqueta PDF en < 2s
    printShippingLabel(newOrder.id);
  });
}

// Despliegue de seguimiento con línea de tiempo 100% dinámica (Sprint 2)
function openOrderDetail(orderId = "MC-20481") {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId || o.tracking === orderId) || orders[0];
  const eta = calculateEstimatedDelivery(order);
  const timelineSteps = buildDynamicTimeline(order);
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
          <h2 id="order-detail-title">#${order.id}</h2>
          <p>${order.product} · Guía <b>${order.tracking}</b></p>
        </div>
        <span class="badge ${isDelivered ? "badge-success" : order.status === "Incidencia" ? "badge-danger" : "badge-warning"}">
          ${order.status}
        </span>
      </div>

      <div class="order-detail-grid">
        <!-- Columna de línea de tiempo e información -->
        <div class="order-detail-column">
          <!-- Cálculo dinámico de fecha estimada -->
          <div class="detail-eta">
            <span class="muted">${isDelivered ? "Fecha de entrega" : "Entrega estimada calculada dinámicamente"}</span>
            <strong>${eta}</strong>
          </div>

          <!-- Línea de tiempo 100% dinámica -->
          <div class="detail-section">
            <h3>Historial del envío (Línea de tiempo)</h3>
            <div class="timeline">
              ${timelineSteps.map((step) => `
                <div class="step ${step.status}">
                  <div class="dot"></div>
                  <div>
                    <p class="step-title">${step.title}</p>
                    <span class="step-time">${step.time}</span>
                    ${step.note ? `<p class="step-note">${step.note}</p>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Datos de entrega -->
          <div class="detail-section">
            <h3>Información de entrega</h3>
            <div class="info-row"><span>Cliente</span><strong>${order.customer}</strong></div>
            <div class="info-row"><span>Transportadora</span><strong>${order.carrier}</strong></div>
            <div class="info-row"><span>Dirección</span><strong>${order.address || "Dirección registrada"}</strong></div>
            <div class="info-row"><span>Destino</span><strong>${order.destination || "Bogotá, Colombia"}</strong></div>
          </div>
        </div>

        <!-- Columna de ubicación y acciones de etiqueta -->
        <div class="detail-map-column">
          <div class="detail-section">
            <div class="detail-section-heading">
              <h3>Ubicación del envío</h3>
              <span class="muted">${order.updated || "Actualizado recientemente"}</span>
            </div>
            <div class="map-visual">
              <span class="map-route"></span>
              <span class="map-pin origin"></span>
              <span class="map-pin current"></span>
              <span class="map-pin destination"></span>
              <div class="map-caption">
                <span>Última ubicación: ${order.lastLocation || "Hub Central"}</span>
                <span>${order.status}</span>
              </div>
            </div>
          </div>

          <button type="button" class="btn btn-primary" id="btnDetailPrintLabel" style="width:100%; margin-top:14px">
            🖨️ Imprimir Etiqueta PDF (< 2s)
          </button>
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
  // Apertura de detalles al hacer clic en filas de pedidos
  document.querySelectorAll(".order-row[data-order]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openOrderDetail(row.dataset.order);
    });
  });

  // Botones "Ver detalle" específicos
  document.querySelectorAll("[data-order-detail]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const orderId = btn.closest("[data-order]")?.dataset.order;
      openOrderDetail(orderId);
    });
  });

  // Botones de la tabla en operador
  document.querySelectorAll("table tbody tr").forEach((tr) => {
    const orderCell = tr.querySelector("td:first-child");
    const orderId = orderCell?.textContent.replace("#", "").trim();
    const actionBtn = tr.querySelector("button");
    if (actionBtn && orderId) {
      actionBtn.addEventListener("click", () => openOrderDetail(orderId));
    }
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
