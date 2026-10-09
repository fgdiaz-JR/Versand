const services = {
  operations: "http://localhost:4001/api/auth/operator",
  buyer: "http://localhost:4002/api/auth/buyer"
};

async function callAuthService(role, credentials) {
  try {
    const response = await fetch(services[role], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials)
    });
    if (!response.ok) throw new Error("Servicio de autenticación no disponible");
    return await response.json();
  } catch (error) {
    // Demo local: conserva el contrato de los dos microservicios mientras no exista backend.
    return { authenticated: true, role, user: role === "operations" ? "Operaciones Versand" : "Laura Gómez", demo: true, serviceUnavailable: true };
  }
}

const logo = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 7.5 12 11l8-3.5M12 11v9M8 5.75v8.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16.5 5.8c2.1 0 3.5 1.4 3.5 3.2 0 2.7-3.5 5.2-3.5 5.2S13 11.7 13 9c0-1.8 1.4-3.2 3.5-3.2Z" fill="currentColor" stroke="var(--surface)" stroke-width=".8"/><circle cx="16.5" cy="9" r="1" fill="var(--surface)"/></svg>`;

function setupTheme() {
  document.querySelector("#themeToggle")?.addEventListener("click", () => {
    const dark = document.body.dataset.theme !== "dark";
    document.body.dataset.theme = dark ? "dark" : "light";
    document.querySelector("#themeToggle").textContent = dark ? "☀" : "☾";
  });
}
