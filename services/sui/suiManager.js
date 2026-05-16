/**
 * suiManager.js — Gestor multi-servidor S-UI
 *
 * Mantiene un pool de instancias SUIClient, una por servidor S-UI.
 * Lee los servidores desde MongoDB (colección "servers" con tipo "sui").
 * Permite ejecutar operaciones en todos los servidores o en uno específico.
 *
 * Uso:
 *   const mgr = getSuiManager();
 *   await mgr.refresh();                                    // cargar servidores
 *   const res = await mgr.agregarCliente(serverId, {...}); // en servidor específico
 *   const all = await mgr.enTodos('listarClientes');        // en todos
 */

const { SUIClient } = require('./suiClient');

class SUIManager {
  constructor() {
    /** @type {Map<string, SUIClient>} serverId -> SUIClient */
    this._clients = new Map();
    this._db = null;
    this._nameCollections = null;
  }

  // ─── Inicialización ───────────────────────────────────────────────────────

  init(db, nameCollections) {
    this._db = db;
    this._nameCollections = nameCollections;
  }

  /**
   * Carga/recarga los servidores S-UI desde MongoDB
   * y crea/actualiza los clientes del pool.
   */
  async refresh() {
    if (!this._db) throw new Error('SUIManager no inicializado. Llamar init() primero.');
    try {
      const servidores = await this._db
        .collection(this._nameCollections.servers)
        .find({ active: true, $or: [{ tipo: 'sui' }, { protocol: 's-ui' }, { protocol: 'both' }] })
        .toArray();

      const actuales = new Set();
      for (const srv of servidores) {
        const id = srv.id || srv._id?.toString();
        actuales.add(id);

        if (!this._clients.has(id)) {
          const client = new SUIClient({
            baseUrl:   srv.suiUrl || `https://${srv.host}:41111`,
            username:  srv.suiUsername || srv.userName,
            password:  srv.suiPassword || srv.password,
            token:     srv.suiToken   || '',
            inboundId: srv.suiInboundId || 1,
            subUrl:    srv.suiSubUrl  || `https://${srv.host}:2096/sub`,
            serverId:  id,
          });
          this._clients.set(id, client);
          console.log(`[SUI Manager] Servidor registrado: ${id} (${srv.name || srv.host})`);
        }
      }

      // Eliminar servidores que ya no están activos
      for (const id of this._clients.keys()) {
        if (!actuales.has(id)) {
          this._clients.delete(id);
          console.log(`[SUI Manager] Servidor removido: ${id}`);
        }
      }

      console.log(`[SUI Manager] Pool actualizado: ${this._clients.size} servidor(es) S-UI`);
      return { ok: true, count: this._clients.size };
    } catch (e) {
      console.error('[SUI Manager] refresh error:', e.message);
      return { ok: false, error: e.message };
    }
  }

  /**
   * Agrega un servidor S-UI al pool en tiempo real (sin recargar todos)
   * Útil cuando se registra un nuevo servidor desde el panel.
   */
  agregarServidor(srv) {
    const id = srv.id || srv._id?.toString();
    const client = new SUIClient({
      baseUrl:   srv.suiUrl || `https://${srv.host}:41111`,
      username:  srv.suiUsername || srv.userName,
      password:  srv.suiPassword || srv.password,
      token:     srv.suiToken   || '',
      inboundId: srv.suiInboundId || 1,
      subUrl:    srv.suiSubUrl  || `https://${srv.host}:2096/sub`,
      serverId:  id,
    });
    this._clients.set(id, client);
    return client;
  }

  removerServidor(serverId) {
    this._clients.delete(serverId);
  }

  // ─── Acceso a clientes ────────────────────────────────────────────────────

  getCliente(serverId) {
    const client = this._clients.get(serverId);
    if (!client) throw new Error(`Servidor S-UI no encontrado: ${serverId}`);
    return client;
  }

  listarServidores() {
    return [...this._clients.keys()];
  }

  get size() {
    return this._clients.size;
  }

  // ─── Operaciones en un servidor específico ───────────────────────────────

  async agregarCliente(serverId, opts) {
    return this.getCliente(serverId).agregarCliente(opts);
  }

  async renovarCliente(serverId, opts) {
    return this.getCliente(serverId).renovarCliente(opts);
  }

  async suspenderCliente(serverId, opts) {
    return this.getCliente(serverId).suspenderCliente(opts);
  }

  async reactivarCliente(serverId, opts) {
    return this.getCliente(serverId).reactivarCliente(opts);
  }

  async eliminarCliente(serverId, opts) {
    return this.getCliente(serverId).eliminarCliente(opts);
  }

  async obtenerStats(serverId, email) {
    return this.getCliente(serverId).obtenerStats(email);
  }

  async listarClientes(serverId) {
    return this.getCliente(serverId).listarClientes();
  }

  // ─── Operaciones en TODOS los servidores ─────────────────────────────────

  /**
   * Ejecuta un método en todos los servidores en paralelo.
   * @param {string} metodo - nombre del método en SUIClient
   * @param {any[]}  args   - argumentos a pasar
   * @returns {Promise<{ serverId, ok, data?, error? }[]>}
   */
  async enTodos(metodo, ...args) {
    const jobs = [...this._clients.entries()].map(async ([serverId, client]) => {
      try {
        const data = await client[metodo](...args);
        return { serverId, ok: true, data };
      } catch (e) {
        return { serverId, ok: false, error: e.message };
      }
    });
    return Promise.all(jobs);
  }

  /**
   * Sincroniza: detecta clientes en S-UI que no están en la BD.
   * Retorna lista de clientes huérfanos por servidor.
   */
  async sincronizarConDB() {
    if (!this._db) return [];
    const resultados = [];

    for (const [serverId, client] of this._clients.entries()) {
      try {
        const clientesSui = await client.listarClientes();
        const huerfanos = [];

        for (const c of clientesSui) {
          const nombre = c.name || '';
          if (!nombre) continue;
          const existe = await this._db
            .collection(this._nameCollections.devices || 'devices')
            .findOne({ $or: [{ xuiEmail: nombre }, { sui_email: nombre }] });
          if (!existe) {
            huerfanos.push({
              nombre,
              xuiId:    String(c.id),
              enable:   Boolean(c.enable),
              expiry:   c.expiry,
              gbTotal:  +(( c.volume || 0) / (1024 ** 3)).toFixed(1),
            });
          }
        }
        resultados.push({ serverId, total: clientesSui.length, huerfanos });
      } catch (e) {
        resultados.push({ serverId, error: e.message });
      }
    }
    return resultados;
  }
}

// Singleton
const _instance = new SUIManager();
function getSuiManager() { return _instance; }

module.exports = { getSuiManager, SUIManager };
