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
async function getClients(req, res) {
  try {
    const extraAggregate = Array.isArray(req.body?.aggregate) ? req.body.aggregate : [];
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
    const { firstNames, lastNames, email, password, country, dni, telephone, role } = req.body;
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
    entity.services     = [];
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
// GET /api/admin/search?q=texto
// Búsqueda global: usuarios, pagos, certificados
// ═══════════════════════════════════════════════════════════════════════════════
async function globalSearch(req, res) {
  try {
    const q = (req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(200).json({ code: "ok", data: { users: [], payments: [], certificates: [] } });
    }

    const db      = getDB();
    const regex   = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const LIMIT   = 5;

    const [users, payments, certs] = await Promise.all([
      // Users: match on name, email, id
      db.collection(nameCollections.admin)
        .find({
          isAdmin: false,
          $or: [
            { firstNames: regex },
            { lastNames:  regex },
            { email:      regex },
            { id:         regex },
          ],
        })
        .project({ password: 0, _id: 0 })
        .limit(LIMIT)
        .toArray(),

      // Payments: match on id, user_email, user_name
      db.collection(nameCollections.payments)
        .find({
          $or: [
            { id:         regex },
            { user_email: regex },
            { user_name:  regex },
          ],
        })
        .project({ _id: 0, id: 1, user_name: 1, user_email: 1, amount: 1, state: 1, createdAt: 1, "plan.title_name": 1 })
        .sort({ createdAt: -1 })
        .limit(LIMIT)
        .toArray(),

      // Certificates: match on user, device, server, id
      db.collection(nameCollections.certificates)
        .find({
          $or: [
            { user:   regex },
            { device: regex },
            { server: regex },
            { id:     regex },
          ],
        })
        .project({ _id: 0, id: 1, user: 1, device: 1, server: 1, user_id: 1, device_id: 1, server_id: 1 })
        .limit(LIMIT)
        .toArray(),
    ]);

    return res.status(200).json({ code: "ok", data: { users, payments, certificates: certs } });
  } catch (err) {
    console.error("adminController.globalSearch:", err);
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
  globalSearch,
};
