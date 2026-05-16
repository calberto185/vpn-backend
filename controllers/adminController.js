/**
 * adminController.js — Panel de administración
 *
 * Gestión completa de clientes (colección admin, isAdmin=false):
 *   getClients        → listar con filtros/aggregate
 *   getClient         → detalle de un cliente con sus devices
 *   registerClient    → crear cliente desde el panel
 *   editClient        → editar campos del cliente
 *   deleteClient      → soft-delete (bloquear)
 *   verifyClient      → verificar cuenta (activar acceso)
 *   suspendClient     → suspender cuenta
 *   reactivateClient  → reactivar cuenta
 *   updateServices    → asignar servicios al cliente
 *   getStats          → estadísticas globales del sistema
 */

const { v4: uuidv4 }          = require("uuid");
const { getDB, nameCollections } = require("../services/dbServices");
const AdminEntity              = require("../models/adminEntity");
const { encryptPassword }      = require("../utils/encrypt_decrypt");
const { logFromReq }           = require("../utils/binnacle");
const { emitToAdmins, emitToUser } = require("../services/wsService");
const sui                      = require("../services/suiService");

// ─── Helper interno ───────────────────────────────────────────────────────────

function _safeUser(doc) {
  if (!doc) return null;
  const { password, ...rest } = doc;
  return rest;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/clients  (POST con aggregate opcional)
// Lista clientes con filtros. Nunca devuelve contraseñas.
// ═══════════════════════════════════════════════════════════════════════════════
// Operadores de agregación permitidos desde el cliente (previene NoSQL injection)
const _ALLOWED_AGG_OPS = new Set(['$match', '$sort', '$skip', '$limit', '$project', '$addFields']);

function _sanitizePipeline(stages) {
  if (!Array.isArray(stages)) return [];
  return stages.filter(stage => {
    if (typeof stage !== 'object' || stage === null || Array.isArray(stage)) return false;
    const keys = Object.keys(stage);
    if (keys.length !== 1) return false;
    return _ALLOWED_AGG_OPS.has(keys[0]);
  });
}

async function getClients(req, res) {
  try {
    const extraAggregate = _sanitizePipeline(req.body?.aggregate);
    const pipeline = [
      { $match: { isAdmin: false } },
      ...extraAggregate,
      { $addFields: { password: "" } },   // nunca exponer password
      { $sort: { createdAt: -1 } },
    ];
    const db   = getDB();
    const data = await db.collection(nameCollections.admin).aggregate(pipeline).toArray();
    return res.status(200).json({ code: "consultado", status: 200, data });
  } catch (err) {
    console.error("adminController.getClients:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/clients/:id
// Detalle de un cliente con sus devices y pagos recientes
// ═══════════════════════════════════════════════════════════════════════════════
async function getClient(req, res) {
  try {
    const { id } = req.params;
    const db     = getDB();
    const raw    = await db.collection(nameCollections.admin).findOne(
      { id, isAdmin: false },
      { projection: { password: 0 } }
    );
    if (!raw) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    // Enriquecer con devices y pagos recientes
    const [devices, pagos] = await Promise.all([
      db.collection(nameCollections.devices)
        .find({ user_id: id })
        .project({ sui_config: 0, certificate: 0 })
        .toArray(),
      db.collection(nameCollections.payments)
        .find({ user_id: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
    ]);

    return res.status(200).json({
      code: "consultado",
      data: { ...raw, devices, pagos_recientes: pagos },
    });
  } catch (err) {
    console.error("adminController.getClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/clients/register
// Admin crea un cliente directamente (sin signup)
// ═══════════════════════════════════════════════════════════════════════════════
async function registerClient(req, res) {
  try {
    const { firstNames, lastNames, email, password, country, dni, telephone, role, services, observations } = req.body;
    if (!firstNames || !lastNames || !email || !password) {
      return res.status(400).json({ code: "faltan_datos",
        message: "firstNames, lastNames, email y password son requeridos" });
    }
    const db    = getDB();
    const exist = await db.collection(nameCollections.admin).findOne({ email: email.toLowerCase() });
    if (exist) return res.status(409).json({ code: "duplicado", message: "El email ya está registrado" });

    const entity        = new AdminEntity();
    entity.id           = uuidv4();
    entity.firstNames   = firstNames.trim();
    entity.lastNames    = lastNames.trim();
    entity.email        = email.toLowerCase().trim();
    entity.password     = encryptPassword(password);
    entity.role         = role || "client";
    entity.isAdmin      = false;
    entity.state        = "Activo";
    entity.verified     = true;       // admin crea → auto-verificado
    entity.verifiedAt   = new Date();
    entity.country      = country || {};
    entity.dni          = dni || "";
    entity.telephone    = telephone || [];
    entity.services     = Array.isArray(services) ? services : [];
    entity.observations = observations || "";
    entity.createdAt    = new Date();

    await db.collection(nameCollections.admin).insertOne(entity);
    return res.status(201).json({
      code: "registrado", message: "✅ Cliente registrado",
      data: { id: entity.id, email: entity.email },
    });
  } catch (err) {
    console.error("adminController.registerClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/admin/clients/:id
// Editar cualquier campo del cliente (admin tiene acceso total)
// ═══════════════════════════════════════════════════════════════════════════════
async function editClient(req, res) {
  try {
    const { id }  = req.params;
    const db      = getDB();
    const exist   = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    // Campos protegidos que el admin puede cambiar explícitamente
    const {
      password: rawPass,
      isAdmin,       // nunca cambiar esto desde aquí
      _id,           // nunca
      createdAt,     // nunca
      ...campos
    } = req.body;

    // Si viene password en claro, encriptarlo
    if (rawPass) campos.password = encryptPassword(rawPass);

    await db.collection(nameCollections.admin).updateOne(
      { id },
      { $set: { ...campos, updatedAt: new Date() } }
    );

    // If the role changed, kick the user's active session so the new role takes effect immediately
    if ('role' in campos) {
      emitToUser(id, 'session:kicked', { reason: 'role_changed' });
    }

    return res.status(200).json({ code: "actualizado", message: "✅ Cliente actualizado" });
  } catch (err) {
    console.error("adminController.editClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/clients/:id  (soft-delete: bloquear)
// ═══════════════════════════════════════════════════════════════════════════════
async function deleteClient(req, res) {
  try {
    const { id } = req.params;
    const db     = getDB();
    const exist  = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    await db.collection(nameCollections.admin).updateOne(
      { id },
      { $set: { bloqued: true, bloquedAt: new Date(), state: "Bloqueado" } }
    );
    logFromReq(req, "delete_client", id, "client");
    return res.status(200).json({ code: "eliminado", message: "✅ Cliente bloqueado (soft-delete)" });
  } catch (err) {
    console.error("adminController.deleteClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/clients/:id/verify
// Verifica una cuenta pendiente → permite login al cliente
// ═══════════════════════════════════════════════════════════════════════════════
async function verifyClient(req, res) {
  try {
    const { id } = req.params;
    const db     = getDB();
    const exist  = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });
    if (exist.verified) return res.status(200).json({ code: "ya_verificado", message: "La cuenta ya estaba verificada" });

    await db.collection(nameCollections.admin).updateOne(
      { id },
      { $set: { verified: true, verifiedAt: new Date(), state: "Activo" } }
    );
    logFromReq(req, "verify_client", id, "client");

    // Notificar al cliente por email
    try {
      const { sendMail } = require("../shared/mailer");
      await sendMail(
        exist.email,
        "Tu cuenta ha sido verificada",
        `Hola ${exist.firstNames},\n\nTu cuenta ha sido verificada y ya puedes iniciar sesión.\n\nSaludos,\n${process.env.NAME_APP || "SVION"}`
      );
    } catch (e) { console.warn("verifyClient: email no enviado:", e.message); }

    // Tiempo real
    const payload = { user_id: id, state: 'Activo', verified: true, updatedAt: new Date() };
    emitToAdmins('user:updated', payload);
    emitToUser(id, 'user:updated', payload);

    return res.status(200).json({ code: "verificado", message: "✅ Cuenta verificada, cliente notificado" });
  } catch (err) {
    console.error("adminController.verifyClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/clients/:id/suspend
// ═══════════════════════════════════════════════════════════════════════════════
async function suspendClient(req, res) {
  try {
    const { id }     = req.params;
    const { reason } = req.body;
    const db         = getDB();
    const exist      = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    await db.collection(nameCollections.admin).updateOne(
      { id },
      { $set: { suspend: true, suspendAt: new Date(), state: "Suspendido",
                observations: reason || exist.observations || "" } }
    );
    logFromReq(req, "suspend_client", id, "client", { reason: reason || "" });

    // Tiempo real
    const payload = { user_id: id, state: 'Suspendido', suspend: true, updatedAt: new Date() };
    emitToAdmins('user:updated', payload);
    emitToUser(id, 'user:updated', payload);

    return res.status(200).json({ code: "suspendido", message: "✅ Cliente suspendido" });
  } catch (err) {
    console.error("adminController.suspendClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/clients/:id/reactivate
// ═══════════════════════════════════════════════════════════════════════════════
async function reactivateClient(req, res) {
  try {
    const { id } = req.params;
    const db     = getDB();
    const exist  = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    await db.collection(nameCollections.admin).updateOne(
      { id },
      { $set: { suspend: false, suspendAt: new Date(1), state: "Activo", bloqued: false } }
    );
    logFromReq(req, "reactivate_client", id, "client");

    // Tiempo real
    const payload = { user_id: id, state: 'Activo', suspend: false, updatedAt: new Date() };
    emitToAdmins('user:updated', payload);
    emitToUser(id, 'user:updated', payload);

    return res.status(200).json({ code: "reactivado", message: "✅ Cliente reactivado" });
  } catch (err) {
    console.error("adminController.reactivateClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/clients/:id/services
// Asignar/actualizar servicios al cliente (snapshot en services[])
// ═══════════════════════════════════════════════════════════════════════════════
async function updateServices(req, res) {
  try {
    const { id }       = req.params;
    const { services } = req.body;
    if (!services?.length) {
      return res.status(400).json({ code: "faltan_datos", message: "services[] es requerido" });
    }
    const db    = getDB();
    const exist = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    // Evitar duplicados por service_id
    const existingIds = (exist.services || []).map(s => s.service_id);
    const nuevos      = services.filter(s => !existingIds.includes(s.service_id));
    const duplicados  = services.filter(s => existingIds.includes(s.service_id));

    if (!nuevos.length) {
      return res.status(409).json({
        code: "duplicado",
        message: "Todos los servicios ya existen en el cliente",
        data: duplicados,
      });
    }

    await db.collection(nameCollections.admin).updateOne(
      { id },
      { $push: { services: { $each: nuevos } } }
    );
    return res.status(200).json({
      code: "actualizado",
      message: `✅ ${nuevos.length} servicio(s) asignados`,
      data: { asignados: nuevos.length, duplicados: duplicados.length },
    });
  } catch (err) {
    console.error("adminController.updateServices:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/stats
// Estadísticas globales del sistema para el dashboard
// ═══════════════════════════════════════════════════════════════════════════════
async function getStats(req, res) {
  try {
    const db  = getDB();
    const now = new Date();
    const en7d = new Date(now.getTime() + 7 * 86400000);

    const [
      totalClientes,
      clientesActivos,
      clientesSuspendidos,
      clientesPendientes,
      pagosPendientes,
      deviceActivos,
      vencenEn7d,
      servidoresActivos,
    ] = await Promise.all([
      db.collection(nameCollections.admin).countDocuments({ isAdmin: false }),
      db.collection(nameCollections.admin).countDocuments({ isAdmin: false, state: "Activo", "services.state": "activo" }),
      db.collection(nameCollections.admin).countDocuments({ isAdmin: false, "services.state": "suspendido" }),
      db.collection(nameCollections.admin).countDocuments({ isAdmin: false, verified: false }),
      db.collection(nameCollections.payments).countDocuments({ state: { $in: ["Varificando", "Pendiente"] } }),
      db.collection(nameCollections.devices).countDocuments({ active: true, revoked: false }),
      db.collection(nameCollections.admin).countDocuments({
        isAdmin: false,
        "services": { $elemMatch: { state: "activo", endedAt: { $gte: now, $lte: en7d } } }
      }),
      db.collection(nameCollections.servers).countDocuments({ active: true }),
    ]);

    return res.status(200).json({
      code: "consultado",
      data: {
        clientes: {
          total:       totalClientes,
          activos:     clientesActivos,
          suspendidos: clientesSuspendidos,
          pendientes:  clientesPendientes,
        },
        pagos:       { pendientes: pagosPendientes },
        devices:     { activos: deviceActivos },
        vencen_7d:   vencenEn7d,
        servidores:  { activos: servidoresActivos },
        generado_en: now,
      },
    });
  } catch (err) {
    console.error("adminController.getStats:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVIDAD — Bitácora de auditoría
// GET /api/admin/activity/binnacle?page=1&limit=50&action=&actorId=&result=
// ═══════════════════════════════════════════════════════════════════════════════
async function getActivityBinnacle(req, res) {
  try {
    const db    = getDB();
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '50'));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.action)  filter.action  = { $regex: req.query.action,  $options: 'i' };
    if (req.query.actorId) filter.actorId = req.query.actorId;
    if (req.query.result)  filter.result  = req.query.result;

    const [entries, total] = await Promise.all([
      db.collection(nameCollections.binnacle)
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .project({ id: 1, action: 1, actorId: 1, actorEmail: 1, targetId: 1, targetType: 1, result: 1, ip: 1, error: 1, createdAt: 1 })
        .toArray(),
      db.collection(nameCollections.binnacle).countDocuments(filter),
    ]);

    return res.status(200).json({ code: 'consultado', data: entries, total, page, limit });
  } catch (err) {
    console.error('getActivityBinnacle:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVIDAD — Sesiones de login
// GET /api/admin/activity/sessions?page=1&limit=50&userId=
// ═══════════════════════════════════════════════════════════════════════════════
async function getActivitySessions(req, res) {
  try {
    const db    = getDB();
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '50'));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.userId) filter.user_id = req.query.userId;

    const [sessions, total] = await Promise.all([
      db.collection(nameCollections.sessions)
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .project({ id: 1, user_id: 1, createdAt: 1, expiresAt: 1, ip: 1, userAgent: 1 })
        .toArray(),
      db.collection(nameCollections.sessions).countDocuments(filter),
    ]);

    // Enriquecer con nombre/email del usuario
    const userIds = [...new Set(sessions.map(s => s.user_id))];
    const users   = userIds.length
      ? await db.collection(nameCollections.admin)
          .find({ id: { $in: userIds } }, { projection: { id: 1, firstNames: 1, lastNames: 1, email: 1, role: 1 } })
          .toArray()
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = sessions.map(s => ({
      ...s,
      user: userMap[s.user_id]
        ? { email: userMap[s.user_id].email, name: `${userMap[s.user_id].firstNames} ${userMap[s.user_id].lastNames}`.trim(), role: userMap[s.user_id].role }
        : null,
    }));

    return res.status(200).json({ code: 'consultado', data: enriched, total, page, limit });
  } catch (err) {
    console.error('getActivitySessions:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/clients/:id/kick-session
// El admin cierra la sesión activa del cliente: borra sus tokens del DB y
// envía el evento WS "session:kicked" para que el frontend haga logout inmediato.
// ═══════════════════════════════════════════════════════════════════════════════
async function kickSession(req, res) {
  try {
    const { id } = req.params;
    const db     = getDB();
    const exist  = await db.collection(nameCollections.admin).findOne({ id, isAdmin: false });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Cliente no encontrado" });

    // Borrar todas las sesiones activas del usuario
    if (nameCollections.sessions) {
      await db.collection(nameCollections.sessions).deleteMany({ user_id: id });
    }

    // Forzar logout en tiempo real vía WebSocket
    emitToUser(id, "session:kicked", { reason: "Sesión cerrada por el administrador." });

    logFromReq(req, "kick_session", id, "client");
    return res.status(200).json({ code: "sesion_cerrada", message: "✅ Sesión del cliente cerrada" });
  } catch (err) {
    console.error("adminController.kickSession:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/clients/vpn-usage
// Consumo de tráfico S-UI por usuario: { user_id → { gb_usado, gb_total } }
// gb_total = 0 → ilimitado
// ═══════════════════════════════════════════════════════════════════════════════
async function getVpnUsage(req, res) {
  try {
    const db = getDB();

    // 1. Servers con S-UI configurado
    const servers = await db.collection(nameCollections.servers)
      .find({ sui_url: { $exists: true, $ne: "" } })
      .toArray();

    if (!servers.length) return res.status(200).json({ code: "ok", data: {} });

    // 2. Dispositivos s-ui activos: sui_email → user_id
    const devices = await db.collection(nameCollections.devices)
      .find({ protocol: "s-ui", active: true, revoked: false })
      .project({ user_id: 1, sui_email: 1 })
      .toArray();

    const emailToUser = {};
    for (const d of devices) {
      if (d.sui_email) emailToUser[d.sui_email] = d.user_id;
    }

    // 3. Consultar cada servidor en paralelo
    const results = await Promise.allSettled(servers.map(s => sui.listarClientes(s)));

    const usage = {};
    results.forEach(r => {
      if (r.status !== "fulfilled") return;
      for (const c of (r.value || [])) {
        const uid = emailToUser[c.name];
        if (!uid) continue;
        const gb_usado = Math.round(((c.up || 0) + (c.down || 0)) / (1024 ** 3) * 100) / 100;
        const gb_total = Math.round((c.volume || 0) / (1024 ** 3) * 100) / 100;
        // Merge si el usuario tiene dispositivos en varios servidores
        if (usage[uid]) {
          usage[uid].gb_usado = Math.round((usage[uid].gb_usado + gb_usado) * 100) / 100;
          if (usage[uid].gb_total !== 0 && gb_total !== 0)
            usage[uid].gb_total = Math.round((usage[uid].gb_total + gb_total) * 100) / 100;
          else
            usage[uid].gb_total = 0; // cualquier plan ilimitado → ilimitado total
        } else {
          usage[uid] = { gb_usado, gb_total };
        }
      }
    });

    return res.status(200).json({ code: "ok", data: usage });
  } catch (err) {
    console.error("adminController.getVpnUsage:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVIDAD — Registrar acción iniciada desde el frontend
// POST /api/admin/activity/log  { action, targetId, targetType, data }
// ═══════════════════════════════════════════════════════════════════════════════
async function logClientAction(req, res) {
  try {
    const { action, targetId = "", targetType = "", data = {} } = req.body;
    if (!action) return res.status(400).json({ code: "error", message: "El campo 'action' es requerido" });
    const { logFromReq } = require('../utils/binnacle');
    await logFromReq(req, action, String(targetId), String(targetType), data);
    return res.status(200).json({ code: "ok", message: "Acción registrada" });
  } catch (err) {
    console.error("logClientAction:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

module.exports = {
  // compatibilidad con adminRoutes.js existente
  getUsers: getClients,
  registrar: registerClient,
  editar: editClient,
  eliminar: deleteClient,
  updatePlanClient: async (req, res) => res.status(410).json({ code: "deprecated", message: "Usar /api/admin/clients/:id en su lugar" }),
  updateServices,
  // nuevas funciones
  getClients,
  getClient,
  registerClient,
  editClient,
  deleteClient,
  verifyClient,
  suspendClient,
  reactivateClient,
  getStats,
  getActivityBinnacle,
  getActivitySessions,
  logClientAction,
  kickSession,
  getVpnUsage,
};
