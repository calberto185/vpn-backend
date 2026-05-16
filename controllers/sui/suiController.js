/**
 * suiController.js — Endpoints REST para gestión S-UI multi-servidor
 *
 * Todos los endpoints requieren autenticación JWT (verifyToken).
 * La mayoría requiere rol "admin".
 *
 * Rutas registradas en /api/sui/*
 */

const { getSuiManager } = require('../../services/sui/suiManager');
const { getDB, nameCollections } = require('../../services/dbServices');
const { v4: uuidv4 } = require('uuid');

// ─── Pool ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/sui/pool/refresh
 * Recarga el pool de servidores S-UI desde MongoDB.
 */
async function refreshPool(req, res) {
  try {
    const mgr = getSuiManager();
    const result = await mgr.refresh();
    res.json({ code: 'pool_actualizado', status: 200, data: result });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * GET /api/sui/pool/status
 * Estado actual del pool (qué servidores están cargados).
 */
async function poolStatus(req, res) {
  try {
    const mgr = getSuiManager();
    res.json({
      code: 'status', status: 200,
      data: { servidores: mgr.listarServidores(), total: mgr.size },
    });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

// ─── Clientes VPN ─────────────────────────────────────────────────────────────

/**
 * POST /api/sui/clientes/listar
 * Body: { serverId }
 * Lista todos los clientes de un servidor S-UI específico.
 */
async function listarClientes(req, res) {
  try {
    const { serverId } = req.body;
    console.log("serverId: ", serverId)
    if (!serverId) return res.status(400).json({ code: 'error', status: 400, message: 'serverId requerido' });
    const mgr = getSuiManager();
    console.log("mgr: ", mgr)
    const clientes = await mgr.listarClientes(serverId);
    console.log("clientes: ", clientes)
    res.json({ code: 'consultado', status: 200, data: clientes });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/todos
 * Lista clientes de TODOS los servidores S-UI en paralelo.
 */
async function listarClientesTodos(req, res) {
  try {
    const mgr = getSuiManager();
    const resultados = await mgr.enTodos('listarClientes');
    res.json({ code: 'consultado', status: 200, data: resultados });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/stats
 * Body: { serverId, email }
 */
async function statsCliente(req, res) {
  try {
    const { serverId, email } = req.body;
    if (!serverId || !email) return res.status(400).json({ code: 'error', status: 400, message: 'serverId y email requeridos' });
    const mgr = getSuiManager();
    const stats = await mgr.obtenerStats(serverId, email);
    res.json({ code: 'consultado', status: 200, data: stats });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/crear
 * Body: { serverId, email, gbLimite, dias, dispositivos?, desc?, userId?, serviceId? }
 * Crea el cliente en S-UI Y registra el device en MongoDB.
 */
async function crearCliente(req, res) {
  try {
    const { serverId, email, gbLimite, dias, dispositivos = 1, desc, userId, serviceId, planId } = req.body;
    if (!serverId || !email || !gbLimite || !dias) {
      return res.status(400).json({ code: 'error', status: 400, message: 'serverId, email, gbLimite y dias son requeridos' });
    }

    const mgr = getSuiManager();
    const result = await mgr.agregarCliente(serverId, { email, gbLimite, dias, dispositivos, desc });

    if (!result.success) {
      return res.status(500).json({ code: 'error', status: 500, message: result.error || 'Error en S-UI' });
    }

    // Registrar en MongoDB si se pasó userId
    if (userId) {
      const db = getDB();
      const device = {
        id:           uuidv4(),
        user_id:      userId,
        service_id:   serviceId || '',
        server_id:    serverId,
        plan_id:      planId || '',
        device:       email,
        typeDevice:   'vpn-sui',
        active:       true,
        xuiUuid:      result.uuid,
        xuiEmail:     email,
        xuiSubId:     result.subId,
        xuiConfig:    result.xuiConfig,
        gbTotal:      gbLimite,
        diasPlan:     dias,
        fechaInicio:  new Date(),
        fechaVencimiento: new Date(Date.now() + dias * 86400000),
        revoked:      false,
        suspend:      false,
        createdAt:    new Date(),
        updatedAt:    new Date(),
      };
      await db.collection(nameCollections.devices).insertOne(device);
    }

    res.json({ code: 'creado', status: 200, message: '✅ Cliente VPN creado exitosamente', data: result });
  } catch (e) {
    console.error('crearCliente error:', e);
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/renovar
 * Body: { serverId, clientId, gbLimite, dias, xuiConfig? }
 */
async function renovarCliente(req, res) {
  try {
    const { serverId, clientId, gbLimite, dias, xuiConfig } = req.body;
    if (!serverId || !clientId || !gbLimite || !dias) {
      return res.status(400).json({ code: 'error', status: 400, message: 'Faltan campos requeridos' });
    }
    const mgr = getSuiManager();
    const result = await mgr.renovarCliente(serverId, { clientId, gbLimite, dias, xuiConfig });

    // Actualizar device en MongoDB
    const db = getDB();
    await db.collection(nameCollections.devices).updateOne(
      { xuiUuid: clientId, server_id: serverId },
      { $set: {
        gbTotal: gbLimite,
        diasPlan: dias,
        fechaVencimiento: new Date(Date.now() + dias * 86400000),
        updatedAt: new Date(),
      }}
    );

    res.json({ code: 'renovado', status: 200, message: '✅ Cliente renovado', data: result });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/suspender
 * Body: { serverId, clientId, xuiConfig? }
 */
async function suspenderCliente(req, res) {
  try {
    const { serverId, clientId, xuiConfig } = req.body;
    if (!serverId || !clientId) return res.status(400).json({ code: 'error', status: 400, message: 'Faltan campos' });
    const mgr = getSuiManager();
    const result = await mgr.suspenderCliente(serverId, { clientId, xuiConfig });
    const db = getDB();
    await db.collection(nameCollections.devices).updateOne(
      { xuiUuid: clientId, server_id: serverId },
      { $set: { suspend: true, suspendAt: new Date(), active: false, updatedAt: new Date() }}
    );
    res.json({ code: 'suspendido', status: 200, message: '✅ Cliente suspendido', data: result });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/reactivar
 * Body: { serverId, clientId, xuiConfig? }
 */
async function reactivarCliente(req, res) {
  try {
    const { serverId, clientId, xuiConfig } = req.body;
    if (!serverId || !clientId) return res.status(400).json({ code: 'error', status: 400, message: 'Faltan campos' });
    const mgr = getSuiManager();
    const result = await mgr.reactivarCliente(serverId, { clientId, xuiConfig });
    const db = getDB();
    await db.collection(nameCollections.devices).updateOne(
      { xuiUuid: clientId, server_id: serverId },
      { $set: { suspend: false, active: true, updatedAt: new Date() }}
    );
    res.json({ code: 'reactivado', status: 200, message: '✅ Cliente reactivado', data: result });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/clientes/eliminar
 * Body: { serverId, clientId, xuiConfig? }
 */
async function eliminarCliente(req, res) {
  try {
    const { serverId, clientId, xuiConfig } = req.body;
    if (!serverId || !clientId) return res.status(400).json({ code: 'error', status: 400, message: 'Faltan campos' });
    const mgr = getSuiManager();
    const result = await mgr.eliminarCliente(serverId, { clientId, xuiConfig });
    const db = getDB();
    await db.collection(nameCollections.devices).updateOne(
      { xuiUuid: clientId, server_id: serverId },
      { $set: { revoked: true, revokedAt: new Date(), active: false, updatedAt: new Date() }}
    );
    res.json({ code: 'eliminado', status: 200, message: '✅ Cliente eliminado', data: result });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

/**
 * POST /api/sui/sincronizar
 * Detecta clientes en S-UI sin registro en MongoDB (huérfanos).
 */
async function sincronizar(req, res) {
  try {
    const mgr = getSuiManager();
    const resultados = await mgr.sincronizarConDB();
    const totalHuerfanos = resultados.reduce((s, r) => s + (r.huerfanos?.length || 0), 0);
    res.json({ code: 'sincronizado', status: 200, message: `${totalHuerfanos} clientes sin registro detectados`, data: resultados });
  } catch (e) {
    res.status(500).json({ code: 'error', status: 500, message: e.message });
  }
}

module.exports = {
  refreshPool, poolStatus,
  listarClientes, listarClientesTodos, statsCliente,
  crearCliente, renovarCliente, suspenderCliente, reactivarCliente, eliminarCliente,
  sincronizar,
};
