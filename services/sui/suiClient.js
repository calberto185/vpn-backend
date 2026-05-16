/**
 * suiClient.js — Cliente HTTP para S-UI (sing-box panel)
 *
 * Soporta múltiples servidores S-UI independientes.
 * Cada instancia mantiene su propia sesión (cookie) y estado.
 *
 * Uso:
 *   const client = new SUIClient({ baseUrl, username, password, token, inboundId });
 *   await client.login();
 *   await client.agregarCliente({ email, gbLimite, dias, ... });
 */

const https = require('https');
const { URLSearchParams } = require('url');
const crypto = require('crypto');
const uuid = require('uuid');

// Ignorar SSL autofirmado (igual que verify=False en Python)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generarConfig(name) {
  const uid = uuid.v4();
  const password = crypto.randomBytes(10).toString('base64url');
  const ss32 = crypto.randomBytes(32).toString('base64');
  const ss16 = crypto.randomBytes(16).toString('base64');
  return {
    cfg: {
      mixed:         { username: name, password },
      socks:         { username: name, password },
      http:          { username: name, password },
      shadowsocks:   { name, password: ss32 },
      shadowsocks16: { name, password: ss16 },
      shadowtls:     { name, password: ss32 },
      vmess:         { name, uuid: uid, alterId: 0 },
      vless:         { name, uuid: uid, flow: 'xtls-rprx-vision' },
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

// ─── Clase SUIClient ──────────────────────────────────────────────────────────

class SUIClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl   - ej: https://carlosvm.ru:41111
   * @param {string} opts.username
   * @param {string} opts.password
   * @param {string} opts.token     - Token header para lecturas (apiv2)
   * @param {number} opts.inboundId - ID de inbound por defecto
   * @param {string} opts.serverId  - ID del servidor en la BD (para logs)
   * @param {string} opts.subUrl    - ej: https://carlosvm.ru:2096/sub
   */
  constructor({ baseUrl, username, password, token = '', inboundId = 1, serverId = '', subUrl = '' }) {
    this.baseUrl   = baseUrl.replace(/\/$/, '');
    this.username  = username;
    this.password  = password;
    this.token     = token;
    this.inboundId = inboundId;
    this.serverId  = serverId;
    this.subUrl    = subUrl;
    this.cookies   = {};
    this._logPrefix = `[S-UI:${serverId || baseUrl}]`;
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  async login() {
    try {
      const body = `user=${encodeURIComponent(this.username)}&pass=${encodeURIComponent(this.password)}`;
      const res = await fetch(`${this.baseUrl}/app/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        agent: httpsAgent,
      });
      const data = await res.json();
      if (data?.success) {
        // Parsear Set-Cookie
        const setCookie = res.headers.getSetCookie?.() || [];
        this.cookies = {};
        for (const c of setCookie) {
          const [kv] = c.split(';');
          const eqIdx = kv.indexOf('=');
          if (eqIdx > 0) {
            const k = kv.slice(0, eqIdx).trim();
            const v = kv.slice(eqIdx + 1).trim();
            this.cookies[k] = v;
          }
        }
        console.log(`${this._logPrefix} Login ✅`);
        return true;
      }
      console.error(`${this._logPrefix} Login ❌:`, data);
      return false;
    } catch (e) {
      console.error(`${this._logPrefix} Login error:`, e.message);
      return false;
    }
  }

  _cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _isAuthenticated() {
    return Object.keys(this.cookies).length > 0;
  }

  // ─── GET (lectura con token + cookie) ────────────────────────────────────

  async _get(path) {
    // Asegurar sesión activa antes de llamar a apiv2
    if (!this._isAuthenticated()) {
      if (!await this.login()) return {};
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const headers = { Cookie: this._cookieHeader() };
        if (this.token) headers['Token'] = this.token;

        const res = await fetch(`${this.baseUrl}${path}`, {
          headers,
          agent: httpsAgent,
        });

        // Si el servidor devuelve HTML (sesión expirada / redirige al login)
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          if (attempt === 0) {
            console.warn(`${this._logPrefix} GET ${path}: respuesta no-JSON (status ${res.status}), reintentando con login`);
            this.cookies = {};
            if (!await this.login()) return {};
            continue;
          }
          console.error(`${this._logPrefix} GET ${path}: S-UI devolvió HTML en lugar de JSON`);
          return {};
        }

        return await res.json();
      } catch (e) {
        console.error(`${this._logPrefix} GET ${path}:`, e.message);
        if (attempt === 0) { this.cookies = {}; await this.login(); continue; }
        return {};
      }
    }
    return {};
  }

  // ─── SAVE (escritura con cookie) ─────────────────────────────────────────

  async _save(objectType, action, data) {
    if (!this._isAuthenticated()) {
      if (!await this.login()) return { success: false, error: 'Login fallido' };
    }
    const dataJson = JSON.stringify(data);
    for (let intento = 0; intento < 2; intento++) {
      try {
        const params = new URLSearchParams({ object: objectType, action, data: dataJson });
        const res = await fetch(`${this.baseUrl}/app/api/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: this._cookieHeader(),
          },
          body: params.toString(),
          agent: httpsAgent,
        });
        const result = await res.json();
        const msg = `success=${result.success} msg=${String(result.msg || '').slice(0, 80)}`;
        console.log(`${this._logPrefix} save ${objectType}/${action} → ${msg}`);

        if (!result.success && intento === 0 &&
          (res.status === 401 || res.status === 403 || String(result.msg || '').toLowerCase().includes('login'))) {
          await this.login();
          continue;
        }
        return result;
      } catch (e) {
        console.error(`${this._logPrefix} save error (intento ${intento + 1}):`, e.message);
        if (intento === 0) { await this.login(); continue; }
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: 'Reintentos agotados' };
  }

  // ─── Helpers internos ────────────────────────────────────────────────────

  async _todosInbounds() {
    try {
      const data = await this._get('/app/apiv2/inbounds');
      if (data?.success) {
        const ids = (data.obj?.inbounds || []).filter(i => typeof i === 'object').map(i => i.id);
        if (ids.length) return ids;
      }
    } catch {}
    return [this.inboundId];
  }

  async _idCliente(email) {
    for (let i = 0; i < 3; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000));
      try {
        const data = await this._get('/app/apiv2/clients');
        if (data?.success) {
          const c = (data.obj?.clients || []).find(x => x.name === email);
          if (c) return String(c.id);
        }
      } catch {}
    }
    return '';
  }

  async _getClienteApiv2(clientId) {
    try {
      const data = await this._get('/app/apiv2/clients');
      if (data?.success) {
        const clientes = data.obj?.clients || [];
        return clientes.find(x => String(x.id) === String(clientId))
          || clientes.find(x => x.name === clientId)
          || null;
      }
    } catch {}
    return null;
  }

  async _construirDataEdit(clientId, xuiConfigGuardado = null) {
    const clienteApi = await this._getClienteApiv2(clientId);
    if (!clienteApi) return null;

    if (xuiConfigGuardado?.config) {
      return {
        ...xuiConfigGuardado,
        id:     Number(clientId) || clienteApi.id,
        enable: clienteApi.enable ?? true,
        up:     clienteApi.up ?? 0,
        down:   clienteApi.down ?? 0,
        volume: clienteApi.volume ?? 0,
        expiry: clienteApi.expiry ?? 0,
      };
    }
    const name = clienteApi.name || '';
    const { cfg } = name ? generarConfig(name) : generarConfig(`cliente_${clientId}`);
    return {
      id:         Number(clientId) || clienteApi.id,
      enable:     clienteApi.enable ?? true,
      name,
      config:     cfg,
      inbounds:   clienteApi.inbounds || [this.inboundId],
      links:      clienteApi.links || [],
      volume:     clienteApi.volume ?? 0,
      expiry:     clienteApi.expiry ?? 0,
      up:         clienteApi.up ?? 0,
      down:       clienteApi.down ?? 0,
      desc:       clienteApi.desc || 'Bot VPN',
      group:      clienteApi.group || 'Clients',
      delayStart: false,
      autoReset:  false,
      resetDays:  0,
      nextReset:  0,
      totalUp:    clienteApi.totalUp ?? 0,
      totalDown:  clienteApi.totalDown ?? 0,
    };
  }

  // ─── API pública ─────────────────────────────────────────────────────────

  /**
   * Obtiene todos los clientes del servidor S-UI
   */
  async listarClientes() {
    const data = await this._get('/app/apiv2/clients');
    if (!data?.success) return [];
    return data.obj?.clients || [];
  }

  /**
   * Obtiene stats de un cliente por email/name
   */
  async obtenerStats(email) {
    try {
      const clientes = await this.listarClientes();
      const c = clientes.find(x => x.name === email);
      if (!c) return { success: false };
      const up    = (c.up || 0) + (c.total_up || 0);
      const down  = (c.down || 0) + (c.total_down || 0);
      const vol   = c.volume || 0;
      return {
        success:    true,
        gbUsado:    +((up + down) / (1024 ** 3)).toFixed(2),
        gbTotal:    +(vol / (1024 ** 3)).toFixed(2),
        habilitado: Boolean(c.enable),
        expiry:     c.expiry,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Crea un cliente en S-UI
   * @returns { success, uuid, email, subId, xuiConfig }
   */
  async agregarCliente({ email, gbLimite, dias, dispositivos = 1, desc = 'Bot VPN Central' }) {
    if (!this._isAuthenticated() && !await this.login()) {
      return { success: false, error: 'No se pudo autenticar' };
    }
    const { cfg, uid } = generarConfig(email);
    const expiry   = Math.floor(Date.now() / 1000) + dias * 86400;
    const volume   = gbLimite * 1024 ** 3;
    const inbounds = await this._todosInbounds();

    const data = {
      enable: true, name: email, config: cfg, inbounds, links: [],
      volume, expiry, up: 0, down: 0, desc,
      group: 'Clients', subId: email, tgId: '', limitIp: 0,
      delayStart: false, autoReset: false, resetDays: 0, nextReset: 0,
      totalUp: 0, totalDown: 0,
    };

    const result = await this._save('clients', 'new', data);
    if (!result?.success) return { success: false, error: result?.msg || 'Error desconocido' };

    const newId = await this._idCliente(email);
    console.log(`${this._logPrefix} Cliente creado ✅ email=${email} id=${newId}`);
    return { success: true, uuid: newId || uid, email, subId: email, xuiConfig: data };
  }

  /**
   * Actualiza volumen y expiración (renovación de plan)
   */
  async renovarCliente({ clientId, gbLimite, dias, xuiConfig = null }) {
    if (!this._isAuthenticated()) await this.login();
    const data = await this._construirDataEdit(clientId, xuiConfig);
    if (!data) return { success: false, error: `Cliente ${clientId} no encontrado en S-UI` };
    data.enable = true;
    data.volume = gbLimite * 1024 ** 3;
    data.expiry = Math.floor(Date.now() / 1000) + dias * 86400;
    const result = await this._save('clients', 'edit', data);
    return { success: result?.success || false };
  }

  /**
   * Suspende (deshabilita) un cliente
   */
  async suspenderCliente({ clientId, xuiConfig = null }) {
    if (!this._isAuthenticated()) await this.login();
    const data = await this._construirDataEdit(clientId, xuiConfig);
    if (!data) { console.warn(`${this._logPrefix} suspender: cliente ${clientId} no encontrado`); return { success: true }; }
    data.enable = false;
    const result = await this._save('clients', 'edit', data);
    return { success: result?.success || false };
  }

  /**
   * Reactiva un cliente
   */
  async reactivarCliente({ clientId, xuiConfig = null }) {
    if (!this._isAuthenticated()) await this.login();
    const data = await this._construirDataEdit(clientId, xuiConfig);
    if (!data) { console.warn(`${this._logPrefix} reactivar: cliente ${clientId} no encontrado`); return { success: true }; }
    data.enable = true;
    const result = await this._save('clients', 'edit', data);
    return { success: result?.success || false };
  }

  /**
   * Elimina un cliente
   */
  async eliminarCliente({ clientId, xuiConfig = null }) {
    if (!this._isAuthenticated()) await this.login();
    const data = await this._construirDataEdit(clientId, xuiConfig);
    if (!data) { console.warn(`${this._logPrefix} eliminar: cliente ${clientId} no encontrado`); return { success: true }; }
    const result = await this._save('clients', 'del', data);
    return { success: result?.success || false };
  }

  /**
   * Genera URL de suscripción para este servidor
   */
  urlSuscripcion(subId) {
    return `${this.subUrl.replace(/\/$/, '')}/${subId}`;
  }
}

module.exports = { SUIClient, generarConfig };
