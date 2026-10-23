const services = window.VERSAND_API_BASES || {
  operations: "http://localhost:4001",
  buyer: "http://localhost:4002"
};

function getVersandSession() {
  try { return JSON.parse(sessionStorage.getItem("versand.session") || "null"); }
  catch { return null; }
}

async function callAuthService(role, credentials) {
  const base = services[role];
  if (!base) return { authenticated: false, message: "Perfil de acceso inválido." };
  if (!/^https:\/\//i.test(base) && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return { authenticated: false, message: "Falta configurar la URL HTTPS del servicio en versand-config.js." };
  }
  try {
    const response = await fetch(`${base}/api/auth/${role === "operations" ? "operator" : "buyer"}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.authenticated) return { authenticated: false, message: result.message || "No fue posible iniciar sesión." };
    const session = { ...result, role, apiBase: base };
    sessionStorage.setItem("versand.session", JSON.stringify(session));
    return session;
  } catch {
    return { authenticated: false, message: "No se pudo conectar con el servicio. Verifica que el backend esté iniciado." };
  }
}

async function versandApiFetch(url, options = {}) {
  const session = getVersandSession();
  if (!session?.access_token) throw new Error("Inicia sesión para continuar.");
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    sessionStorage.removeItem("versand.session");
    window.location.assign("index.html");
  }
  return response;
}

function requireVersandSession(role) {
  const session = getVersandSession();
  if (!session?.access_token || session.role !== role) {
    window.location.replace("index.html");
    return null;
  }
  return session;
}

async function logoutVersand() {
  const session = getVersandSession();
  try { if (session?.access_token) await versandApiFetch(`${session.apiBase}/api/auth/logout`, { method: "POST" }); }
  catch { /* La sesión local también se elimina cuando el backend no responde. */ }
  sessionStorage.removeItem("versand.session");
  window.location.assign("index.html");
}

const logo = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 7.5 12 11l8-3.5M12 11v9M8 5.75v8.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16.5 5.8c2.1 0 3.5 1.4 3.5 3.2 0 2.7-3.5 5.2-3.5 5.2S13 11.7 13 9c0-1.8 1.4-3.2 3.5-3.2Z" fill="currentColor" stroke="var(--surface)" stroke-width=".8"/><circle cx="16.5" cy="9" r="1" fill="var(--surface)"/></svg>`;

function setupTheme() {
  document.querySelector("#themeToggle")?.addEventListener("click", () => {
    const dark = document.body.dataset.theme !== "dark";
    document.body.dataset.theme = dark ? "dark" : "light";
    document.querySelector("#themeToggle").textContent = dark ? "☀" : "☾";
  });
}
