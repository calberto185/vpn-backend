/**
 * n8n.workflow.js — Endpoints para integraciones externas (n8n, webhooks)
 * Auth: verifyTokenApps (token de aplicación, no de usuario)
 */
const { getDB, nameCollections } = require("../services/dbServices");

/**
 * getUsers — Lista clientes para integraciones externas
 * Excluye admins, nunca expone contraseñas
 */
async function getUsers(req, res) {
  try {
    const extraAggregate = Array.isArray(req.body?.aggregate) ? req.body.aggregate : [];
    const pipeline = [
      { $match: { isAdmin: false, verified: true, bloqued: false } },
      ...extraAggregate,
      { $project: { password: 0, _id: 0 } },
      { $sort: { createdAt: -1 } },
    ];
    const db   = getDB();
    const data = await db.collection(nameCollections.admin).aggregate(pipeline).toArray();
    return res.status(200).json({ code: "consultado", status: 200, data });
  } catch (err) {
    console.error("n8n.getUsers:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

module.exports = { getUsers };
