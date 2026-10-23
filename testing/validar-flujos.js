// Pruebas de aceptación locales para los datos demo de Versand.
// Requiere los servicios en 4001/4002 y la página estática en 5500.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
require("../backend/supabase-client"); // carga .env sin imprimir valores

const ROOT = path.resolve(__dirname, "..");
const OUT = __dirname;
const DOWNLOADS = path.join(OUT, "descargas");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const nowKey = Date.now().toString(36).toUpperCase();
const orderIds = ["A", "B", "C", "D"].map((suffix) => `TST-${nowKey}-${suffix}`);
const guideNumbers = orderIds.map((id) => `TST-G-${id.replaceAll("-", "")}`);
const results = [];
let chrome;
let ws;
let sessionId;
let targetId;

fs.mkdirSync(DOWNLOADS, { recursive: true });

function assert(condition, message) { if (!condition) throw new Error(message); }
function result(id, title, ok, detail) {
  results.push({ id, title, ok, detail, date: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }) });
}
async function api(port, route, token, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...options, headers });
  const text = await response.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
async function rest(tableRoute, options = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${base}/rest/v1/${tableRoute}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) : null;
}
async function createPaidOrder(orderId, suffix) {
  const payload = {
    order_id: orderId, order_number: `QA-${nowKey}-${suffix}`, customer_id: "buyer-001",
    customer_name: "Comprador Demo", customer_email: process.env.VERSAND_DEMO_BUYER_EMAIL,
    seller_id: `seller-qa-${suffix}`, city: "Bogotá, Colombia", address: "Dirección sintética QA 100",
    product_name: `Paquete sintético ${suffix}`, total_amount: 23000 + suffix.charCodeAt(0), sla_hours: 24
  };
  const response = await api(4001, "/api/integrations/order-paid", null, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.INTEGRATION_SHARED_SECRET}` }, body: JSON.stringify(payload)
  });
  assert(response.status === 201, `OrderPaid ${orderId}: HTTP ${response.status}`);
  return response.body.order;
}
async function assign(orderId, tracking, operatorToken) {
  const response = await api(4001, `/api/orders/${encodeURIComponent(orderId)}/shipping`, operatorToken, {
    method: "POST", body: JSON.stringify({ carrier: "Transportadora QA", tracking_number: tracking, sla_hours: 24 })
  });
  assert(response.status === 200, `Asignación ${orderId}: HTTP ${response.status} ${response.body?.message || ""}`);
}
async function carrierEvent(orderId, tracking, status, signatureOverride) {
  const payload = { event_id: `qa-${orderId}-${status.replaceAll(" ", "-")}`, order_id: orderId, tracking_number: tracking,
    status, location: "Centro sintético de pruebas", note: "Evento de validación automatizada", occurred_at: "2026-10-22T17:00:00.000Z" };
  const raw = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", process.env.CARRIER_WEBHOOK_SECRET).update(raw).digest("hex");
  return api(4001, "/api/webhooks/carrier", null, { method: "POST", headers: { "Content-Type": "application/json", "x-carrier-signature": signatureOverride || `sha256=${hmac}` }, body: raw });
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    const pending = new Map();
    let seq = 0;
    ws.addEventListener("open", () => resolve({
      send(method, params = {}, useSession = true) {
        const id = ++seq;
        return new Promise((ok, fail) => {
          pending.set(id, { ok, fail });
          const message = { id, method, params };
          if (useSession && sessionId) message.sessionId = sessionId;
          ws.send(JSON.stringify(message));
        });
      }
    }));
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const callbacks = pending.get(message.id); pending.delete(message.id);
      if (message.error) callbacks.fail(new Error(message.error.message)); else callbacks.ok(message.result || {});
    });
    ws.addEventListener("error", reject);
  });
}
async function waitFor(check, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Tiempo de espera agotado en navegador.");
}
async function evaluate(expression) {
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}
async function goto(url) { await cdp.send("Page.navigate", { url }); await new Promise((resolve) => setTimeout(resolve, 900)); }
async function screenshot(name) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, "base64"));
}
async function login(role) {
  await goto("http://127.0.0.1:5500/index.html");
  await waitFor(async () => (await evaluate("typeof callAuthService === 'function' && Boolean(document.querySelector('#loginForm'))")) === true);
  await evaluate(`(()=>{const selected=document.querySelector('[data-role=${role === "buyer" ? "buyer" : "operations"}]');selected?.click();if(typeof currentRole!=='undefined')currentRole=${JSON.stringify(role)};document.querySelectorAll('[data-role]').forEach(button=>button.classList.toggle('active',button===selected));return true})()`);
  const email = role === "buyer" ? process.env.VERSAND_DEMO_BUYER_EMAIL : process.env.VERSAND_DEMO_OPERATOR_EMAIL;
  const password = role === "buyer" ? process.env.VERSAND_DEMO_BUYER_PASSWORD : process.env.VERSAND_DEMO_OPERATOR_PASSWORD;
  const values = await evaluate(`(()=>{document.querySelector('#email').value=${JSON.stringify(email)};document.querySelector('#password').value=${JSON.stringify(password)};return {email:document.querySelector('#email').value,passwordLength:document.querySelector('#password').value.length,role:document.querySelector('[data-role].active')?.dataset.role}})()`);
  assert(values?.email === email && values.passwordLength > 0 && values.role === role, `No se pudieron completar los campos del perfil ${role}: ${JSON.stringify({ email: values?.email, passwordLength: values?.passwordLength, role: values?.role })}.`);
  await evaluate("document.querySelector('#loginForm button[type=submit]').click()");
  const expected = role === "buyer" ? "/comprador.html" : "/operador.html";
  try { await waitFor(async () => (await evaluate("location.pathname")) === expected); }
  catch (error) {
    await screenshot(`fallo-login-${role}.png`).catch(() => {});
    const state = await evaluate("JSON.stringify({path:location.pathname,error:document.querySelector('#loginError')?.textContent,status:document.querySelector('#serviceStatus')?.textContent})").catch(() => "sin estado");
    throw new Error(`No inició sesión ${role}: ${state}. ${error.message}`);
  }
  const minimumRows = role === "buyer" ? 2 : 4;
  await waitFor(async () => (await evaluate(role === "buyer" ? "document.querySelectorAll('.order-list .order-row').length" : "document.querySelectorAll('table tbody tr').length")) >= minimumRows);
}
async function captureReport(entries) {
  fs.writeFileSync(path.join(OUT, "resultados.json"), JSON.stringify(entries, null, 2), "utf8");
  await goto("http://127.0.0.1:5500/testing/reporte.html");
  await evaluate(`localStorage.setItem('versand.testing.results',${JSON.stringify(JSON.stringify(entries))})`);
  for (const item of entries) {
    await goto(`http://127.0.0.1:5500/testing/reporte.html?case=${encodeURIComponent(item.id)}`);
    await waitFor(async () => (await evaluate("document.querySelector('#result .pill')?.textContent")) !== "CARGANDO");
    await screenshot(`${item.id}.png`);
  }
}

let cdp;
async function run() {
  assert(process.env.INTEGRATION_SHARED_SECRET, "Falta INTEGRATION_SHARED_SECRET en .env.");
  assert(process.env.CARRIER_WEBHOOK_SECRET, "Falta CARRIER_WEBHOOK_SECRET en .env.");
  const [buyer, operator] = await Promise.all([
    require("../backend/supabase-client").signInWithPassword(process.env.VERSAND_DEMO_BUYER_EMAIL, process.env.VERSAND_DEMO_BUYER_PASSWORD),
    require("../backend/supabase-client").signInWithPassword(process.env.VERSAND_DEMO_OPERATOR_EMAIL, process.env.VERSAND_DEMO_OPERATOR_PASSWORD)
  ]);
  const buyerToken = buyer.access_token;
  const operatorToken = operator.access_token;
  let localServer;
  let evidencePath;
  let testPdf;
  try {
    const buyerOrders = await api(4002, "/api/orders", buyerToken);
    const operatorOrders = await api(4001, "/api/orders", operatorToken);
    assert(buyerOrders.status === 200 && buyerOrders.body.every((order) => order.customer_id === "buyer-001"), "Comprador consultó pedidos ajenos o falló la consulta.");
    assert(operatorOrders.status === 200 && operatorOrders.body.length >= 4, "Operador no ve los pedidos demo esperados.");
    result("01-roles", "Autenticación y aislamiento por rol", true, `Comprador: ${buyerOrders.body.length} pedidos propios. Operador: ${operatorOrders.body.length} pedidos visibles. Ambos perfiles Supabase autenticados.`);

    const timeline = await api(4002, "/api/orders/MC-20481", buyerToken);
    assert(timeline.status === 200 && timeline.body.events.length >= 4 && timeline.body.estimatedDelivery, "Historial o ETA demo incompletos.");
    result("02-timeline", "Línea de tiempo y ETA (HU-01)", true, `${timeline.body.events.length} eventos; estado ${timeline.body.status}; ETA: ${timeline.body.estimatedDelivery}.`);

    const duplicate = await api(4001, "/api/tracking/validate?tracking=MCX-908172&orderId=TST-NOT-EXIST", operatorToken);
    const unique = await api(4001, "/api/tracking/validate?tracking=QA-GUIDE-UNIQUE-${nowKey}&orderId=TST-NOT-EXIST", operatorToken);
    assert(duplicate.status === 200 && duplicate.body.valid === false, "No detectó la guía demo duplicada.");
    assert(unique.status === 200 && unique.body.valid === true, "Rechazó una guía única.");
    await createPaidOrder(orderIds[0], "A");
    await assign(orderIds[0], guideNumbers[0], operatorToken);
    result("03-unique-guide", "Guía única y conflicto por duplicado (HU-02)", true, `Guía demo repetida rechazada; guía ${guideNumbers[0]} asignada al pedido temporal ${orderIds[0]}.`);

    const invalid = await carrierEvent(orderIds[0], guideNumbers[0], "En tránsito", `sha256=${"0".repeat(64)}`);
    assert(invalid.status === 401, `Firma inválida recibió HTTP ${invalid.status}, se esperaba 401.`);
    const accepted = await carrierEvent(orderIds[0], guideNumbers[0], "En tránsito");
    assert(accepted.status === 200 && accepted.body.event.signature_verified, "Webhook con firma válida no fue aceptado.");
    const eventCountBeforeDuplicate = (await api(4001, `/api/orders/${orderIds[0]}`, operatorToken)).body.events.length;
    const repeated = await carrierEvent(orderIds[0], guideNumbers[0], "En tránsito");
    const eventCountAfterDuplicate = (await api(4001, `/api/orders/${orderIds[0]}`, operatorToken)).body.events.length;
    assert(repeated.status === 200 && eventCountBeforeDuplicate === eventCountAfterDuplicate, "Webhook repetido duplicó evento.");
    result("04-webhook", "HMAC, historial e idempotencia (HU-04)", true, `Firma inválida: HTTP ${invalid.status}. Firma válida: HTTP ${accepted.status}. Reenvío: HTTP ${repeated.status}, eventos sin duplicar.`);

    const notification = accepted.body.pushNotification;
    assert(notification?.status === "PENDING", "La notificación del webhook no quedó registrada como pendiente.");
    result("05-push-queue", "Cola de notificación Push", true, `Evento encolado con estado ${notification.status}. No se declara entrega externa; no hay proveedor del Equipo 3 conectado.`);

    await createPaidOrder(orderIds[1], "B");
    const pqr = await api(4002, `/api/orders/${orderIds[1]}/dispute`, buyerToken, { method: "POST", body: JSON.stringify({ reason: "Caso sintético para validar congelamiento" }) });
    assert(pqr.status === 200 && pqr.body.status === "FROZEN_DISPUTE", `PQR no congeló fondos: HTTP ${pqr.status}.`);
    const pqrOutbox = await rest(`accounting_outbox?order_id=eq.${orderIds[1]}&select=event_type,delivery_status`);
    assert(pqrOutbox.some((row) => row.event_type === "FundsFrozen"), "No se encoló FundsFrozen.");
    result("06-pqr-freeze", "PQR congela fondos y crea evento contable (HU-03)", true, `Custodia ${pqr.body.status}; FundsFrozen en outbox ${pqrOutbox.find((row) => row.event_type === "FundsFrozen").delivery_status}.`);

    await createPaidOrder(orderIds[3], "D");
    await assign(orderIds[3], guideNumbers[3], operatorToken);
    const delivered = await carrierEvent(orderIds[3], guideNumbers[3], "Entregado");
    assert(delivered.status === 200, "No se pudo registrar la entrega para iniciar las 72 horas.");
    const retained = await api(4001, `/api/escrow/${orderIds[3]}`, operatorToken);
    assert(retained.body.status === "RETAINED" && retained.body.autoReleaseAt, "La entrega no inició la retención Escrow.");
    await rest(`escrow_vault?order_id=eq.${orderIds[3]}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ auto_release_at: new Date(Date.now() - 5000).toISOString() }) });
    await api(4001, `/api/orders/${orderIds[3]}/release`, operatorToken, { method: "POST", body: JSON.stringify({ resolvedBy: "QA local" }) });
    const released = await api(4001, `/api/escrow/${orderIds[3]}`, operatorToken);
    const releaseOutbox = await rest(`accounting_outbox?order_id=eq.${orderIds[3]}&select=event_type,delivery_status`);
    assert(released.body.status === "RELEASED" && releaseOutbox.some((row) => row.event_type === "FundsReleased"), "No se completó la liberación o su evento contable.");
    result("07-escrow-release", "Retención de 72 h y liberación automática (HU-03)", true, `Entrega inició ${retained.body.status}; vencimiento sintético aplicado al pedido temporal; estado final ${released.body.status}; FundsReleased en outbox.`);

    await createPaidOrder(orderIds[2], "C");
    await assign(orderIds[2], guideNumbers[2], operatorToken);
    const inDelivery = await carrierEvent(orderIds[2], guideNumbers[2], "En reparto");
    assert(inDelivery.status === 200, "No se pudo poner el pedido en reparto.");
    const image = fs.readFileSync(path.join(OUT, "demo-package.png")).toString("base64");
    const evidence = await api(4001, "/api/evidence/upload", operatorToken, { method: "POST", body: JSON.stringify({
      order_id: orderIds[2], image_data: `data:image/png;base64,${image}`, latitude: 4.711, longitude: -74.0721,
      gps_accuracy_meters: 5, timestamp_stamped: new Date().toISOString()
    }) });
    assert(evidence.status === 201 && evidence.body.evidence.hash_integrity && evidence.body.benchmark?.slaCompliant, `Carga GPS/evidencia falló o excedió el SLA: HTTP ${evidence.status}.`);
    evidencePath = evidence.body.evidence.image_url;
    const visibleToBuyer = await api(4002, `/api/evidence/${orderIds[2]}`, buyerToken);
    assert(visibleToBuyer.status === 200 && visibleToBuyer.body.latitude === 4.711, "El comprador no recibió acceso firmado a la evidencia de su pedido.");
    result("08-evidence", "Foto sintética, marca GPS, hash y acceso firmado (HU-06)", true, `HTTP ${evidence.status}; carga ${evidence.body.benchmark.elapsedSeconds}s (< 3s: ${evidence.body.benchmark.slaCompliant}); hash SHA-256 presente; URL privada visible al comprador.`);

    const tempDir = path.join(require("node:os").tmpdir(), `versand-chrome-${process.pid}`);
    chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--no-sandbox", "--remote-debugging-port=9222", `--user-data-dir=${tempDir}`, "--window-size=1440,1000"], { stdio: "ignore", windowsHide: true });
    let version;
    await waitFor(async () => { try { version = await (await fetch("http://127.0.0.1:9222/json/version")).json(); return Boolean(version.webSocketDebuggerUrl); } catch { return false; } }, 15000);
    cdp = await connectCdp(version.webSocketDebuggerUrl);
    const target = await cdp.send("Target.createTarget", { url: "about:blank" }, false); targetId = target.targetId;
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true }, false); sessionId = attached.sessionId;
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS }, false);
    await captureReport(results);
    await login("buyer");
    await waitFor(async () => (await evaluate(`Boolean(document.querySelector('[data-order=${JSON.stringify(orderIds[2])}]'))`)) === true);
    const buyerRowCount = await evaluate("document.querySelectorAll('.order-list .order-row').length");
    assert(buyerRowCount >= 2, "El dashboard comprador no cargó pedidos desde Supabase.");
    await screenshot("09-comprador-dashboard.png");
    await evaluate("document.querySelector('[data-order=MC-20481] [data-order-detail]').click()");
    await waitFor(async () => await evaluate("Boolean(document.querySelector('.order-detail-backdrop'))"));
    await screenshot("10-linea-tiempo-eta.png");
    await evaluate("document.querySelector('#btnDetailPrintLabel').click()");
    await waitFor(async () => await evaluate("Boolean(document.querySelector('.toast'))"));
    await screenshot("11-descarga-pdf.png");
    const pdfFile = path.join(DOWNLOADS, "etiqueta-MCX-908172.pdf");
    await waitFor(() => fs.existsSync(pdfFile), 10000);
    assert(fs.readFileSync(pdfFile).subarray(0, 8).toString("ascii").startsWith("%PDF-1."), "La descarga no contiene un PDF válido.");
    testPdf = pdfFile;
    result("09-pdf-download", "Descarga automática de etiqueta PDF (HU-02)", true, `Archivo generado: ${path.basename(testPdf)}. Cabecera PDF correcta; descarga iniciada desde la vista del pedido.`);

    await evaluate("sessionStorage.removeItem('versand.session');location.href='index.html'");
    await waitFor(async () => (await evaluate("location.pathname")) === "/index.html");
    await login("operations");
    const operatorRowCount = await evaluate("document.querySelectorAll('table tbody tr').length");
    assert(operatorRowCount >= 4, "Dashboard operador no cargó pedidos demo.");
    await screenshot("12-operador-dashboard.png");
    await waitFor(async () => await evaluate("typeof openOrderDetail === 'function'"));
    await evaluate(`openOrderDetail(${JSON.stringify(orderIds[2])})`);
    await waitFor(async () => await evaluate("Boolean(document.querySelector('.order-detail-backdrop img[alt=\\\"Evidencia de entrega\\\"]'))"));
    await screenshot("13-evidencia-en-detalle.png");
    result("10-ui-roles-pdf-evidence", "Vistas autenticadas y evidencia mostrada", true, `Dashboard comprador con ${buyerRowCount} pedidos; operador con ${operatorRowCount}; pedido con evidencia visible y PDF descargado.`);

    const entries = [...results];
    await captureReport(entries);
    console.log(`Validaciones aprobadas: ${entries.filter((item) => item.ok).length}/${entries.length}. Capturas guardadas en ${OUT}`);
  } finally {
    if (evidencePath) {
      try {
        const rows = await rest(`delivery_evidence?order_id=eq.${orderIds[2]}&select=image_url`);
        const objectPath = rows?.[0]?.image_url;
        if (objectPath) {
          const base = process.env.SUPABASE_URL.replace(/\/$/, "");
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          await fetch(`${base}/storage/v1/object/${encodeURIComponent(process.env.SUPABASE_EVIDENCE_BUCKET || "delivery-evidence")}/${objectPath.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
        }
      } catch (error) { console.error("Limpieza de objeto Storage:", error.message); }
    }
    try { await rest(`orders?id=in.(${orderIds.join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); }
    catch (error) { console.error("Limpieza de pedidos temporales:", error.message); }
    try { const db = require("../backend/supabase-client"); await db.signOut(buyerToken); await db.signOut(operatorToken); } catch {}
    if (ws?.readyState === WebSocket.OPEN) ws.close();
    if (chrome && !chrome.killed) chrome.kill();
  }
}

run().catch((error) => {
  console.error(`VALIDACIÓN FALLIDA: ${error.stack || error.message}`);
  const fallback = results.length ? results : [{ id: "00-runner", title: "Ejecución de validaciones", ok: false, detail: error.message, date: new Date().toLocaleString("es-CO") }];
  fs.writeFileSync(path.join(OUT, "resultados.json"), JSON.stringify(fallback, null, 2), "utf8");
  process.exitCode = 1;
});
