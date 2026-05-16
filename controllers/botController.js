/**
 * botController.js — Endpoints exclusivos para el bot de Telegram (Python)
 *
 * Todas las rutas requieren autenticación por API Key (header X-Bot-Key).
 * El bot Python consume estos endpoints en lugar de tocar la DB directamente.
 *
 * Rutas montadas en /api/bot:
 *   POST /client/activate      → activar servicio VPN para un cliente
 *   POST /client/suspend       → suspender
 *   POST /client/reactivate    → reactivar
 *   POST /client/renew         → renovar ciclo
 *   POST /client/revoke        → revocar/dar de baja
 *   GET  /client/:user_id      → estado completo del cliente
 *   GET  /client/:user_id/stats → consumo en S-UI en tiempo real
 *   POST /payment/confirm      → confirmar pago manual
 *   POST /payment/reject       → rechazar pago
 *   GET  /plans/:service_id    → planes activos de un servicio
 *   GET  /servers/active       → servidores S-UI activos
 *   POST /sync                 → trigger sincronización S-UI ↔ DB
 */

const { v4: uuidv4 }      = require("uuid");
const { getDB, nameCollections } = require("../services/dbServices");
const sui                 = require("../services/suiService");
const DeviceEntity        = require("../models/deviceEntity");
const AdminEntity         = require("../models/adminEntity");
const PaymentEntity       = require("../models/paymentsEntity");
const { encryptPassword } = require("../utils/encrypt_decrypt");

// ─── Helper: resolver servidor desde la DB ────────────────────────────────────

async function _getServidor(db, server_id) {
  return db.collection(nameCollections.servers).findOne({ id: server_id, active: true });
}

// ─── Helper: buscar cliente por telegram_id ───────────────────────────────────
// El telegram_id vive en admin.telephone[] como AdminTelephoneDto

async function _getClientePorTelegram(db, telegram_id) {
  return db.collection(nameCollections.admin).findOne({
    "telephone.telegram_id": String(telegram_id),
  });
}

// ─── Helper: obtener plan ────────────────────────────────────────────────────

async function _getPlan(db, plan_id) {
  return db.collection(nameCollections.plans).findOne({ id: plan_id, active: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/client/activate
// ═══════════════════════════════════════════════════════════════════════════════
async function activateClient(req, res) {
  try {
    const { telegram_id, plan_id, service_id, server_id, nombre_vpn } = req.body;

    if (!telegram_id || !plan_id || !service_id || !server_id) {
      return res.status(400).json({
        code: "faltan_datos",
        message: "telegram_id, plan_id, service_id y server_id son requeridos",
      });
    }

    const db     = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) {
      return res.status(404).json({ code: "cliente_no_encontrado",
        message: "No existe un cliente con ese telegram_id" });
    }

    const plan = await _getPlan(db, plan_id);
    if (!plan) {
      return res.status(404).json({ code: "plan_no_encontrado",
        message: "Plan no encontrado o inactivo" });
    }

    const servidor = await _getServidor(db, server_id);
    if (!servidor) {
      return res.status(404).json({ code: "servidor_no_encontrado",
        message: "Servidor no encontrado o inactivo" });
    }

    // Verificar si ya tiene un device activo para este servicio
    const deviceExistente = await db.collection(nameCollections.devices).findOne({
      user_id:    cliente.id,
      service_id,
      suspend:    false,
      revoked:    false,
    });
    if (deviceExistente) {
      return res.status(409).json({ code: "ya_activo",
        message: "El cliente ya tiene este servicio activo",
        data: { device_id: deviceExistente.id, sub_id: deviceExistente.sui_sub_id }
      });
    }

    // ── Crear cliente en S-UI ──────────────────────────────────────────────
    const email    = nombre_vpn || `SVION-${cliente.id.slice(0, 6)}-${telegram_id}`;
    const gbLimite = plan.details?.find(d => d.key === "gb")?.value || 50;
    const dias     = plan.details?.find(d => d.key === "dias")?.value || 30;

    const suiResult = await sui.agregarCliente(servidor, {
      email,
      gbLimite: Number(gbLimite),
      dias:     Number(dias),
      desc:     `${cliente.firstNames} ${cliente.lastNames} | TG:${telegram_id}`,
    });

    if (!suiResult.success) {
      return res.status(500).json({ code: "sui_error", message: suiResult.error });
    }

    // ── Guardar DeviceEntity ───────────────────────────────────────────────
    const device  = new DeviceEntity();
    const now     = new Date();
    device.id         = uuidv4();
    device.user_id    = cliente.id;
    device.plan_id    = plan_id;
    device.service_id = service_id;
    device.server_id  = server_id;
    device.protocol   = "s-ui";
    device.device     = "Suscripción VPN";
    device.typeDevice = "subscription";
    device.active     = true;
    device.sui_uuid   = suiResult.sui_uuid;
    device.sui_email  = suiResult.sui_email;
    device.sui_sub_id = suiResult.sub_id;
    device.sui_config = suiResult.sui_config;
    device.createdAt  = now;
    device.updatedAt  = now;

    await db.collection(nameCollections.devices).insertOne(device);

    // ── Actualizar services[] en el cliente ───────────────────────────────
    const serviceSnapshot = {
      service_id,
      plan_id,
      plan_title:  plan.title_name,
      plan_price:  plan.price,
      device_id:   device.id,
      server_id,
      state:       "activo",
      startedAt:   now,
      endedAt:     new Date(now.getTime() + Number(dias) * 86400 * 1000),
      updatedAt:   now,
    };

    await db.collection(nameCollections.admin).updateOne(
      { id: cliente.id },
      {
        $push: { services: serviceSnapshot },
        $set:  { onService: true, onServiceAt: now },
      }
    );

    return res.status(200).json({
      code:    "activado",
      message: "✅ Servicio VPN activado exitosamente",
      data: {
        user_id:    cliente.id,
        device_id:  device.id,
        sui_email:  suiResult.sui_email,
        sub_id:     suiResult.sub_id,
        sub_url:    suiResult.sub_url,
        endedAt:    serviceSnapshot.endedAt,
      },
    });
  } catch (err) {
    console.error("botController.activateClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/client/suspend
// ═══════════════════════════════════════════════════════════════════════════════
async function suspendClient(req, res) {
  try {
    const { telegram_id, service_id } = req.body;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: cliente.id, service_id, revoked: false,
    });
    if (!device) return res.status(404).json({ code: "device_no_encontrado" });

    const servidor = await _getServidor(db, device.server_id);
    if (servidor) {
      await sui.suspenderCliente(servidor, {
        sui_uuid:   device.sui_uuid,
        sui_config: device.sui_config,
      });
    }

    const now = new Date();
    await db.collection(nameCollections.devices).updateOne(
      { id: device.id },
      { $set: { suspend: true, suspendAt: now, active: false, updatedAt: now } }
    );
    await db.collection(nameCollections.admin).updateOne(
      { id: cliente.id, "services.service_id": service_id },
      { $set: { "services.$.state": "suspendido", "services.$.updatedAt": now } }
    );

    return res.status(200).json({ code: "suspendido", message: "✅ Cliente suspendido" });
  } catch (err) {
    console.error("botController.suspendClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/client/reactivate
// ═══════════════════════════════════════════════════════════════════════════════
async function reactivateClient(req, res) {
  try {
    const { telegram_id, service_id } = req.body;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: cliente.id, service_id, revoked: false,
    });
    if (!device) return res.status(404).json({ code: "device_no_encontrado" });

    const servidor = await _getServidor(db, device.server_id);
    if (servidor) {
      await sui.reactivarCliente(servidor, {
        sui_uuid:   device.sui_uuid,
        sui_config: device.sui_config,
      });
    }

    const now = new Date();
    await db.collection(nameCollections.devices).updateOne(
      { id: device.id },
      { $set: { suspend: false, suspendAt: new Date(1), active: true, updatedAt: now } }
    );
    await db.collection(nameCollections.admin).updateOne(
      { id: cliente.id, "services.service_id": service_id },
      { $set: { "services.$.state": "activo", "services.$.updatedAt": now } }
    );

    return res.status(200).json({ code: "reactivado", message: "✅ Cliente reactivado" });
  } catch (err) {
    console.error("botController.reactivateClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/client/renew
// ═══════════════════════════════════════════════════════════════════════════════
async function renewClient(req, res) {
  try {
    const { telegram_id, service_id, plan_id } = req.body;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: cliente.id, service_id, revoked: false,
    });
    if (!device) return res.status(404).json({ code: "device_no_encontrado" });

    const plan = plan_id ? await _getPlan(db, plan_id) : null;
    const gbLimite = plan?.details?.find(d => d.key === "gb")?.value || 50;
    const dias     = plan?.details?.find(d => d.key === "dias")?.value || 30;

    const servidor = await _getServidor(db, device.server_id);
    let sui_config = device.sui_config;

    if (servidor) {
      const result = await sui.renovarCliente(servidor, {
        sui_uuid:   device.sui_uuid,
        sui_config: device.sui_config,
        gbLimite:   Number(gbLimite),
        dias:       Number(dias),
      });
      if (result.success && plan) {
        sui_config = { ...sui_config, volume: Number(gbLimite) * 1024 ** 3 };
      }
    }

    const now    = new Date();
    const endedAt = new Date(now.getTime() + Number(dias) * 86400 * 1000);

    await db.collection(nameCollections.devices).updateOne(
      { id: device.id },
      { $set: {
          active:     true,
          suspend:    false,
          suspendAt:  new Date(1),
          sui_config,
          updatedAt:  now,
          ...(plan_id && { plan_id }),
        }
      }
    );
    await db.collection(nameCollections.admin).updateOne(
      { id: cliente.id, "services.service_id": service_id },
      { $set: {
          "services.$.state":     "activo",
          "services.$.endedAt":   endedAt,
          "services.$.updatedAt": now,
          ...(plan_id && {
            "services.$.plan_id":    plan_id,
            "services.$.plan_title": plan?.title_name,
            "services.$.plan_price": plan?.price,
          }),
        }
      }
    );

    return res.status(200).json({
      code: "renovado", message: "✅ Servicio renovado",
      data: { endedAt, dias, gbLimite },
    });
  } catch (err) {
    console.error("botController.renewClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/client/revoke
// ═══════════════════════════════════════════════════════════════════════════════
async function revokeClient(req, res) {
  try {
    const { telegram_id, service_id } = req.body;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: cliente.id, service_id, revoked: false,
    });
    if (!device) return res.status(404).json({ code: "device_no_encontrado" });

    const servidor = await _getServidor(db, device.server_id);
    if (servidor) {
      await sui.eliminarCliente(servidor, {
        sui_uuid:   device.sui_uuid,
        sui_config: device.sui_config,
      });
    }

    const now = new Date();
    await db.collection(nameCollections.devices).updateOne(
      { id: device.id },
      { $set: { revoked: true, revokedAt: now, active: false, updatedAt: now } }
    );
    await db.collection(nameCollections.admin).updateOne(
      { id: cliente.id, "services.service_id": service_id },
      { $set: { "services.$.state": "revocado", "services.$.updatedAt": now } }
    );

    return res.status(200).json({ code: "revocado", message: "✅ Servicio revocado" });
  } catch (err) {
    console.error("botController.revokeClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/client/:telegram_id
// ═══════════════════════════════════════════════════════════════════════════════
async function getClient(req, res) {
  try {
    const { telegram_id } = req.params;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const devices = await db.collection(nameCollections.devices)
      .find({ user_id: cliente.id, revoked: false })
      .toArray();

    return res.status(200).json({
      code: "consultado",
      data: {
        id:        cliente.id,
        firstName: cliente.firstNames,
        lastName:  cliente.lastNames,
        email:     cliente.email,
        state:     cliente.state,
        services:  cliente.services || [],
        devices:   devices.map(d => ({
          id:          d.id,
          service_id:  d.service_id,
          protocol:    d.protocol,
          sui_email:   d.sui_email,
          sui_sub_id:  d.sui_sub_id,
          active:      d.active,
          suspend:     d.suspend,
        })),
      },
    });
  } catch (err) {
    console.error("botController.getClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/client/:telegram_id/stats
// ═══════════════════════════════════════════════════════════════════════════════
async function getClientStats(req, res) {
  try {
    const { telegram_id } = req.params;
    const { service_id }  = req.query;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const device = await db.collection(nameCollections.devices).findOne({
      user_id: cliente.id,
      revoked: false,
      ...(service_id && { service_id }),
    });
    if (!device || !device.sui_email) {
      return res.status(404).json({ code: "device_no_encontrado" });
    }

    const servidor = await _getServidor(db, device.server_id);
    if (!servidor) return res.status(404).json({ code: "servidor_no_encontrado" });

    const stats = await sui.obtenerStatsCliente(servidor, { sui_email: device.sui_email });
    return res.status(200).json({ code: "consultado", data: stats });
  } catch (err) {
    console.error("botController.getClientStats:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/payment/confirm
// ═══════════════════════════════════════════════════════════════════════════════
async function confirmPayment(req, res) {
  try {
    const { payment_id, admin_telegram_id } = req.body;
    const db  = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({ id: payment_id });
    if (!pago) return res.status(404).json({ code: "pago_no_encontrado" });

    const adminConfirmador = await _getClientePorTelegram(db, admin_telegram_id);
    const now = new Date();

    await db.collection(nameCollections.payments).updateOne(
      { id: payment_id },
      { $set: {
          state:        "Aceptado",
          confirmedAt:  now,
          confirmedBy:  adminConfirmador?.id || "bot",
          $push: { states: { state: "Aceptado", createdAt: now } },
        }
      }
    );

    return res.status(200).json({ code: "confirmado", message: "✅ Pago confirmado" });
  } catch (err) {
    console.error("botController.confirmPayment:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/payment/reject
// ═══════════════════════════════════════════════════════════════════════════════
async function rejectPayment(req, res) {
  try {
    const { payment_id, reason } = req.body;
    const db  = getDB();
    const now = new Date();

    await db.collection(nameCollections.payments).updateOne(
      { id: payment_id },
      { $set: {
          state:      "Devuelto",
          rejectedAt: now,
          note:       reason || "",
        },
        $push: { states: { state: "Devuelto", createdAt: now } },
      }
    );

    return res.status(200).json({ code: "rechazado", message: "✅ Pago rechazado" });
  } catch (err) {
    console.error("botController.rejectPayment:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/plans/:service_id
// ═══════════════════════════════════════════════════════════════════════════════
async function getPlans(req, res) {
  try {
    const { service_id } = req.params;
    const db    = getDB();
    const plans = await db.collection(nameCollections.plans)
      .find({ "service.id": service_id, active: true, visible: true })
      .sort({ price: 1 })
      .toArray();

    return res.status(200).json({ code: "consultado", data: plans });
  } catch (err) {
    console.error("botController.getPlans:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/servers/active
// ═══════════════════════════════════════════════════════════════════════════════
async function getActiveServers(req, res) {
  try {
    const db      = getDB();
    const servers = await db.collection(nameCollections.servers)
      .find({ active: true })
      .project({ sui_password: 0, password: 0, sui_token: 0, privateKeyPath: 0 })
      .toArray();

    return res.status(200).json({ code: "consultado", data: servers });
  } catch (err) {
    console.error("botController.getActiveServers:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/sync
// Sincroniza clientes de S-UI con DeviceEntity — detecta nuevos sin registro
// ═══════════════════════════════════════════════════════════════════════════════
async function syncSuiWithDB(req, res) {
  try {
    const db      = getDB();
    const servers = await db.collection(nameCollections.servers)
      .find({ active: true, protocol: { $in: ["s-ui", "both"] } })
      .toArray();

    let totalNuevos = 0;
    const reporte   = [];

    for (const server of servers) {
      // Emails que ya están en DeviceEntity para este servidor
      const devicesDocs = await db.collection(nameCollections.devices)
        .find({ server_id: server.id, protocol: "s-ui" })
        .project({ sui_email: 1 })
        .toArray();
      const emailsEnDB = devicesDocs.map(d => d.sui_email).filter(Boolean);

      // Clientes en S-UI que no están en la DB
      const sinRegistro = await sui.sincronizarConDB(server, emailsEnDB);

      for (const c of sinRegistro) {
        // Guardar como device sin asignar (por_ajustar: true)
        const device     = new DeviceEntity();
        const now        = new Date();
        const expiry     = c.expiry ? new Date(c.expiry) : null;
        const volumenGB  = c.volume ? Math.round(c.volume / (1024 ** 3)) : 0;

        device.id         = uuidv4();
        device.user_id    = "sin_asignar";
        device.plan_id    = "sin_asignar";
        device.service_id = "sin_asignar";
        device.server_id  = server.id;
        device.protocol   = "s-ui";
        device.device     = "Sin asignar";
        device.typeDevice = "unknown";
        device.active     = !!c.enable;
        device.sui_uuid   = String(c.id || "");
        device.sui_email  = c.name;
        device.sui_sub_id = c.name;
        device.sui_config = null;
        device.suspend    = !c.enable;
        device.createdAt  = now;
        device.updatedAt  = now;

        // Agregar campos extra de sync
        const doc = {
          ...device,
          por_ajustar:       true,
          gb_total:          volumenGB,
          fecha_vencimiento: expiry,
        };

        await db.collection(nameCollections.devices).updateOne(
          { sui_email: c.name, server_id: server.id },
          { $setOnInsert: doc },
          { upsert: true }
        );
        totalNuevos++;
      }

      reporte.push({
        server:    server.name,
        en_sui:    (await sui.listarClientes(server)).length,
        en_db:     emailsEnDB.length,
        nuevos:    sinRegistro.length,
      });
    }

    return res.status(200).json({
      code:    "sincronizado",
      message: `✅ Sync completado: ${totalNuevos} clientes nuevos detectados`,
      data:    reporte,
    });
  } catch (err) {
    console.error("botController.syncSuiWithDB:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/clients/expiring?dias=7
// Clientes con servicios que vencen dentro de N días (para el notifProcessor)
// ═══════════════════════════════════════════════════════════════════════════════
async function getExpiringClients(req, res) {
  try {
    const dias   = parseInt(req.query.dias || "7", 10);
    const db     = getDB();
    const ahora  = new Date();
    const limite = new Date(ahora.getTime() + dias * 86400 * 1000);

    const clientes = await db.collection(nameCollections.admin).find({
      "services": {
        $elemMatch: {
          state:   "activo",
          endedAt: { $gte: ahora, $lte: limite },
        },
      },
    }).project({
      password: 0,
    }).toArray();

    // Devolver solo los datos necesarios para notificar
    const resultado = clientes.map(c => {
      const tg   = (c.telephone || []).find(t => t.kind === "telegram" && t.telegram_id);
      const svc  = (c.services  || []).find(s => s.state === "activo");
      return {
        user_id:     c.id,
        telegram_id: tg?.telegram_id || null,
        lang:        c.lang || "es",
        plan_title:  svc?.plan_title || "—",
        endedAt:     svc?.endedAt    || null,
        dias_restantes: svc?.endedAt
          ? Math.ceil((new Date(svc.endedAt) - ahora) / 86400000)
          : null,
      };
    }).filter(c => c.telegram_id); // Solo los que tienen Telegram

    return res.status(200).json({ code: "consultado", data: resultado });
  } catch (err) {
    console.error("botController.getExpiringClients:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/client/register
// Registra un nuevo cliente desde el bot Telegram
// ═══════════════════════════════════════════════════════════════════════════════
async function registerClient(req, res) {
  try {
    const { firstNames, lastNames, email, telegram_id, phone, country } = req.body;

    if (!firstNames || !lastNames || !email || !telegram_id) {
      return res.status(400).json({
        code: "faltan_datos",
        message: "firstNames, lastNames, email y telegram_id son requeridos",
      });
    }

    const db = getDB();

    // Verificar email duplicado
    const existEmail = await db.collection(nameCollections.admin)
      .findOne({ email: email.toLowerCase().trim() });
    if (existEmail) {
      return res.status(409).json({ code: "email_duplicado",
        message: "El email ya está registrado" });
    }

    // Verificar telegram_id duplicado
    const existTg = await db.collection(nameCollections.admin)
      .findOne({ "telephone.telegram_id": String(telegram_id) });
    if (existTg) {
      return res.status(409).json({ code: "telegram_duplicado",
        message: "Este Telegram ya tiene una cuenta" });
    }

    const entity        = new AdminEntity();
    entity.id           = uuidv4();
    entity.firstNames   = firstNames.trim();
    entity.lastNames    = lastNames.trim();
    entity.email        = email.toLowerCase().trim();
    entity.password     = encryptPassword(uuidv4()); // password aleatorio (acceso solo por bot)
    entity.role         = "client";
    entity.isAdmin      = false;
    entity.state        = "Activo";
    entity.verified     = true;
    entity.verifiedAt   = new Date();
    entity.country      = country || {};
    entity.telephone    = [{
      phone:        phone || "",
      countryName:  country?.name || "",
      countryCode:  country?.code || "",
      flag:         country?.flag || "",
      phoneCode:    country?.phoneCode || "",
      kind:         "telegram",
      telegram_id:  String(telegram_id),
      isActive:     true,
    }];
    entity.source       = "telegram";
    entity.pipeline_stage = "activo";
    entity.services     = [];
    entity.createdAt    = new Date();
    entity.updatedAt    = new Date();

    await db.collection(nameCollections.admin).insertOne(entity);

    return res.status(201).json({
      code:    "registrado",
      message: "✅ Cliente registrado desde Telegram",
      data:    { id: entity.id, email: entity.email },
    });
  } catch (err) {
    console.error("botController.registerClient:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/payment/create
// Crea un registro de pago desde el bot (usuario envía comprobante)
// ═══════════════════════════════════════════════════════════════════════════════
async function createPayment(req, res) {
  try {
    const { telegram_id, plan_id, service_id, amount, method, telegram_file_id, username } = req.body;

    if (!telegram_id || !plan_id || !amount || !method) {
      return res.status(400).json({
        code: "faltan_datos",
        message: "telegram_id, plan_id, amount y method son requeridos",
      });
    }

    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) {
      return res.status(404).json({ code: "cliente_no_encontrado",
        message: "No existe un cliente con ese telegram_id" });
    }

    const plan = await _getPlan(db, plan_id);
    const now  = new Date();

    const pago        = new PaymentEntity();
    pago.id           = uuidv4();
    pago.user_id      = cliente.id;
    pago.user_name    = `${cliente.firstNames} ${cliente.lastNames}`;
    pago.user_email   = cliente.email;
    pago.plan         = {
      id:    plan?.id    || plan_id,
      title: plan?.title_name || plan_id,
      price: plan?.price || amount,
    };
    pago.kind         = plan?.details?.find(d => d.key === "kind")?.value || "mes";
    pago.picture      = telegram_file_id || "";   // file_id de Telegram
    pago.isPrePay     = false;
    pago.state        = "Varificando";
    pago.states       = [{ state: "Varificando", createdAt: now }];
    pago.amount       = Number(amount);
    pago.method       = method;
    pago.methodPay    = { method };
    pago.note         = username ? `@${username}` : "";
    pago.period       = plan?.details?.find(d => d.key === "dias")?.value
                         ? `${plan.details.find(d => d.key === "dias").value} días`
                         : "30 días";
    // Guardamos datos extra del contexto del bot para facilitar la activación
    pago.bot_meta     = { telegram_id, service_id: service_id || null, plan_id };
    pago.createdAt    = now;

    await db.collection(nameCollections.payments).insertOne(pago);

    return res.status(201).json({
      code:    "creado",
      message: "✅ Comprobante registrado, pendiente de verificación",
      data:    { payment_id: pago.id },
    });
  } catch (err) {
    console.error("botController.createPayment:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/payments/:telegram_id
// Historial de pagos de un cliente (últimos 10)
// ═══════════════════════════════════════════════════════════════════════════════
async function getPaymentHistory(req, res) {
  try {
    const { telegram_id } = req.params;
    const db      = getDB();
    const cliente = await _getClientePorTelegram(db, telegram_id);
    if (!cliente) return res.status(404).json({ code: "no_encontrado" });

    const pagos = await db.collection(nameCollections.payments)
      .find({ user_id: cliente.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .project({ bot_meta: 0 })
      .toArray();

    return res.status(200).json({ code: "consultado", data: pagos });
  } catch (err) {
    console.error("botController.getPaymentHistory:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/bot/pending-payments
// Lista pagos en estado Varificando (para que el admin los revise)
// ═══════════════════════════════════════════════════════════════════════════════
async function getPendingPayments(req, res) {
  try {
    const db    = getDB();
    const pagos = await db.collection(nameCollections.payments)
      .find({ state: "Varificando" })
      .sort({ createdAt: 1 })
      .limit(20)
      .toArray();

    return res.status(200).json({ code: "consultado", data: pagos });
  } catch (err) {
    console.error("botController.getPendingPayments:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bot/messages/send — Mensaje cliente→admin desde el bot
// Body: { telegram_id, subject, body }
// ═══════════════════════════════════════════════════════════════════════════════
async function sendMessageFromBot(req, res) {
  try {
    const { telegram_id, subject, body } = req.body;
    if (!telegram_id) return res.status(400).json({ code: 'sin_telegram_id' });
    if (!subject?.trim()) return res.status(400).json({ code: 'sin_asunto' });
    if (!body?.trim())    return res.status(400).json({ code: 'sin_cuerpo' });

    const { notifyAdmin } = require('../shared/notifyService');

    // Buscar cliente por telegram_id
    const user = await db.collection(nameCollections.admin).findOne(
      { telegram_id: Number(telegram_id), isAdmin: false },
      { projection: { password: 0 } }
    );
    if (!user) return res.status(404).json({ code: 'cliente_no_encontrado' });

    const clientName = `${user.firstNames} ${user.lastNames}`.trim();
    const now = new Date();
    const msg = {
      id:        require('crypto').randomUUID(),
      type:      'client_to_admin',
      from_id:   user.id,
      from_name: clientName,
      to:        [],
      to_label:  'Administrador',
      subject:   subject.trim(),
      body:      body.trim(),
      channels:  ['in_app', 'telegram'],
      delivery:  { email: { sent: false }, telegram: { sent: false }, whatsapp: { sent: false } },
      read_by:   [],
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(nameCollections.messages).insertOne(msg);

    notifyAdmin(user, subject.trim(), body.trim())
      .then(results => {
        db.collection(nameCollections.messages).updateOne(
          { id: msg.id },
          { $set: {
              'delivery.email.sent':    results.email?.sent    || false,
              'delivery.telegram.sent': results.telegram?.sent || false,
              updatedAt: new Date(),
          }}
        );
      })
      .catch(() => {});

    return res.status(201).json({ code: 'enviado', data: { id: msg.id } });
  } catch (err) {
    console.error('botController.sendMessageFromBot:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

module.exports = {
  activateClient,
  suspendClient,
  reactivateClient,
  renewClient,
  revokeClient,
  getClient,
  getClientStats,
  confirmPayment,
  rejectPayment,
  getPlans,
  getActiveServers,
  syncSuiWithDB,
  registerClient,
  createPayment,
  getPaymentHistory,
  getPendingPayments,
  getExpiringClients,
  sendMessageFromBot,
};
