// Ejecutar explícitamente una sola vez con: node backend/provision-demo-users.js
// Crea cuentas ficticias confirmadas y perfiles; nunca imprime las contraseñas.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const envPath = path.join(__dirname, "..", ".env");
let envText = fs.readFileSync(envPath, "utf8");
function readEnv(name) {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^(['"])(.*)\1$/, "$2") || "";
}
function writeEnv(name, value) {
  const line = `${name}=${value}`;
  if (new RegExp(`^${name}=`, "m").test(envText)) envText = envText.replace(new RegExp(`^${name}=.*$`, "m"), line);
  else envText = `${envText.trimEnd()}\n${line}\n`;
}

const baseUrl = readEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!baseUrl || !serviceKey) throw new Error("Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.");

async function request(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}: ${body.msg || body.message || body.error_description || "error no especificado"}`);
  return body;
}

async function getOrCreate(email, password) {
  if (password) {
    const page = await request("/auth/v1/admin/users?page=1&per_page=100");
    const existing = page.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing) return { user: existing, password, created: false };
  }
  const nextPassword = password || crypto.randomBytes(32).toString("base64url");
  try {
    const created = await request("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: nextPassword, email_confirm: true }) });
    return { user: created.user || created, password: nextPassword, created: true };
  } catch (error) {
    if (!/already been registered|already exists/i.test(error.message)) throw error;
    const page = await request("/auth/v1/admin/users?page=1&per_page=100");
    const existing = page.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw error;
    // No reset de contraseña de un usuario preexistente. El dueño debe asignarla.
    return { user: existing, password: "", created: false };
  }
}

async function main() {
  const accounts = [
    { emailKey: "VERSAND_DEMO_BUYER_EMAIL", passwordKey: "VERSAND_DEMO_BUYER_PASSWORD", emailDefault: "comprador.demo@versand.test", role: "buyer", customer_id: "buyer-001", display_name: "Comprador Demo" },
    { emailKey: "VERSAND_DEMO_OPERATOR_EMAIL", passwordKey: "VERSAND_DEMO_OPERATOR_PASSWORD", emailDefault: "operador.demo@versand.test", role: "operator", customer_id: null, display_name: "Operador Demo" }
  ];
  for (const account of accounts) {
    const email = readEnv(account.emailKey) || account.emailDefault;
    const result = await getOrCreate(email, readEnv(account.passwordKey));
    await request("/rest/v1/app_user_profiles?on_conflict=auth_user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ auth_user_id: result.user.id, role: account.role, customer_id: account.customer_id, display_name: account.display_name, is_active: true })
    });
    writeEnv(account.emailKey, email);
    if (result.password) writeEnv(account.passwordKey, result.password);
    console.log(`${result.created ? "Creada" : "Encontrada"} cuenta demo ${account.role}; perfil configurado.`);
    if (!result.password) console.log(`La cuenta existente ${email} conserva su contraseña; no se ha cambiado.`);
  }
  fs.writeFileSync(envPath, envText, "utf8");
  console.log("Variables demo guardadas en .env (ignorado por Git). No se imprimieron contraseñas.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
