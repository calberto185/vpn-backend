/**
 * suiService.js — S-UI Manager multi-servidor
 *
 * Gestiona múltiples instancias de S-UI (sing-box panel) en paralelo.
 * Cada servidor tiene su propia sesión (cookies) y token de API.
 *
 * Uso:
 *   const sui = require('./suiService');
 *   const result = await sui.agregarCliente(server, { email, gb, dias });
 */

const https  = require("https");
const { URL } = require("url");
const { encryptPassword, decryptPassword } = require("../utils/encrypt_decrypt");

// Ignora SSL autofirmado (igual que verify=False en Python)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Pool de sesiones por server_id: { cookies, tokenHeaders, expiresAt }
const _sessions = new Map();

// ─── Helpers internos ─────────────────────────────────────────────────────────

function _baseUrl(server) {
  const raw = (server.sui_url || "").trim().replace(/\/+$/, "");
  const u   = new URL(raw);
  return `${u.protocol}//${u.host}`;
}

function _cookieHeader(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

const SUI_FETCH_TIMEOUT_MS = 15_000; // 15 segundos máximo por llamada S-UI

async function _fetch(url, options = {}) {
  const mod = url.startsWith("https") ? require("https") : require("http");
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { ...options, agent: httpsAgent }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        clearTimeout(timer);
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on("error", (err) => { clearTimeout(timer); reject(err); });

    // Timeout: abortar si S-UI no responde en tiempo
    const timer = setTimeout(() => {
      req.destroy(new Error(`S-UI timeout (${SUI_FETCH_TIMEOUT_MS}ms) → ${url}`));
    }, SUI_FETCH_TIMEOUT_MS);

    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── Auth por servidor ────────────────────────────────────────────────────────

async function _login(server) {
  const base = _baseUrl(server);
  const pass = (() => {
    try { return decryptPassword(server.sui_password); }
    catch { return server.sui_password; } // si no está encriptado
  })();

  const body = `user=${encodeURIComponent(server.sui_username)}&pass=${encodeURIComponent(pass)}`;
  const res  = await _fetch(`${base}/app/api/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.body?.success) {
    throw new Error(`S-UI login fallido en ${server.name}: ${JSON.stringify(res.body)}`);
  }

  // Parsear Set-Cookie
  const setCookie = Array.isArray(res.headers["set-cookie"])
    ? res.headers["set-cookie"]
    : [res.headers["set-cookie"] || ""];

  const cookies = {};
  setCookie.forEach((c) => {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (k) cookies[k.trim()] = (v || "").trim();
  });

  const session = {
    cookies,
    token:     server.sui_token || "",
    expiresAt: Date.now() + 23 * 60 * 60 * 1000, // 23h
  };
  _sessions.set(server.id, session);
  console.log(`✅ [S-UI] Login OK → ${server.name} (${server.host})`);
  return session;
}

async function _getSession(server) {
  const s = _sessions.get(server.id);
  if (s && Date.now() < s.expiresAt) return s;
  return _login(server);
}

// ─── GET (usa token header) ───────────────────────────────────────────────────

async function _get(server, path) {
  const session = await _getSession(server);
  const base    = _baseUrl(server);
  const res     = await _fetch(`${base}${path}`, {
    method:  "GET",
    headers: { Token: session.token },
  });
  return res.body;
}

// ─── POST (usa session cookie) ────────────────────────────────────────────────

async function _save(server, objectType, action, data) {
  let session = await _getSession(server);
  const base  = _baseUrl(server);
  const dataJson = JSON.stringify(data);

  for (let intento = 0; intento < 2; intento++) {
    const bodyStr = new URLSearchParams({
      object: objectType,
      action,
      data:   dataJson,
    }).toString();

    const res = await _fetch(`${base}/app/api/save`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie:         _cookieHeader(session.cookies),
      },
      body: bodyStr,
    });

    const result = res.body;

    // Sesión expirada → re-login y reintentar
    if (!result?.success && intento === 0 && (
      res.status === 401 || res.status === 403 ||
      String(result?.msg || "").toLowerCase().includes("login")
    )) {
      session = await _login(server);
      continue;
    }
    return result;
  }
  return { success: false, error: "Reintentos agotados" };
}

// ─── Obtener todos los inbounds del servidor ──────────────────────────────────

async function _todosInbounds(server) {
  try {
    const data = await _get(server, "/app/apiv2/inbounds");
    if (data?.success) {
      const ids = (data.obj?.inbounds || []).map((i) => i.id).filter(Boolean);
      if (ids.length) return ids;
    }
  } catch {}
  return [server.sui_inbound_id || 1];
}

// ─── Obtener ID numérico de un cliente ───────────────────────────────────────

async function _idCliente(server, email) {
  for (let i = 0; i < 3; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));
    try {
      const data = await _get(server, "/app/apiv2/clients");
      console.log("async function _idCliente(server, email) data: ", data)
      if (data?.success) {
        const c = (data.obj?.clients || []).find((x) => x.name === email);
        if (c) return String(c.id);
      }
    } catch {}
  }
  return "";
}

// ─── Construir payload completo para action=edit ──────────────────────────────

async function _construirDataEdit(server, clientId, configGuardado = null) {
  const data = await _get(server, "/app/apiv2/clients");
  console.log("async function _construirDataEdit(server, clientId, configGuardado = null):", data)
  const clientes = data?.obj?.clients || [];
  const c = clientes.find(
    (x) => String(x.id) === String(clientId) || x.name === clientId
  );
  if (!c) return null;

  if (configGuardado?.config) {
    return {
      ...configGuardado,
      id:     Number(c.id),
      enable: c.enable,
      up:     c.up || 0,
      down:   c.down || 0,
      volume: c.volume || 0,
      expiry: c.expiry || 0,
    };
  }

  return {
    id:         Number(c.id),
    enable:     c.enable,
    name:       c.name,
    config:     c.config || {},
    inbounds:   c.inbounds || [server.sui_inbound_id || 1],
    links:      c.links || [],
    volume:     c.volume || 0,
    expiry:     c.expiry || 0,
    up:         c.up || 0,
    down:       c.down || 0,
    desc:       c.desc || "",
    group:      c.group || "Clients",
    delayStart: false,
    autoReset:  false,
    resetDays:  0,
    nextReset:  0,
    totalUp:    c.totalUp || 0,
    totalDown:  c.totalDown || 0,
  };
}

// ─── Generador de credenciales ────────────────────────────────────────────────

function _generarConfig(name) {
  const crypto  = require("crypto");
  const { v4: uuidv4 } = require("uuid");
  const uid      = uuidv4();
  const password = crypto.randomBytes(10).toString("base64url");
  const ss32     = crypto.randomBytes(32).toString("base64");
  const ss16     = crypto.randomBytes(16).toString("base64");

  return {
    cfg: {
      mixed:         { username: name, password },
      socks:         { username: name, password },
      http:          { username: name, password },
      shadowsocks:   { name, password: ss32 },
      shadowsocks16: { name, password: ss16 },
      shadowtls:     { name, password: ss32 },
      vmess:         { name, uuid: uid, alterId: 0 },
      vless:         { name, uuid: uid, flow: "xtls-rprx-vision" },
      anytls:        { name, password },
      trojan:        { name, password },
      naive:         { username: name, password },
      hysteria:      { name, auth_str: password },
      tuic:          { name, uuid: uid, password },
      hysteria2:     { name, password },
    },
    uid,
    password,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * agregarCliente — Crea un cliente en S-UI
 * @param {object} server   — documento vpnServerEntity de la DB
 * @param {object} opts     — { email, gbLimite, dias, desc }
 * @returns {{ success, sui_uuid, sui_email, sub_id, sui_config, sub_url }}
 */
async function agregarCliente(server, { email, gbLimite = 50, dias = 30, desc = "" }) {
  const { cfg } = _generarConfig(email);
  const ahora   = Math.floor(Date.now() / 1000);
  const expiry  = ahora + dias * 86400;
  const volume  = gbLimite * 1024 * 1024 * 1024;
  const inbounds = await _todosInbounds(server);

  const data = {
    enable:     true,
    name:       email,
    config:     cfg,
    inbounds,
    links:      [],
    volume,
    expiry:     expiry * 1000, // S-UI espera ms
    up:         0,
    down:       0,
    desc:       desc || `Bot VPN - ${new Date().toISOString().split("T")[0]}`,
    group:      "Clients",
    subId:      email,
    tgId:       "",
    limitIp:    0,
    delayStart: false,
    autoReset:  false,
    resetDays:  0,
    nextReset:  0,
    totalUp:    0,
    totalDown:  0,
  };

  const result = await _save(server, "clients", "new", data);
  if (!result?.success) {
    return { success: false, error: result?.msg || "Error creando cliente en S-UI" };
  }

  const sui_uuid = await _idCliente(server, email);
  const sub_url  = `${(server.sui_sub_url || "").replace(/\/+$/, "")}/${email}`;

  console.log(`✅ [S-UI] Cliente creado → ${email} en ${server.name}`);
  return {
    success:    true,
    sui_uuid,
    sui_email:  email,
    sub_id:     email,
    sui_config: data,
    sub_url,
  };
}

/**
 * suspenderCliente — Deshabilita un cliente en S-UI
 */
async function suspenderCliente(server, { sui_uuid, sui_config = null }) {
  const data = await _construirDataEdit(server, sui_uuid, sui_config);
  if (!data) {
    console.warn(`[S-UI] suspender: cliente ${sui_uuid} no encontrado en ${server.name}`);
    return true; // ya no existe, considerar éxito
  }
  data.enable = false;
  const result = await _save(server, "clients", "edit", data);
  if (result?.success) console.log(`⏸ [S-UI] Suspendido → ${sui_uuid} en ${server.name}`);
  return !!result?.success;
}

/**
 * reactivarCliente — Habilita un cliente en S-UI
 */
async function reactivarCliente(server, { sui_uuid, sui_config = null }) {
  const data = await _construirDataEdit(server, sui_uuid, sui_config);
  if (!data) {
    console.warn(`[S-UI] reactivar: cliente ${sui_uuid} no encontrado en ${server.name}`);
    return true;
  }
  data.enable = true;
  const result = await _save(server, "clients", "edit", data);
  if (result?.success) console.log(`▶️ [S-UI] Reactivado → ${sui_uuid} en ${server.name}`);
  return !!result?.success;
}

/**
 * eliminarCliente — Elimina un cliente de S-UI
 */
async function eliminarCliente(server, { sui_uuid, sui_config = null }) {
  const data = await _construirDataEdit(server, sui_uuid, sui_config);
  if (!data) return true; // ya no existe
  const result = await _save(server, "clients", "del", data);
  if (result?.success) console.log(`🗑 [S-UI] Eliminado → ${sui_uuid} en ${server.name}`);
  return !!result?.success;
}

/**
 * renovarCliente — Actualiza GB y fecha de expiración
 */
async function renovarCliente(server, { sui_uuid, sui_config = null, gbLimite, dias }) {
  const data = await _construirDataEdit(server, sui_uuid, sui_config);
  if (!data) return { success: false, error: "Cliente no encontrado en S-UI" };

  const expiry = Math.floor(Date.now() / 1000 + dias * 86400) * 1000;
  data.enable = true;
  data.volume = gbLimite * 1024 * 1024 * 1024;
  data.expiry = expiry;
  data.up     = 0;
  data.down   = 0;

  const result = await _save(server, "clients", "edit", data);
  if (result?.success) console.log(`🔄 [S-UI] Renovado → ${sui_uuid} en ${server.name}`);
  return { success: !!result?.success, error: result?.msg };
}

/**
 * obtenerStatsCliente — Tráfico consumido
 */
async function obtenerStatsCliente(server, { sui_email }) {
  const data     = await _get(server, "/app/apiv2/clients");
  console.log("async function obtenerStatsCliente(server, { sui_email })", data)
  const clientes = data?.obj?.clients || [];
  const c        = clientes.find((x) => x.name === sui_email);
  if (!c) return { success: false, error: "Cliente no encontrado" };

  return {
    success:    true,
    gb_usado:   Math.round(((c.up || 0) + (c.down || 0)) / (1024 ** 3) * 100) / 100,
    gb_total:   Math.round((c.volume || 0) / (1024 ** 3) * 100) / 100,
    habilitado: !!c.enable,
    expiry:     c.expiry ? new Date(c.expiry) : null,
  };
}

/**
 * listarClientes — Todos los clientes de un servidor S-UI
 */
async function listarClientes(server) {
  console.log("server: ", server)
  const data = await _get(server, "/app/apiv2/clients");
  console.log("async function listarClientes(server) data: ", data)
  return data?.obj?.clients || [];
}

/**
 * sincronizarConDB — Detecta clientes en S-UI que no están en DeviceEntity
 * Retorna array de clientes sin registro en la DB
 */
async function sincronizarConDB(server, deviceEmails = []) {
  const clientes = await listarClientes(server);
  const emailSet = new Set(deviceEmails);
  return clientes.filter((c) => c.name && !emailSet.has(c.name));
}

module.exports = {
  agregarCliente,
  suspenderCliente,
  reactivarCliente,
  eliminarCliente,
  renovarCliente,
  obtenerStatsCliente,
  listarClientes,
  sincronizarConDB,
};
