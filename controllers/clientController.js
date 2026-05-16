/**
 * clientController.js — Perfil y datos del cliente para Angular
 *
 * Rutas montadas en /api/client (requieren JWT de cliente)
 *   GET  /me                                 → perfil completo
 *   PUT  /me                                 → actualizar datos personales
 *   GET  /me/services                        → servicios contratados con estado
 *   GET  /me/services/:service_id/stats      → consumo en tiempo real (S-UI)
 *   POST /me/services/:service_id/suspend    → suspender servicio propio (S-UI)
 *   POST /me/services/:service_id/reactivate → reactivar servicio propio (S-UI)
 *   POST /me/services/:service_id/cancel-request → solicitar cancelación de servicio
 *   GET  /me/payments                        → historial de pagos
 *   GET  /me/devices                         → dispositivos activos
 *   PUT  /me/password                        → cambiar contraseña
 */

const { getDB, nameCollections } = require("../services/dbServices");
const { encryptPassword, decryptPassword } = require("../utils/encrypt_decrypt");
const AdminEntity = require("../models/adminEntity");
const sui         = require("../services/suiService");

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/me
// ═══════════════════════════════════════════════════════════════════════════════
async function getMe(req, res) {
  try {
    const db  = getDB();
    const raw = await db.collection(nameCollections.admin).findOne(
      { id: req.user.id, isAdmin: false },
      { projection: { password: 0 } }           // nunca devolver password
    );
    if (!raw) return res.status(404).json({ code: "no_encontrado" });

    return res.status(200).json({ code: "consultado", data: raw });
  } catch (err) {
    console.error("clientController.getMe:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/client/me
// Solo campos seguros — no se puede cambiar role, isAdmin, estado, verified
// ═══════════════════════════════════════════════════════════════════════════════
async function updateMe(req, res) {
  try {
    const { firstNames, lastNames, picture, telephone } = req.body;
    const allowed = {};
    if (firstNames !== undefined && firstNames !== null) allowed.firstNames = firstNames.trim();
    if (lastNames  !== undefined && lastNames  !== null) allowed.lastNames  = lastNames.trim();
    if (picture    !== undefined)                        allowed.picture    = picture;   // '' clears photo
    if (telephone  !== undefined)                        allowed.telephone  = telephone;

    if (!Object.keys(allowed).length) {
      return res.status(400).json({ code: "sin_cambios", message: "No hay campos válidos para actualizar" });
    }

    const db = getDB();
    await db.collection(nameCollections.admin).updateOne(
      { id: req.user.id },
      { $set: allowed }
    );
    return res.status(200).json({ code: "actualizado", message: "Perfil actualizado" });
  } catch (err) {
    console.error("clientController.updateMe:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/me/services
// Servicios contratados con estado, plan y fechas
// ═══════════════════════════════════════════════════════════════════════════════
async function getMyServices(req, res) {
  try {
    const db  = getDB();
    const raw = await db.collection(nameCollections.admin).findOne(
      { id: req.user.id },
      { projection: { services: 1, _id: 0 } }
    );
    if (!raw) return res.status(404).json({ code: "no_encontrado" });

    // Enriquecer cada servicio con datos del catálogo
    const services = raw.services || [];
    const enriched = await Promise.all(services.map(async (srv) => {
      const catalog = await db.collection(nameCollections.services)
        .findOne({ id: srv.service_id }, { projection: { sortName: 1, longName: 1, picture: 1 } });
      return {
        ...srv,
        service_name:    catalog?.sortName  || srv.service_id,
        service_longName:catalog?.longName  || "",
        service_picture: catalog?.picture   || "",
        dias_restantes:  srv.endedAt
          ? Math.max(0, Math.ceil((new Date(srv.endedAt) - new Date()) / 86400000))
          : null,
      };
    }));

    return res.status(200).json({ code: "consultado", data: enriched });
  } catch (err) {
    console.error("clientController.getMyServices:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/me/services/:service_id/stats
// Consumo en tiempo real desde S-UI
// ═══════════════════════════════════════════════════════════════════════════════
async function getServiceStats(req, res) {
  try {
    const { service_id } = req.params;
    const db     = getDB();

    const device = await db.collection(nameCollections.devices).findOne({
      user_id:    req.user.id,
      service_id,
      protocol:   "s-ui",
      revoked:    false,
    });
    if (!device) {
      return res.status(404).json({ code: "no_encontrado", message: "Dispositivo no encontrado" });
    }

    const servidor = await db.collection(nameCollections.servers).findOne({
      id: device.server_id, active: true,
    });
    if (!servidor) {
      return res.status(404).json({ code: "servidor_no_disponible" });
    }

    const stats = await sui.obtenerStatsCliente(servidor, { sui_email: device.sui_email });
    return res.status(200).json({
      code: "consultado",
      data: {
        ...stats,
        sub_url: `${(servidor.sui_sub_url || "").replace(/\/+$/, "")}/${device.sui_sub_id}`,
      },
    });
  } catch (err) {
    console.error("clientController.getServiceStats:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/me/payments
// Historial de pagos del cliente
// ═══════════════════════════════════════════════════════════════════════════════
async function getMyPayments(req, res) {
  try {
    const db = getDB();
    const pagos = await db.collection(nameCollections.payments)
      .find({ user_id: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .project({ _id: 0 })
      .toArray();

    return res.status(200).json({ code: "consultado", data: pagos });
  } catch (err) {
    console.error("clientController.getMyPayments:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/me/devices
// Dispositivos activos (sin exponer credenciales técnicas completas)
// ═══════════════════════════════════════════════════════════════════════════════
async function getMyDevices(req, res) {
  try {
    const db      = getDB();
    const devices = await db.collection(nameCollections.devices)
      .find({ user_id: req.user.id, revoked: false })
      .project({
        id: 1, service_id: 1, protocol: 1,
        device: 1, typeDevice: 1, active: 1,
        suspend: 1, suspendAt: 1, createdAt: 1,
        // S-UI: solo sub_id (para generar sub_url), no exponer uuid ni config
        sui_sub_id: 1, sui_email: 1,
        _id: 0,
      })
      .toArray();

    // Enriquecer con sub_url
    const serversCache = new Map();
    const enriched = await Promise.all(devices.map(async (d) => {
      if (d.protocol === "s-ui" && d.sui_sub_id) {
        let servidor = serversCache.get(d.server_id);
        if (!servidor) {
          servidor = await db.collection(nameCollections.servers)
            .findOne({ id: d.server_id }, { projection: { sui_sub_url: 1 } });
          if (servidor) serversCache.set(d.server_id, servidor);
        }
        return {
          ...d,
          sub_url: servidor
            ? `${(servidor.sui_sub_url || "").replace(/\/+$/, "")}/${d.sui_sub_id}`
            : null,
        };
      }
      return d;
    }));

    return res.status(200).json({ code: "consultado", data: enriched });
  } catch (err) {
    console.error("clientController.getMyDevices:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/client/me/password
// ═══════════════════════════════════════════════════════════════════════════════
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ code: "faltan_datos", message: "currentPassword y newPassword requeridos" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ code: "password_invalido", message: "La contraseña debe tener al menos 8 caracteres" });
    }

    const db  = getDB();
    const raw = await db.collection(nameCollections.admin).findOne({ id: req.user.id });
    if (!raw) return res.status(404).json({ code: "no_encontrado" });

    let passOk = false;
    try { passOk = decryptPassword(raw.password) === currentPassword; } catch {}
    if (!passOk) {
      return res.status(401).json({ code: "password_incorrecto", message: "Contraseña actual incorrecta" });
    }

    await db.collection(nameCollections.admin).updateOne(
      { id: req.user.id },
      { $set: { password: encryptPassword(newPassword) } }
    );
    return res.status(200).json({ code: "actualizado", message: "Contraseña actualizada" });
  } catch (err) {
    console.error("clientController.changePassword:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/client/me/services/:service_id/suspend
// El cliente suspende su propio acceso S-UI (lo puede reactivar después)
// ═══════════════════════════════════════════════════════════════════════════════
async function suspendService(req, res) {
  try {
    const { service_id } = req.params;
    const db = getDB();

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: req.user.id, service_id, protocol: "s-ui", revoked: false,
    });
    if (!device) {
      return res.status(404).json({ code: "no_encontrado", message: "Dispositivo no encontrado para este servicio" });
    }
    if (device.suspend) {
      return res.status(400).json({ code: "ya_suspendido", message: "El servicio ya está suspendido" });
    }

    const servidor = await db.collection(nameCollections.servers).findOne({ id: device.server_id, active: true });
    if (!servidor) {
      return res.status(404).json({ code: "servidor_no_disponible", message: "Servidor no disponible" });
    }

    await sui.suspenderCliente(servidor, { sui_uuid: device.sui_uuid, sui_config: device.sui_config });

    await db.collection(nameCollections.devices).updateOne(
      { id: device.id },
      { $set: { suspend: true, suspendAt: new Date().toISOString() } }
    );

    return res.status(200).json({ code: "suspendido", message: "Servicio suspendido correctamente" });
  } catch (err) {
    console.error("clientController.suspendService:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/client/me/services/:service_id/reactivate
// El cliente reactiva su servicio suspendido
// ═══════════════════════════════════════════════════════════════════════════════
async function reactivateService(req, res) {
  try {
    const { service_id } = req.params;
    const db = getDB();

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: req.user.id, service_id, protocol: "s-ui", revoked: false,
    });
    if (!device) {
      return res.status(404).json({ code: "no_encontrado", message: "Dispositivo no encontrado para este servicio" });
    }
    if (!device.suspend) {
      return res.status(400).json({ code: "no_suspendido", message: "El servicio no está suspendido" });
    }

    const servidor = await db.collection(nameCollections.servers).findOne({ id: device.server_id, active: true });
    if (!servidor) {
      return res.status(404).json({ code: "servidor_no_disponible", message: "Servidor no disponible" });
    }

    await sui.reactivarCliente(servidor, { sui_uuid: device.sui_uuid, sui_config: device.sui_config });

    await db.collection(nameCollections.devices).updateOne(
      { id: device.id },
      { $set: { suspend: false, suspendAt: null } }
    );

    return res.status(200).json({ code: "reactivado", message: "Servicio reactivado correctamente" });
  } catch (err) {
    console.error("clientController.reactivateService:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/client/me/services/:service_id/cancel-request
// El cliente solicita la cancelación de su servicio (genera una nota CRM)
// ═══════════════════════════════════════════════════════════════════════════════
async function requestCancelService(req, res) {
  try {
    const { service_id } = req.params;
    const { reason = "" } = req.body;
    const db = getDB();

    // Verificar que el servicio pertenece al cliente
    const client = await db.collection(nameCollections.admin).findOne(
      { id: req.user.id, "services.service_id": service_id },
      { projection: { services: 1, firstNames: 1, lastNames: 1, email: 1 } }
    );
    if (!client) {
      return res.status(404).json({ code: "no_encontrado", message: "Servicio no encontrado" });
    }

    const note = {
      id: require("crypto").randomUUID(),
      text: `[SOLICITUD CANCELACIÓN] Servicio: ${service_id}. Motivo: ${reason || "No especificado"}. Solicitado por el cliente el ${new Date().toLocaleDateString("es-PE")}.`,
      author: `${client.firstNames} ${client.lastNames} (${client.email})`,
      createdAt: new Date().toISOString(),
    };

    await db.collection(nameCollections.admin).updateOne(
      { id: req.user.id },
      { $push: { "crm.notes": note } }
    );

    return res.status(200).json({ code: "solicitado", message: "Solicitud de cancelación registrada. El administrador la procesará pronto." });
  } catch (err) {
    console.error("clientController.requestCancelService:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

module.exports = {
  getMe,
  updateMe,
  getMyServices,
  getServiceStats,
  suspendService,
  reactivateService,
  requestCancelService,
  getMyPayments,
  getMyDevices,
  changePassword,
};
