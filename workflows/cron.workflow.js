/**
 * cron.workflow.js — Scheduler del sistema central
 *
 * Jobs:
 *   Cada hora :00   → recordatorios de vencimiento (5d, 3d, 1d, 0d)
 *   Cada hora :30   → suspensión automática (1 día de gracia)
 *   Lun/Mié/Vie 10h → notificaciones de deuda a suspendidos
 *   Diario 9:00     → resumen al admin vía Telegram
 *   Cada 6h :15     → sincronización S-UI ↔ DB
 *   Diario 3:00     → limpieza de sesiones expiradas
 */

const cron  = require("node-cron");
const https = require("https");

const { getDB, nameCollections } = require("../services/dbServices");
const sui = require("../services/suiService");

// ─── Config ───────────────────────────────────────────────────────────────────

const DIAS_AVISO  = [5, 3, 1, 0];
const DIAS_DEUDA  = [1, 3, 5]; // lun=1, mié=3, vie=5 (getDay())
const DIAS_GRACIA = 1;

// ─── Notificación Telegram al cliente (via Bot Python webhook interno) ─────────

async function _notificarTelegram(telegram_id, mensaje) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !telegram_id) return;
    const body = JSON.stringify({ chat_id: String(telegram_id), text: mensaje, parse_mode: "Markdown" });
    await _postTelegram(`https://api.telegram.org/bot${token}/sendMessage`, body);
  } catch (e) {
    console.warn(`[Scheduler] notif Telegram fallida: ${e.message}`);
  }
}

function _postTelegram(url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Helper: telegram_id del cliente ─────────────────────────────────────────

function _getTelegramId(cliente) {
  const t = (cliente.telephone || []).find(t => t.kind === "telegram" && t.telegram_id);
  return t?.telegram_id || null;
}

// ─── 1. Recordatorios de vencimiento ─────────────────────────────────────────

async function enviarRecordatorios() {
  try {
    const db    = getDB();
    const ahora = new Date();

    for (const dias of DIAS_AVISO) {
      const inicio = new Date(ahora.getTime() + dias * 86400000 - 12 * 3600000);
      const fin    = new Date(ahora.getTime() + dias * 86400000 + 12 * 3600000);

      // Buscar clientes con services[].endedAt en la ventana y state activo
      const clientes = await db.collection(nameCollections.admin).find({
        "services": {
          $elemMatch: {
            state:   "activo",
            endedAt: { $gte: inicio, $lte: fin },
          }
        }
      }).toArray();

      for (const cliente of clientes) {
        const tg_id = _getTelegramId(cliente);
        if (!tg_id) continue;

        // Evitar duplicado (clave en binnacle)
        const clave = `recordatorio_${dias}d_${ahora.toISOString().split("T")[0]}`;
        const ya    = await db.collection(nameCollections.binnacle).findOne({
          user_id: cliente.id, clave,
        });
        if (ya) continue;

        const serviciosVenciendo = cliente.services.filter(s =>
          s.state === "activo" && s.endedAt >= inicio && s.endedAt <= fin
        );

        for (const srv of serviciosVenciendo) {
          const fecha = new Date(srv.endedAt).toLocaleDateString("es-ES");
          const msg   = dias === 0
            ? `⚠️ Tu servicio *${srv.plan_title || "VPN"}* vence *HOY* (${fecha}). Renueva ahora para no perder el acceso.`
            : `⏰ Tu servicio *${srv.plan_title || "VPN"}* vence en *${dias} días* (${fecha}). Puedes renovar desde el menú.`;

          await _notificarTelegram(tg_id, msg);
        }

        await db.collection(nameCollections.binnacle).insertOne({
          id:        require("uuid").v4(),
          user_id:   cliente.id,
          clave,
          tipo:      "recordatorio_vencimiento",
          dias,
          createdAt: ahora,
        });
      }
    }
    console.log(`[Scheduler] ✅ Recordatorios procesados`);
  } catch (e) {
    console.error("[Scheduler] enviarRecordatorios:", e.message);
  }
}

// ─── 2. Suspensión automática ─────────────────────────────────────────────────

async function suspenderVencidos() {
  try {
    const db     = getDB();
    const ahora  = new Date();
    const limite = new Date(ahora.getTime() - DIAS_GRACIA * 86400000);

    // Buscar clientes con services[].state="activo" y endedAt vencida (+ gracia)
    const clientes = await db.collection(nameCollections.admin).find({
      "services": {
        $elemMatch: {
          state:   "activo",
          endedAt: { $lt: limite },
        }
      }
    }).toArray();

    for (const cliente of clientes) {
      for (const srv of cliente.services) {
        if (srv.state !== "activo" || new Date(srv.endedAt) >= limite) continue;

        // Buscar device vinculado
        const device = await db.collection(nameCollections.devices).findOne({
          user_id:    cliente.id,
          service_id: srv.service_id,
          revoked:    false,
          suspend:    false,
        });

        if (device && device.protocol === "s-ui" && device.sui_uuid) {
          const servidor = await db.collection(nameCollections.servers).findOne({
            id: device.server_id, active: true,
          });
          if (servidor) {
            await sui.suspenderCliente(servidor, {
              sui_uuid:   device.sui_uuid,
              sui_config: device.sui_config,
            });
          }
          await db.collection(nameCollections.devices).updateOne(
            { id: device.id },
            { $set: { suspend: true, suspendAt: ahora, active: false, updatedAt: ahora } }
          );
        }

        // Actualizar estado en services[]
        await db.collection(nameCollections.admin).updateOne(
          { id: cliente.id, "services.service_id": srv.service_id },
          { $set: { "services.$.state": "suspendido", "services.$.updatedAt": ahora } }
        );

        // Notificar al cliente
        const tg_id = _getTelegramId(cliente);
        if (tg_id) {
          await _notificarTelegram(tg_id,
            `🚫 Tu servicio *${srv.plan_title || "VPN"}* fue suspendido por falta de pago.\n\nRenueva para reactivarlo.`
          );
        }

        console.log(`[Scheduler] ⏸ Auto-suspendido: ${cliente.firstNames} | service: ${srv.service_id}`);
      }
    }
  } catch (e) {
    console.error("[Scheduler] suspenderVencidos:", e.message);
  }
}

// ─── 3. Notificaciones de deuda ───────────────────────────────────────────────

async function notifDeuda() {
  try {
    const db         = getDB();
    const diaSemana  = new Date().getDay(); // 0=dom, 1=lun...
    if (!DIAS_DEUDA.includes(diaSemana)) return;

    const clientes = await db.collection(nameCollections.admin).find({
      "services.state": "suspendido",
    }).toArray();

    for (const cliente of clientes) {
      const tg_id = _getTelegramId(cliente);
      if (!tg_id) continue;

      const hoy  = new Date().toISOString().split("T")[0];
      const clave = `deuda_${hoy}`;
      const ya   = await db.collection(nameCollections.binnacle).findOne({
        user_id: cliente.id, clave,
      });
      if (ya) continue;

      const suspendidos = cliente.services.filter(s => s.state === "suspendido");
      if (!suspendidos.length) continue;

      const lista = suspendidos.map(s => `• *${s.plan_title || "Servicio"}*`).join("\n");
      await _notificarTelegram(tg_id,
        `💳 Tienes servicios pendientes de pago:\n\n${lista}\n\nRenueva para reactivarlos.`
      );

      await db.collection(nameCollections.binnacle).insertOne({
        id: require("uuid").v4(), user_id: cliente.id,
        clave, tipo: "notif_deuda", createdAt: new Date(),
      });
    }
    console.log("[Scheduler] ✅ Notificaciones de deuda enviadas");
  } catch (e) {
    console.error("[Scheduler] notifDeuda:", e.message);
  }
}

// ─── 4. Resumen diario al admin ───────────────────────────────────────────────

async function resumenAdmin() {
  try {
    const db      = getDB();
    const ahora   = new Date();
    const en7dias = new Date(ahora.getTime() + 7 * 86400000);

    const porVencer = await db.collection(nameCollections.admin).countDocuments({
      "services": { $elemMatch: { state: "activo", endedAt: { $gte: ahora, $lte: en7dias } } }
    });
    const suspendidos = await db.collection(nameCollections.admin).countDocuments({
      "services.state": "suspendido"
    });
    const activos = await db.collection(nameCollections.admin).countDocuments({
      "services.state": "activo"
    });

    const adminTgId = process.env.ADMIN_TELEGRAM_ID;
    if (!adminTgId) return;

    const msg =
      `📊 *Resumen diario — ${ahora.toLocaleDateString("es-ES")}*\n\n` +
      `🟢 Activos: *${activos}*\n` +
      `⏰ Vencen en 7d: *${porVencer}*\n` +
      `🔴 Suspendidos: *${suspendidos}*`;

    await _notificarTelegram(adminTgId, msg);
    console.log("[Scheduler] ✅ Resumen admin enviado");
  } catch (e) {
    console.error("[Scheduler] resumenAdmin:", e.message);
  }
}

// ─── 5. Sync S-UI ↔ DB ───────────────────────────────────────────────────────

async function syncSuiDB() {
  try {
    const db      = getDB();
    const servers = await db.collection(nameCollections.servers)
      .find({ active: true, protocol: { $in: ["s-ui", "both"] } })
      .toArray();

    let totalNuevos = 0;
    for (const server of servers) {
      const docs     = await db.collection(nameCollections.devices)
        .find({ server_id: server.id, protocol: "s-ui" })
        .project({ sui_email: 1 }).toArray();
      const enDB     = docs.map(d => d.sui_email).filter(Boolean);
      const sinReg   = await sui.sincronizarConDB(server, enDB);
      totalNuevos   += sinReg.length;

      for (const c of sinReg) {
        const { v4: uuidv4 } = require("uuid");
        const now = new Date();
        await db.collection(nameCollections.devices).updateOne(
          { sui_email: c.name, server_id: server.id },
          { $setOnInsert: {
              id: uuidv4(), user_id: "sin_asignar", plan_id: "sin_asignar",
              service_id: "sin_asignar", server_id: server.id, protocol: "s-ui",
              device: "Sin asignar", typeDevice: "unknown",
              active: !!c.enable, sui_uuid: String(c.id || ""),
              sui_email: c.name, sui_sub_id: c.name, sui_config: null,
              suspend: !c.enable, revoked: false, por_ajustar: true,
              gb_total: c.volume ? Math.round(c.volume / (1024**3)) : 0,
              fecha_vencimiento: c.expiry ? new Date(c.expiry) : null,
              createdAt: now, updatedAt: now,
          }},
          { upsert: true }
        );
      }
    }
    if (totalNuevos) console.log(`[Scheduler] 🔄 Sync: ${totalNuevos} nuevos detectados en S-UI`);
  } catch (e) {
    console.error("[Scheduler] syncSuiDB:", e.message);
  }
}

// ─── 6. Limpieza de sesiones expiradas ───────────────────────────────────────

async function limpiarSesiones() {
  try {
    const db     = getDB();
    const result = await db.collection(nameCollections.sessions).deleteMany({
      expiresAt: { $lt: new Date() },
    });
    if (result.deletedCount) {
      console.log(`[Scheduler] 🧹 Sesiones expiradas eliminadas: ${result.deletedCount}`);
    }
  } catch (e) {
    console.error("[Scheduler] limpiarSesiones:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Registro de todos los jobs
// ═══════════════════════════════════════════════════════════════════════════════

function iniciarScheduler() {
  // Recordatorios cada hora en punto
  cron.schedule("0 * * * *", enviarRecordatorios);

  // Suspensión automática cada hora:30
  cron.schedule("30 * * * *", suspenderVencidos);

  // Deuda: lun(1), mié(3), vie(5) a las 10:00 UTC
  cron.schedule("0 10 * * 1,3,5", notifDeuda);

  // Resumen admin diario 9:00 UTC
  cron.schedule("0 9 * * *", resumenAdmin);

  // Sync S-UI cada 6 horas a :15
  cron.schedule("15 */6 * * *", syncSuiDB);

  // Limpieza de sesiones diaria 3:00 UTC
  cron.schedule("0 3 * * *", limpiarSesiones);

  console.log(
    "✅ [Scheduler] Jobs iniciados:\n" +
    "  • Recordatorios vencimiento : cada hora :00\n" +
    "  • Suspensión automática     : cada hora :30\n" +
    "  • Notif deuda               : lun/mié/vie 10:00 UTC\n" +
    "  • Resumen admin             : diario 9:00 UTC\n" +
    "  • Sync S-UI ↔ DB            : cada 6h :15\n" +
    "  • Limpieza sesiones         : diario 3:00 UTC"
  );
}

module.exports = {
  iniciarScheduler,
  // Exportar funciones para poder llamarlas manualmente (tests, endpoints admin)
  enviarRecordatorios,
  suspenderVencidos,
  notifDeuda,
  resumenAdmin,
  syncSuiDB,
  limpiarSesiones,
};
