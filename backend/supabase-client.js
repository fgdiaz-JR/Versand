/**
 * Versand - Conector de Base de Datos Supabase (PostgreSQL)
 * Soporta conexión real a Supabase REST API y almacenamiento persistente local
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadEnvironmentFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}
loadEnvironmentFile();

// Configuración de Supabase por variables de entorno o archivo .env
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_EVIDENCE_BUCKET = process.env.SUPABASE_EVIDENCE_BUCKET || "delivery-evidence";
const IS_SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
if ((SUPABASE_URL && !SUPABASE_KEY) || (!SUPABASE_URL && SUPABASE_KEY)) {
  throw new Error("Configura juntos SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY; la clave anon no se admite en el backend.");
}

// Archivo local de persistencia para modo desarrollo/offline
const LOCAL_DB_FILE = path.join(__dirname, "local_db.json");

// Datos iniciales de arranque basados en seed.sql
const DEFAULT_SEED = {
  orders: [
    {
      id: "MC-20481",
      order_number: "ORD-2026-8812",
      tracking_number: "MCX-908172",
      carrier: "Mercado Express",
      customer_id: "buyer-001",
      customer_name: "Laura Gómez",
      customer_phone: "+573105550192",
      customer_email: "laura.gomez@versand.co",
      seller_id: "seller-901",
      destination_city: "Bogotá, Colombia",
      destination_address: "Cra. 6 #15-88, Museo del Oro, Bogotá",
      product_name: "Audífonos inalámbricos con cancelación activa",
      total_amount: 320000.00,
      status: "En reparto",
      sla_hours: 24,
      estimated_delivery_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      delivered_at: null,
      last_location: "Centro Internacional, Bogotá",
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    },
    {
      id: "MC-20397",
      order_number: "ORD-2026-7441",
      tracking_number: "MCX-907441",
      carrier: "Mercado Express",
      customer_id: "buyer-001",
      customer_name: "Laura Gómez",
      customer_phone: "+573105550192",
      customer_email: "laura.gomez@versand.co",
      seller_id: "seller-504",
      destination_city: "Bogotá, Colombia",
      destination_address: "Carrera 7 #28-66, Museo Nacional de Colombia, Bogotá",
      product_name: "Kit de café artesanal colombiano de origen",
      total_amount: 185000.00,
      status: "Entregado",
      sla_hours: 24,
      estimated_delivery_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
      delivered_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
      last_location: "Calle 127 # 19-45, Bogotá",
      created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString()
    },
    {
      id: "MC-20479",
      order_number: "ORD-2026-8055",
      tracking_number: "MCX-908055",
      carrier: "Ruta Segura",
      customer_id: "buyer-002",
      customer_name: "Andrés Rojas",
      customer_phone: "+573124440911",
      customer_email: "andres.rojas@correo.co",
      seller_id: "seller-312",
      destination_city: "Medellín, Colombia",
      destination_address: "Carrera 52 #52-43, Museo de Antioquia, Medellín",
      product_name: "Teclado mecánico RGB Switch Brown",
      total_amount: 410000.00,
      status: "Entregado",
      sla_hours: 48,
      estimated_delivery_at: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
      delivered_at: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
      last_location: "Poblado, Medellín",
      created_at: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 80 * 3600 * 1000).toISOString()
    },
    {
      id: "MC-20463",
      order_number: "ORD-2026-7990",
      tracking_number: "MCX-907990",
      carrier: "Coordinadora",
      customer_id: "buyer-003",
      customer_name: "Sofía Martínez",
      customer_phone: "+573148881234",
      customer_email: "sofia.martinez@correo.co",
      seller_id: "seller-780",
      destination_city: "Cali, Colombia",
      destination_address: "Carrera 1 #5-105 Oeste, Museo La Tertulia, Cali",
      product_name: "Monitor 27 pulgadas 4K UHD UltraSlim",
      total_amount: 1450000.00,
      status: "Incidencia",
      sla_hours: 72,
      estimated_delivery_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      delivered_at: null,
      last_location: "Hub Yumbo, Valle",
      created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    }
  ],
  tracking_events: [
    {
      id: "evt-001",
      order_id: "MC-20481",
      tracking_number: "MCX-908172",
      status: "Confirmado",
      location: "Carrera 7 #28-66, Museo Nacional de Colombia, Bogotá",
      checkpoint_note: "Origen de ruta de demostración; dirección pública del Museo Nacional de Colombia.",
      source: "system_event",
      signature_verified: true,
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    },
    {
      id: "evt-002",
      order_id: "MC-20481",
      tracking_number: "MCX-908172",
      status: "Preparado",
      location: "Bodega Central Versand",
      checkpoint_note: "Etiqueta generada e impresa en menos de 2s. Rotulado oficial (Equipo 1)",
      source: "manual",
      signature_verified: true,
      created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString()
    },
    {
      id: "evt-003",
      order_id: "MC-20481",
      tracking_number: "MCX-908172",
      status: "En tránsito",
      location: "Hub Regional Fontibón",
      checkpoint_note: "Despachado en camión hacia estación local",
      source: "carrier_webhook",
      signature_verified: true,
      created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString()
    },
    {
      id: "evt-004",
      order_id: "MC-20481",
      tracking_number: "MCX-908172",
      status: "En reparto",
      location: "Centro Internacional, Bogotá",
      checkpoint_note: "Asignado a mensajero express en ruta de última milla",
      source: "carrier_webhook",
      signature_verified: true,
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    },
    {
      id: "evt-101",
      order_id: "MC-20397",
      tracking_number: "MCX-907441",
      status: "Confirmado",
      location: "Cra. 6 #15-88, Museo del Oro, Bogotá",
      checkpoint_note: "Origen de ruta de demostración; dirección pública del Museo del Oro.",
      source: "system_event",
      signature_verified: true,
      created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
    },
    {
      id: "evt-102",
      order_id: "MC-20397",
      tracking_number: "MCX-907441",
      status: "Entregado",
      location: "Carrera 7 #28-66, Museo Nacional de Colombia, Bogotá",
      checkpoint_note: "Recibido por Laura Gómez a satisfacción. Evidencia fotográfica y GPS capturada.",
      source: "carrier_webhook",
      signature_verified: true,
      created_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString()
    }
  ],
  escrow_vault: [
    {
      id: "esc-001",
      order_id: "MC-20397",
      seller_id: "seller-504",
      retained_amount: 185000.00,
      status: "RETAINED", // RETAINED, RELEASED, FROZEN_DISPUTE
      retention_started_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
      auto_release_at: new Date(Date.now() + 52 * 3600 * 1000).toISOString(), // 72h total -> 52h restantes
      released_at: null,
      dispute_id: null,
      dispute_reason: null,
      dispute_registered_at: null,
      accounting_notified: false
    },
    {
      id: "esc-002",
      order_id: "MC-20479",
      seller_id: "seller-312",
      retained_amount: 410000.00,
      status: "RELEASED",
      retention_started_at: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
      auto_release_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      released_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      dispute_id: null,
      dispute_reason: null,
      dispute_registered_at: null,
      accounting_notified: true
    },
    {
      id: "esc-003",
      order_id: "MC-20481",
      seller_id: "seller-901",
      retained_amount: 320000.00,
      status: "AWAITING_DELIVERY",
      retention_started_at: null,
      auto_release_at: null,
      released_at: null,
      dispute_id: null,
      dispute_reason: null,
      dispute_registered_at: null,
      accounting_notified: false
    }
  ],
  delivery_evidence: [
    {
      id: "evi-001",
      order_id: "MC-20397",
      tracking_number: "MCX-907441",
      image_url: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=700&q=80",
      latitude: 4.7011920,
      longitude: -74.0438150,
      gps_accuracy_meters: 3.8,
      timestamp_stamped: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
      hash_integrity: "a6b47c0e812d4a199fe712bc98124efac01289df712bbcf190246a4891120011"
    }
  ],
  notification_logs: [
    {
      id: "notif-001",
      order_id: "MC-20481",
      event_type: "EstadoCambiado",
      recipient_id: "buyer-001",
      channel: "Push",
      delivery_latency_ms: null,
      delivery_status: "PENDING",
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    }
  ],
  accounting_outbox: []
};

// Cargar o inicializar almacenamiento local
function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const content = fs.readFileSync(LOCAL_DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[DB] Error al leer local_db.json, restableciendo con semilla:", err.message);
  }
  saveLocalDb(DEFAULT_SEED);
  return JSON.parse(JSON.stringify(DEFAULT_SEED));
}

function saveLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[DB] Error guardando local_db.json:", err.message);
  }
}

// Cliente PostgREST Supabase
async function supabaseFetch(table, options = {}) {
  if (!IS_SUPABASE_CONFIGURED) return null;
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}${options.query || ""}`;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": options.prefer || "return=representation"
  };

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) {
      const errText = await res.text();
      const error = new Error(`Supabase ${table} respondió ${res.status}: ${errText}`);
      error.status = res.status;
      try { error.code = JSON.parse(errText).code; } catch {}
      throw error;
    }
    const responseText = await res.text();
    return responseText ? JSON.parse(responseText) : [];
  } catch (err) {
    if (err.status) throw err;
    throw new Error(`No se pudo conectar con Supabase para ${table}: ${err.message}`);
  }
}

function storageObjectPath(pathname) {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

async function uploadEvidenceObject(pathname, bytes, contentType) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(SUPABASE_EVIDENCE_BUCKET)}/${storageObjectPath(pathname)}`;
  const response = await fetch(url, { method: "POST", headers: {
    apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": contentType, "x-upsert": "false"
  }, body: bytes });
  if (!response.ok) throw new Error(`Supabase Storage respondió ${response.status}: ${await response.text()}`);
}

async function createEvidenceSignedUrl(pathname) {
  if (!pathname || !IS_SUPABASE_CONFIGURED) return null;
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/sign/${encodeURIComponent(SUPABASE_EVIDENCE_BUCKET)}/${storageObjectPath(pathname)}`;
  const response = await fetch(url, { method: "POST", headers: {
    apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json"
  }, body: JSON.stringify({ expiresIn: 300 }) });
  if (!response.ok) throw new Error(`No se pudo firmar la URL de evidencia (${response.status}): ${await response.text()}`);
  const result = await response.json();
  const signedPath = result.signedURL || result.signedUrl;
  if (signedPath) return new URL(signedPath.replace(/^\/+/, ""), `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/`).toString();
  throw new Error("Supabase Storage no devolvió la URL firmada.");
}

// ==============================================================================
// MÉTODOS DE LA CAPA DE DATOS DEL MÓDULO DE SEGUIMIENTO
// ==============================================================================

const db = {
  isConfigured() {
    return IS_SUPABASE_CONFIGURED;
  },

  getStatus() {
    return {
      supabaseConfigured: IS_SUPABASE_CONFIGURED,
      url: IS_SUPABASE_CONFIGURED ? SUPABASE_URL : "Modo Local / Supabase Desconectado",
      storageType: IS_SUPABASE_CONFIGURED ? "Supabase (PostgreSQL Remoto)" : "Persistencia Local JSON"
    };
  },

  async checkConnection() {
    if (!IS_SUPABASE_CONFIGURED) return { connected: false, storageType: "Persistencia Local JSON" };
    await supabaseFetch("orders?select=id&limit=1");
    return { connected: true, storageType: "Supabase (PostgreSQL Remoto)" };
  },

  async signInWithPassword(email, password) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Falta configurar SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY para iniciar sesión.");
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 400 || response.status === 401 ? "Correo o contraseña incorrectos." : (data.msg || data.message || "No se pudo autenticar con Supabase."));
      error.status = response.status === 400 || response.status === 401 ? 401 : response.status;
      throw error;
    }
    return data;
  },

  async getAuthenticatedProfile(accessToken) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Falta configurar Supabase Auth.");
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return null;
    const user = await response.json();
    const profiles = await supabaseFetch(`app_user_profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=auth_user_id,role,customer_id,display_name,is_active`);
    const profile = profiles?.[0];
    return profile?.is_active ? { ...profile, email: user.email } : null;
  },

  async signOut(accessToken) {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/logout`, {
      method: "POST", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error("Supabase no pudo cerrar la sesión.");
  },

  // Consulta de órdenes
  async getOrders() {
    const remote = await supabaseFetch("orders?select=*&order=created_at.desc");
    if (remote) return remote;

    const local = loadLocalDb();
    return local.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  // Consulta de orden por ID o Guía
  async getOrder(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toUpperCase();

    const remote = await supabaseFetch(`orders?or=(id.eq.${clean},tracking_number.eq.${clean})&select=*`);
    if (IS_SUPABASE_CONFIGURED) return remote?.[0] || null;

    const local = loadLocalDb();
    return local.orders.find((o) => o.id.toUpperCase() === clean || o.tracking_number.toUpperCase() === clean) || null;
  },

  // Validación de unicidad de guías (HU-02)
  async validateTrackingUnique(trackingNumber, currentOrderId = null) {
    const clean = (trackingNumber || "").trim().toUpperCase();
    if (!clean) return { valid: false, message: "El número de guía es requerido." };

    const remote = await supabaseFetch(`orders?tracking_number=eq.${clean}&select=id,tracking_number,product_name`);
    if (IS_SUPABASE_CONFIGURED) {
      const duplicate = remote.find((o) => !currentOrderId || o.id.toUpperCase() !== currentOrderId.toUpperCase());
      if (duplicate) {
        return {
          valid: false,
          message: `La guía ${clean} ya se encuentra registrada en el pedido #${duplicate.id} (${duplicate.product_name}). Debe ser única.`,
          duplicate
        };
      }
      return { valid: true, message: `Guía ${clean} disponible y única en Supabase.` };
    }

    const local = loadLocalDb();
    const duplicate = local.orders.find(
      (o) => o.tracking_number?.toUpperCase() === clean && (!currentOrderId || o.id.toUpperCase() !== currentOrderId.toUpperCase())
    );
    if (duplicate) {
      return {
        valid: false,
        message: `La guía ${clean} ya se encuentra registrada en el pedido #${duplicate.id} (${duplicate.product_name}). Debe ser única.`,
        duplicate
      };
    }
    return { valid: true, message: `Guía ${clean} disponible y única.` };
  },

  // Creación de nueva orden
  async createOrder(orderData) {
    if (orderData.tracking_number) {
      const validation = await this.validateTrackingUnique(orderData.tracking_number, orderData.id);
      if (!validation.valid) throw new Error(validation.message);
    }

    const now = new Date().toISOString();
    const slaHours = Number(orderData.sla_hours) || (orderData.carrier === "Mercado Express" ? 24 : orderData.carrier === "Ruta Segura" ? 48 : 72);
    const newRecord = {
      id: orderData.id.trim().toUpperCase(),
      order_number: orderData.order_number || `ORD-${Date.now().toString().slice(-4)}`,
      tracking_number: orderData.tracking_number ? orderData.tracking_number.trim().toUpperCase() : null,
      carrier: orderData.carrier || (orderData.tracking_number ? "Mercado Express" : null),
      customer_id: orderData.customer_id || "buyer-001",
      customer_name: orderData.customer_name || "Cliente Versand",
      customer_phone: orderData.customer_phone || null,
      customer_email: orderData.customer_email || null,
      seller_id: orderData.seller_id || "seller-001",
      destination_city: orderData.destination_city || "Bogotá, Colombia",
      destination_address: orderData.destination_address || "Dirección registrada",
      product_name: orderData.product_name || "Paquete Estándar",
      total_amount: Number(orderData.total_amount) || 150000.00,
      status: orderData.status || "Confirmado",
      sla_hours: slaHours,
      estimated_delivery_at: orderData.estimated_delivery_at || (orderData.tracking_number ? new Date(Date.now() + slaHours * 3600000).toISOString() : null),
      delivered_at: orderData.delivered_at || null,
      last_location: orderData.last_location || "Centro Logístico Versand",
      created_at: now,
      updated_at: now
    };

    if (IS_SUPABASE_CONFIGURED) {
      const remote = await supabaseFetch("orders", { method: "POST", body: newRecord });
      if (!remote?.length) throw new Error("Supabase no confirmó la creación del pedido.");
      // Registrar evento inicial
      await this.addTrackingEvent({
        order_id: newRecord.id,
        tracking_number: newRecord.tracking_number,
        status: newRecord.status,
        location: newRecord.last_location,
        checkpoint_note: "Guía creada y registrada en plataforma",
        source: "manual"
      });
      return remote[0];
    }

    // Persistencia local
    const local = loadLocalDb();
    local.orders.unshift(newRecord);

    // Inicializar evento inicial
    local.tracking_events.push({
      id: `evt-${Date.now()}`,
      order_id: newRecord.id,
      tracking_number: newRecord.tracking_number,
      status: newRecord.status,
      location: newRecord.last_location,
      checkpoint_note: "Guía creada y registrada en plataforma",
      source: "manual",
      signature_verified: true,
      created_at: now
    });

    saveLocalDb(local);
    return newRecord;
  },

  // Evento OrderPaid: crea pedido, línea de tiempo inicial y custodia atómica.
  async registerPaidOrder(orderData) {
    const order = {
      id: String(orderData.id || "").trim().toUpperCase(),
      order_number: String(orderData.order_number || "").trim(),
      customer_id: String(orderData.customer_id || "").trim(),
      customer_name: String(orderData.customer_name || "").trim(),
      customer_phone: orderData.customer_phone || null,
      customer_email: orderData.customer_email || null,
      seller_id: String(orderData.seller_id || "").trim(),
      destination_city: String(orderData.destination_city || "").trim(),
      destination_address: String(orderData.destination_address || "").trim(),
      product_name: String(orderData.product_name || "").trim(),
      total_amount: Number(orderData.total_amount),
      sla_hours: Number(orderData.sla_hours) || 48
    };
    if (Object.values(order).some((value) => value === "") || !Number.isFinite(order.total_amount) || order.total_amount <= 0) {
      throw new Error("OrderPaid requiere identificador, referencia, comprador, vendedor, dirección, producto y monto positivo.");
    }

    if (IS_SUPABASE_CONFIGURED) {
      const saved = await supabaseFetch("rpc/register_paid_order", { method: "POST", body: { p_order: order } });
      if (!saved?.length) throw new Error("Supabase no confirmó el evento OrderPaid.");
      return saved[0];
    }

    let local = loadLocalDb();
    const existing = local.orders.find((item) => item.id === order.id);
    if (existing && (existing.order_number !== order.order_number || existing.customer_id !== order.customer_id ||
      existing.seller_id !== order.seller_id || Number(existing.total_amount) !== order.total_amount)) {
      throw new Error("El identificador de orden ya existe con datos de pago diferentes.");
    }
    const saved = existing || await this.createOrder({ ...order, status: "Confirmado", last_location: "Pago confirmado" });
    local = loadLocalDb();
    if (!local.escrow_vault.some((item) => item.order_id === order.id)) {
      local.escrow_vault.push({
        id: `esc-${Date.now()}`, order_id: order.id, seller_id: order.seller_id,
        retained_amount: order.total_amount, status: "AWAITING_DELIVERY", retention_started_at: null,
        auto_release_at: null, released_at: null, dispute_id: null, dispute_reason: null,
        dispute_registered_at: null, accounting_notified: false
      });
      saveLocalDb(local);
    }
    return saved;
  },

  // Historial inmutable de trazabilidad (HU-01, HU-04)
  async getTrackingEvents(orderId) {
    const cleanId = orderId.trim().toUpperCase();
    const remote = await supabaseFetch(`tracking_events?order_id=eq.${cleanId}&order=created_at.asc`);
    if (IS_SUPABASE_CONFIGURED) return remote;

    const local = loadLocalDb();
    return local.tracking_events
      .filter((e) => e.order_id.toUpperCase() === cleanId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  },

  // Registrar evento inmutable de trazabilidad
  async addTrackingEvent(eventData) {
    const now = new Date().toISOString();
    const record = {
      id: `evt-${Date.now()}`,
      order_id: eventData.order_id,
      tracking_number: eventData.tracking_number,
      status: eventData.status,
      location: eventData.location,
      checkpoint_note: eventData.checkpoint_note || `Actualización de estado a ${eventData.status}`,
      source: eventData.source || "carrier_webhook",
      signature_verified: Boolean(eventData.signature_verified !== false),
      raw_payload: eventData.raw_payload || null,
      idempotency_key: eventData.idempotency_key || null,
      created_at: now
    };

    if (IS_SUPABASE_CONFIGURED) {
      record.idempotency_key = eventData.idempotency_key || crypto.createHash("sha256")
        .update(JSON.stringify({ order_id: record.order_id, status: record.status, location: record.location, created_at: now }))
        .digest("hex");
      const saved = await supabaseFetch("rpc/record_tracking_event", { method: "POST", body: { p_event: record } });
      if (!saved?.length) throw new Error("Supabase no confirmó el evento de seguimiento.");
      return saved[0];
    }

    // Actualizar estado de la orden
    const local = loadLocalDb();
    if (record.idempotency_key) {
      const duplicate = local.tracking_events.find((item) => item.idempotency_key === record.idempotency_key);
      if (duplicate) return duplicate;
    }
    const orderIndex = local.orders.findIndex((o) => o.id.toUpperCase() === eventData.order_id.toUpperCase());
    if (orderIndex >= 0) {
      local.orders[orderIndex].status = eventData.status;
      local.orders[orderIndex].last_location = eventData.location;
      local.orders[orderIndex].updated_at = now;
      if (eventData.status === "Entregado" && !local.orders[orderIndex].delivered_at) {
        local.orders[orderIndex].delivered_at = now;

        // Iniciar reloj de 72h de Escrow
        const escrowIdx = local.escrow_vault.findIndex((e) => e.order_id.toUpperCase() === eventData.order_id.toUpperCase());
        const autoRelease = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
        if (escrowIdx >= 0 && local.escrow_vault[escrowIdx].status === "AWAITING_DELIVERY") {
          local.escrow_vault[escrowIdx].status = "RETAINED";
          local.escrow_vault[escrowIdx].retention_started_at = now;
          local.escrow_vault[escrowIdx].auto_release_at = autoRelease;
        }
      }
    }

    local.tracking_events.push(record);
    saveLocalDb(local);

    return record;
  },

  async assignShipping(orderId, carrier, trackingNumber, slaHours) {
    const tracking = String(trackingNumber || "").trim().toUpperCase();
    const carrierName = String(carrier || "").trim();
    const sla = Number(slaHours);
    if (!tracking || !carrierName || !Number.isInteger(sla) || sla <= 0) {
      throw new Error("La asignación requiere transportadora, guía y SLA en horas.");
    }
    const order = await this.getOrder(orderId);
    if (!order) throw new Error("Pedido no encontrado.");
    const escrow = await this.getEscrowStatus(order.id);
    if (order.status !== "Confirmado" || escrow?.status !== "AWAITING_DELIVERY") {
      throw new Error("Solo se puede asignar envío a un pedido pagado pendiente de despacho.");
    }
    const check = await this.validateTrackingUnique(tracking, order.id);
    if (!check.valid) throw new Error(check.message);

    if (IS_SUPABASE_CONFIGURED) {
      const result = await supabaseFetch("rpc/assign_order_shipping", {
        method: "POST", body: { p_order_id: order.id, p_carrier: carrierName, p_tracking_number: tracking, p_sla_hours: sla }
      });
      if (!result?.length) throw new Error("Supabase no confirmó la asignación de envío.");
      return result[0];
    }

    const local = loadLocalDb();
    const localOrder = local.orders.find((item) => item.id === order.id);
    if (local.orders.some((item) => item.id !== order.id && item.tracking_number?.toUpperCase() === tracking)) {
      throw new Error(`La guía ${tracking} ya está registrada.`);
    }
    localOrder.carrier = carrierName;
    localOrder.tracking_number = tracking;
    localOrder.sla_hours = sla;
    localOrder.estimated_delivery_at = new Date(Date.now() + sla * 3600000).toISOString();
    localOrder.status = "Preparado";
    localOrder.updated_at = new Date().toISOString();
    const event = {
      id: `evt-${Date.now()}`, order_id: order.id, tracking_number: tracking, status: "Preparado",
      location: "Bodega de Despacho", checkpoint_note: `Transportadora asignada; SLA ${sla} horas.`,
      source: "integration", signature_verified: true, created_at: localOrder.updated_at
    };
    local.tracking_events.push(event);
    saveLocalDb(local);
    return localOrder;
  },

  // Gestión de Escrow 72h (HU-03)
  async getEscrowStatus(orderId) {
    const cleanId = orderId.trim().toUpperCase();
    if (IS_SUPABASE_CONFIGURED) {
      const rows = await supabaseFetch(`escrow_vault?order_id=eq.${cleanId}&select=*`);
      const escrow = rows?.[0];
      if (!escrow) return { found: false, orderId: cleanId, message: "No hay registro de Escrow para este pedido." };
      const remainingMs = escrow.auto_release_at ? Math.max(0, new Date(escrow.auto_release_at).getTime() - Date.now()) : null;
      return {
        found: true, orderId: cleanId, sellerId: escrow.seller_id, retainedAmount: escrow.retained_amount,
        status: escrow.status, retentionStartedAt: escrow.retention_started_at, autoReleaseAt: escrow.auto_release_at,
        remainingHours: remainingMs === null ? null : Number((remainingMs / 3600000).toFixed(1)),
        remainingFormatted: remainingMs === null ? "Pendiente de entrega" : remainingMs > 0 ? `${(remainingMs / 3600000).toFixed(1)}h restantes` : "Periodo concluido",
        releasedAt: escrow.released_at,
        dispute: escrow.dispute_id ? { disputeId: escrow.dispute_id, reason: escrow.dispute_reason, registeredAt: escrow.dispute_registered_at } : null,
        accountingNotified: false
      };
    }
    const local = loadLocalDb();
    const escrow = local.escrow_vault.find((e) => e.order_id.toUpperCase() === cleanId);
    const order = local.orders.find((o) => o.id.toUpperCase() === cleanId);

    if (!escrow) {
      return {
        found: false,
        orderId: cleanId,
        message: "No hay registro de Escrow para este pedido."
      };
    }

    const now = Date.now();
    const autoReleaseTime = escrow.auto_release_at ? new Date(escrow.auto_release_at).getTime() : null;
    const remainingMs = autoReleaseTime === null ? null : Math.max(0, autoReleaseTime - now);
    const remainingHours = remainingMs === null ? null : (remainingMs / (1000 * 3600)).toFixed(1);

    return {
      found: true,
      orderId: cleanId,
      sellerId: escrow.seller_id,
      retainedAmount: escrow.retained_amount,
      status: escrow.status, // RETAINED, RELEASED, FROZEN_DISPUTE
      retentionStartedAt: escrow.retention_started_at,
      autoReleaseAt: escrow.auto_release_at,
      remainingHours: remainingHours === null ? null : Number(remainingHours),
      remainingFormatted: remainingHours === null ? "Pendiente de entrega" : remainingHours > 0 ? `${remainingHours}h restantes` : "Periodo concluido",
      releasedAt: escrow.released_at,
      dispute: escrow.dispute_id ? {
        disputeId: escrow.dispute_id,
        reason: escrow.dispute_reason,
        registeredAt: escrow.dispute_registered_at
      } : null,
      accountingNotified: false
    };
  },

  // Congelar fondos por Reclamo / PQR (HU-03)
  async freezeEscrow(orderId, disputeReason) {
    const cleanId = orderId.trim().toUpperCase();
    const disputeId = `PQR-${Date.now().toString().slice(-6)}`;
    if (IS_SUPABASE_CONFIGURED) {
      const rows = await supabaseFetch("rpc/freeze_order_escrow", {
        method: "POST", body: { p_order_id: cleanId, p_reason: disputeReason || "Reclamo reportado por el comprador", p_dispute_id: disputeId }
      });
      if (!rows?.length) throw new Error(`No se pudo congelar la custodia de ${cleanId}.`);
      return { success: true, disputeId, status: rows[0].status, escrow: rows[0] };
    }
    const local = loadLocalDb();
    const escrow = local.escrow_vault.find((e) => e.order_id.toUpperCase() === cleanId);

    if (!escrow) throw new Error(`Registro Escrow no encontrado para ${cleanId}`);
    if (["RELEASED", "FROZEN_DISPUTE"].includes(escrow.status)) throw new Error("La custodia ya está liberada o congelada.");

    const now = new Date().toISOString();

    escrow.status = "FROZEN_DISPUTE";
    escrow.dispute_id = disputeId;
    escrow.dispute_reason = disputeReason || "Novedad en producto o entrega reportada por el comprador";
    escrow.dispute_registered_at = now;
    escrow.accounting_notified = false;
    local.accounting_outbox ||= [];
    local.accounting_outbox.push({
      id: `acct-${Date.now()}`, order_id: cleanId, event_type: "FundsFrozen", idempotency_key: `freeze:${cleanId}:${disputeId}`,
      payload: { order_id: cleanId, amount: escrow.retained_amount, dispute_id: disputeId }, delivery_status: "PENDING", created_at: now
    });

    // Actualizar orden
    const order = local.orders.find((o) => o.id.toUpperCase() === cleanId);
    if (order) {
      order.status = "Incidencia";
      order.updated_at = now;
    }

    // Registrar evento de auditoría
    local.tracking_events.push({
      id: `evt-${Date.now()}`,
      order_id: cleanId,
      tracking_number: order ? order.tracking_number : cleanId,
      status: "Incidencia",
      location: "Portal de Soporte y Reclamaciones",
      checkpoint_note: `Fondos congelados preventivamente por PQR #${disputeId}: "${escrow.dispute_reason}". Evento pendiente para Contabilidad.`,
      source: "system_event",
      signature_verified: true,
      created_at: now
    });

    saveLocalDb(local);
    return { success: true, disputeId, status: "FROZEN_DISPUTE", escrow };
  },

  // Liberar fondos Escrow de forma anticipada o por resolución (HU-03)
  async releaseEscrow(orderId, resolvedBy = "Comprador") {
    const cleanId = orderId.trim().toUpperCase();
    if (IS_SUPABASE_CONFIGURED) {
      const rows = await supabaseFetch("rpc/release_order_escrow", {
        method: "POST", body: { p_order_id: cleanId, p_resolved_by: resolvedBy }
      });
      if (!rows?.length) throw new Error(`No se pudo liberar la custodia de ${cleanId}.`);
      return { success: true, status: rows[0].status, releasedAt: rows[0].released_at, escrow: rows[0] };
    }
    const local = loadLocalDb();
    const escrow = local.escrow_vault.find((e) => e.order_id.toUpperCase() === cleanId);

    if (!escrow) throw new Error(`Registro Escrow no encontrado para ${cleanId}`);
    if (escrow.status !== "RETAINED" || !escrow.auto_release_at || new Date(escrow.auto_release_at).getTime() > Date.now()) {
      throw new Error("La custodia aún no vence, no existe o está congelada.");
    }

    const now = new Date().toISOString();
    escrow.status = "RELEASED";
    escrow.released_at = now;
    escrow.accounting_notified = false;
    local.accounting_outbox ||= [];
    local.accounting_outbox.push({
      id: `acct-${Date.now()}`, order_id: cleanId, event_type: "FundsReleased", idempotency_key: `release:${cleanId}`,
      payload: { order_id: cleanId, amount: escrow.retained_amount, seller_id: escrow.seller_id, resolved_by: resolvedBy },
      delivery_status: "PENDING", created_at: now
    });

    // Registrar evento de trazabilidad
    const order = local.orders.find((o) => o.id.toUpperCase() === cleanId);
    local.tracking_events.push({
      id: `evt-${Date.now()}`,
      order_id: cleanId,
      tracking_number: order ? order.tracking_number : cleanId,
      status: "Entregado",
      location: "Módulo Financiero / Contabilidad",
      checkpoint_note: `Fondos de $${escrow.retained_amount.toLocaleString("es-CO")} liberados al vendedor (Aprobado por ${resolvedBy}). Evento pendiente para Contabilidad.`,
      source: "system_event",
      signature_verified: true,
      created_at: now
    });

    saveLocalDb(local);
    return { success: true, status: "RELEASED", releasedAt: now, escrow };
  },

  // Evidencias de entrega con GPS inalterable (HU-06)
  async getDeliveryEvidence(orderId) {
    const cleanId = orderId.trim().toUpperCase();
    if (IS_SUPABASE_CONFIGURED) {
      const rows = await supabaseFetch(`delivery_evidence?order_id=eq.${cleanId}&select=*&order=created_at.desc`);
      if (!rows?.[0]) return null;
      return { ...rows[0], image_url: await createEvidenceSignedUrl(rows[0].image_url) };
    }
    const local = loadLocalDb();
    return local.delivery_evidence.find((e) => e.order_id.toUpperCase() === cleanId) || null;
  },

  async saveDeliveryEvidence(evidenceData) {
    const now = new Date().toISOString();
    const storagePath = IS_SUPABASE_CONFIGURED
      ? `${evidenceData.order_id.trim().toUpperCase()}/${crypto.randomUUID()}.${evidenceData.image_content_type === "image/png" ? "png" : "jpg"}`
      : null;
    if (IS_SUPABASE_CONFIGURED) await uploadEvidenceObject(storagePath, evidenceData.image_bytes, evidenceData.image_content_type);
    const record = {
      ...(IS_SUPABASE_CONFIGURED ? {} : { id: `evi-${Date.now()}` }),
      order_id: evidenceData.order_id.trim().toUpperCase(),
      tracking_number: evidenceData.tracking_number.trim().toUpperCase(),
      image_url: storagePath || evidenceData.image_data || evidenceData.image_url || null,
      latitude: Number(evidenceData.latitude),
      longitude: Number(evidenceData.longitude),
      gps_accuracy_meters: Number(evidenceData.gps_accuracy_meters || 4.5),
      timestamp_stamped: evidenceData.timestamp_stamped || now,
      hash_integrity: evidenceData.hash_integrity || "hash-" + Date.now(),
      created_at: now
    };

    if (IS_SUPABASE_CONFIGURED) {
      const rows = await supabaseFetch("delivery_evidence", { method: "POST", body: record });
      if (!rows?.length) throw new Error("Supabase no confirmó el almacenamiento de la evidencia.");
      return rows[0];
    }

    const local = loadLocalDb();
    const existingIdx = local.delivery_evidence.findIndex((e) => e.order_id.toUpperCase() === record.order_id);
    if (existingIdx >= 0) {
      local.delivery_evidence[existingIdx] = record;
    } else {
      local.delivery_evidence.push(record);
    }
    saveLocalDb(local);

    return record;
  },

  // Registro de logs de notificación (Push < 5s)
  async logNotification(notificationData) {
    const record = {
      ...(IS_SUPABASE_CONFIGURED ? {} : { id: `notif-${Date.now()}` }),
      order_id: notificationData.order_id,
      event_type: notificationData.event_type || "EstadoCambiado",
      recipient_id: notificationData.recipient_id || "buyer-001",
      channel: notificationData.channel || "Push",
      delivery_latency_ms: null,
      delivery_status: "PENDING",
      delivery_error: null,
      attempted_at: null,
      source_event_key: notificationData.idempotency_key || null,
      payload: notificationData.payload || {},
      created_at: new Date().toISOString()
    };

    if (IS_SUPABASE_CONFIGURED) {
      const rows = await supabaseFetch("rpc/enqueue_notification", { method: "POST", body: { p_notification: record } });
      if (!rows?.length) throw new Error("Supabase no confirmó la notificación pendiente.");
      return rows[0];
    }

    const local = loadLocalDb();
    if (record.source_event_key) {
      const existing = local.notification_logs.find((item) => item.source_event_key === record.source_event_key);
      if (existing) return existing;
    }
    local.notification_logs.push(record);
    saveLocalDb(local);
    return record;
  },

  async releaseExpiredEscrows() {
    if (IS_SUPABASE_CONFIGURED) {
      const count = await supabaseFetch("rpc/release_expired_escrows", { method: "POST", body: {} });
      return Number(count) || 0;
    }
    const local = loadLocalDb();
    const now = Date.now();
    local.accounting_outbox ||= [];
    let released = 0;
    for (const escrow of local.escrow_vault) {
      if (escrow.status !== "RETAINED" || !escrow.auto_release_at || new Date(escrow.auto_release_at).getTime() > now) continue;
      escrow.status = "RELEASED";
      escrow.released_at = new Date(now).toISOString();
      escrow.accounting_notified = false;
      local.accounting_outbox.push({
        id: `acct-${Date.now()}-${released}`, order_id: escrow.order_id, event_type: "FundsReleased",
        idempotency_key: `release:${escrow.order_id}`,
        payload: { order_id: escrow.order_id, amount: escrow.retained_amount, seller_id: escrow.seller_id, resolved_by: "auto" },
        delivery_status: "PENDING", created_at: new Date(now).toISOString()
      });
      released += 1;
    }
    if (released) saveLocalDb(local);
    return released;
  }
};

module.exports = db;

