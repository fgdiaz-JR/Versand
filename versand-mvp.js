function showToast(message) {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function openModal(title, message, fields = []) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const form = document.createElement("form");
  form.className = "modal";
  form.innerHTML = `<button type="button" class="modal-close" aria-label="Cerrar">×</button><h2>${title}</h2><p>${message}</p>${fields.map((field) => `<label class="field">${field.label}<input name="${field.name}" ${field.required ? "required" : ""} placeholder="${field.placeholder || ""}"></label>`).join("")}<div class="modal-actions"><button type="button" class="btn btn-soft" data-modal-cancel>Cancelar</button><button class="btn btn-primary">Guardar</button></div>`;
  backdrop.append(form);
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  form.querySelector(".modal-close").addEventListener("click", close);
  form.querySelector("[data-modal-cancel]").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  form.addEventListener("submit", (event) => { event.preventDefault(); close(); showToast("Cambios guardados correctamente."); });
}

function openOrderDetail(orderId = "MC-20481") {
  const delivered = orderId === "MC-20397";
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop order-detail-backdrop";
  backdrop.innerHTML = `<section class="modal order-detail" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
    <button type="button" class="modal-close" aria-label="Cerrar">×</button>
    <div class="order-detail-header"><div><span class="eyebrow">Seguimiento del pedido</span><h2 id="order-detail-title">#${orderId}</h2><p>${delivered ? "Kit de café artesanal" : "Audífonos inalámbricos"} · Guía ${delivered ? "MCX-907441" : "MCX-908172"}</p></div><span class="badge ${delivered ? "badge-success" : "badge-warning"}">${delivered ? "Entregado" : "En reparto"}</span></div>
    <div class="order-detail-grid">
      <div class="order-detail-column"><div class="detail-eta"><span class="muted">${delivered ? "Entregado el" : "Entrega estimada"}</span><strong>${delivered ? "2 oct 2026 · 4:18 PM" : "Hoy, entre 4:00 y 6:00 PM"}</strong></div>
        <div class="detail-section"><h3>Historial del envío</h3><div class="timeline"><div class="step done"><div class="dot"></div><div><p class="step-title">Pedido confirmado</p><span class="step-time">3 oct · 9:42 AM</span></div></div><div class="step done"><div class="dot"></div><div><p class="step-title">En tránsito</p><span class="step-time">4 oct · 7:25 AM · Centro Norte</span></div></div><div class="step ${delivered ? "done" : "current"}"><div class="dot"></div><div><p class="step-title">${delivered ? "Entregado" : "En reparto"}</p><span class="step-time">${delivered ? "2 oct · 4:18 PM · Bogotá" : "Hoy · 3:16 PM · Bogotá"}</span>${delivered ? "" : "<p class=\"step-note\">Llegará dentro de la ventana estimada.</p>"}</div></div>${delivered ? "" : '<div class="step"><div class="dot"></div><div><p class="step-title">Entregado</p><span class="step-time">Pendiente</span></div></div>'}</div></div>
        <div class="detail-section"><h3>Información de entrega</h3><div class="info-row"><span>Transportadora</span><strong>Mercado Express</strong></div><div class="info-row"><span>Destino</span><strong>Bogotá, Colombia</strong></div><div class="info-row"><span>Notificaciones</span><strong>Correo y WhatsApp activos</strong></div></div>
      </div>
      <div class="detail-map-column"><div class="detail-section"><div class="detail-section-heading"><h3>Ubicación del envío</h3><span class="muted">${delivered ? "Recorrido final" : "Actualizado hace 8 min"}</span></div><div class="map-visual"><span class="map-route"></span><span class="map-pin origin"></span><span class="map-pin current"></span><span class="map-pin destination"></span><div class="map-caption"><span>${delivered ? "Entrega confirmada · Bogotá" : "Última ubicación: Centro Norte"}</span><span>${delivered ? "Destino final" : "En reparto"}</span></div></div></div><button type="button" class="btn btn-soft detail-support">Necesito ayuda con este pedido</button></div>
    </div>
  </section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector(".detail-support").addEventListener("click", () => { close(); openModal("Ayuda con el pedido", "Describe la situación y el equipo de soporte revisará la trazabilidad.", [{ name: "request", label: "Solicitud", placeholder: "Necesito ayuda con mi entrega", required: true }]); });
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
}

function exportActivity() {
  const rows = [...document.querySelectorAll("table tr")].map((row) => [...row.children].map((cell) => cell.textContent.trim()));
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "versand-actividad.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Reporte exportado en formato CSV.");
}

function setupMvpInteractions() {
  document.querySelectorAll(".order-row[data-order]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openOrderDetail(row.dataset.order);
  }));

  const navigationContent = {
    Dashboard: {
      title: "Dashboard operativo",
      message: "Resumen de entregas, cumplimiento, tiempos promedio e incidencias activas."
    },
    "Mis pedidos": {
      title: "Mis pedidos",
      message: "Consulta el estado, la ubicación y la trazabilidad de cada compra."
    },
    Entregas: {
      title: "Entregas",
      message: "Administra las guías activas, sus estados y las ventanas estimadas de entrega.",
      fields: [{ name: "tracking", label: "Buscar guía", placeholder: "MCX-908200" }]
    },
    Incidencias: {
      title: "Incidencias",
      message: "Revisa los casos abiertos y registra la resolución para mantener la trazabilidad.",
      fields: [{ name: "case", label: "Número de caso", placeholder: "INC-003" }]
    },
    "Finanzas / Escrow": {
      title: "Finanzas / Escrow",
      message: "Revisa los pagos retenidos, liberaciones y movimientos asociados a las entregas."
    },
    Configuración: {
      title: "Configuración",
      message: "Administra preferencias operativas, notificaciones y parámetros del servicio."
    },
    Alertas: {
      title: "Alertas",
      message: "Gestiona los canales de notificación y recibe actualizaciones de tus pedidos."
    },
    "Ayuda y soporte": {
      title: "Ayuda y soporte",
      message: "Encuentra orientación sobre tus pedidos o envía una solicitud al equipo de soporte.",
      fields: [{ name: "request", label: "Solicitud", placeholder: "Describe cómo podemos ayudarte", required: true }]
    }
  };

  document.querySelectorAll(".nav button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".nav button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const section = button.textContent.trim().replace(/\s+\d+$/, "");
    const content = navigationContent[section];
    if (content) {
      openModal(content.title, content.message, content.fields || []);
    } else {
      showToast(`${section} seleccionado.`);
    }
  }));
  document.querySelectorAll("button").forEach((button) => {
    const text = button.textContent.trim();
    if (button.id === "themeToggle" || button.id === "proof" || button.closest("form") || button.closest(".nav")) return;
    if (text === "Exportar reporte") button.addEventListener("click", exportActivity);
    else if (text === "Nueva guía") button.addEventListener("click", () => openModal("Nueva guía", "Registra una guía para activar el seguimiento del pedido.", [{ name: "order", label: "Número de pedido", placeholder: "MC-20490", required: true }, { name: "tracking", label: "Número de guía", placeholder: "MCX-908200", required: true }]));
    else if (text === "Resolver") button.addEventListener("click", () => openModal("Resolver incidencia", "Añade la decisión y deja trazabilidad de la atención.", [{ name: "resolution", label: "Resolución", placeholder: "Describe la acción tomada", required: true }]));
    else if (text === "Abrir") button.addEventListener("click", () => showToast("Detalle de trazabilidad cargado."));
    else if (text === "Ver detalle") button.addEventListener("click", () => openOrderDetail(button.closest("[data-order]")?.dataset.order));
    else if (text === "Ver todos") button.addEventListener("click", () => showToast("Mostrando todas las actividades registradas."));
    else if (text === "Gestionar alertas") button.addEventListener("click", () => openModal("Preferencias de alertas", "Selecciona cómo quieres recibir actualizaciones.", [{ name: "channel", label: "Canales activos", placeholder: "Correo, WhatsApp", required: true }]));
    else if (text === "Contactar soporte") button.addEventListener("click", () => openModal("Contactar soporte", "Describe tu solicitud y el equipo te responderá.", [{ name: "request", label: "Solicitud", placeholder: "Necesito ayuda con mi entrega", required: true }]));
    else if (text === "Ver instrucciones de entrega") button.addEventListener("click", () => openModal("Instrucciones de entrega", "Puedes actualizar referencias, portería y horario de recepción.", [{ name: "instructions", label: "Indicaciones", placeholder: "Dejar en recepción" }]));
    else if (text === "Avisos") button.addEventListener("click", () => showToast("No tienes avisos nuevos."));
    else if (text === "Actualizar") button.addEventListener("click", () => showToast("Datos actualizados desde el servicio."));
    else if (button.getAttribute("aria-label") === "Notificaciones") button.addEventListener("click", () => showToast("No tienes notificaciones nuevas."));
  });
}

document.addEventListener("DOMContentLoaded", setupMvpInteractions);
