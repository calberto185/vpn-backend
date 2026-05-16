const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 }             = require("uuid");
const { generateTokenApp }       = require("../utils/jwtService");
const { logFromReq }             = require("../utils/binnacle");

const appTokensCol = () => getDB().collection(nameCollections.appTokens);

// ── historial (legacy, kept for backwards compat) ─────────────────────────────
async function historial(req, res) {
  res.status(200).json({ status: 200, data: [], message: "Endpoint legacy — usar binnacle" });
}

// ── Usuarios del panel (legacy) ───────────────────────────────────────────────
async function usuarios_panel(req, res) {
  try {
    const db    = getDB();
    const users = await db.collection(nameCollections.admin)
      .find({ role: { $in: ['admin', 'superadmin'] } }, { projection: { email: 1, firstNames: 1, lastNames: 1, role: 1 } })
      .toArray();
    res.json({ status: 200, data: users });
  } catch (err) {
    res.status(500).json({ status: 500, message: "Error al obtener usuarios del panel" });
  }
}

// ── App token: generar y persistir ────────────────────────────────────────────
async function generateKeyApp(req, res) {
  try {
    const { host, port, countryName, countryCode, label } = req.body;
    if (!host) return res.status(400).json({ code: "error", status: 400, message: "El campo host es requerido" });

    const payload = { host, port: port || 443, countryName: countryName || '', countryCode: countryCode || '' };
    const token   = await generateTokenApp(payload);

    // Persistir en DB para poder listar y revocar
    const doc = {
      id:          uuidv4(),
      label:       (label || host).trim(),
      host,
      port:        port || 443,
      countryName: countryName || '',
      countryCode: countryCode || '',
      token,
      createdBy:   req.user?.id  || 'system',
      createdAt:   new Date(),
      active:      true,
    };
    await appTokensCol().insertOne(doc);

    logFromReq(req, "generate_app_token", doc.id, "appToken", { host, label: doc.label });

    res.status(200).json({ code: "registros", status: 200, message: "✅ Token generado.", data: { id: doc.id, token, label: doc.label } });
  } catch (error) {
    console.log("error generateKeyApp:", error);
    res.status(500).json({ code: "error", status: 500, message: "Error al generar token" });
  }
}

// ── App token: listar todos ────────────────────────────────────────────────────
async function listAppTokens(req, res) {
  try {
    const tokens = await appTokensCol()
      .find({ active: true }, { projection: { token: 0 } }) // no exponer el JWT
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({ code: "registros", status: 200, data: tokens });
  } catch (err) {
    console.log("error listAppTokens:", err);
    res.status(500).json({ code: "error", status: 500, message: "Error al listar tokens" });
  }
}

// ── App token: revocar ────────────────────────────────────────────────────────
async function revokeAppToken(req, res) {
  try {
    const { id } = req.params;
    const existing = await appTokensCol().findOne({ id });
    if (!existing) return res.status(404).json({ code: "error", status: 404, message: "Token no encontrado" });

    await appTokensCol().updateOne({ id }, { $set: { active: false, revokedAt: new Date(), revokedBy: req.user?.id } });

    logFromReq(req, "revoke_app_token", id, "appToken", { host: existing.host, label: existing.label });

    res.status(200).json({ code: "eliminado", status: 200, message: "Token revocado correctamente" });
  } catch (err) {
    console.log("error revokeAppToken:", err);
    res.status(500).json({ code: "error", status: 500, message: "Error al revocar token" });
  }
}

// ── Health metrics ────────────────────────────────────────────────────────────
async function health(req, res) {
  try {
    const mem    = process.memoryUsage();
    const uptime = process.uptime();

    const uptimeFmt = (() => {
      const d = Math.floor(uptime / 86400);
      const h = Math.floor((uptime % 86400) / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      return `${d}d ${h}h ${m}m ${s}s`;
    })();

    res.status(200).json({
      status: 200,
      data: {
        uptime:      uptimeFmt,
        uptimeSec:   Math.round(uptime),
        nodeVersion: process.version,
        platform:    process.platform,
        memory: {
          heapUsedMB:  +(mem.heapUsed  / 1024 / 1024).toFixed(1),
          heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(1),
          rssMB:       +(mem.rss       / 1024 / 1024).toFixed(1),
          externalMB:  +(mem.external  / 1024 / 1024).toFixed(1),
        },
        pid: process.pid,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: "Error al obtener métricas del sistema" });
  }
}

module.exports = { historial, usuarios_panel, generateKeyApp, listAppTokens, revokeAppToken, health };
