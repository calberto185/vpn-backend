const { getDB, nameCollections } = require("../services/dbServices");
const { logFromReq } = require("../utils/binnacle");

const col = () => getDB().collection(nameCollections.sessions);

/** GET /system/client/sessions — sesiones activas del usuario autenticado */
async function getSessionByClient(req, res) {
  try {
    const id = req.user.id;
    const sessions = await col()
      .find({ user_id: id })
      .sort({ createdAt: -1 })
      .toArray();

    // Enriquecer: marcar sesión actual por token
    const currentToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const enriched = sessions.map(s => ({
      ...s,
      isCurrent: s.token === currentToken,
      active: s.expiresAt ? new Date(s.expiresAt) > new Date() : true,
    }));

    res.status(200).send({ code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: enriched });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).send({ code: "error", status: 500, message: "Error al realizar la consulta!" });
  }
}

/** DELETE /system/client/sessions/:sessionId — revocar una sesión propia */
async function revokeSession(req, res) {
  try {
    const userId    = req.user.id;
    const sessionId = req.params.sessionId;

    const session = await col().findOne({ id: sessionId });
    if (!session) return res.status(404).json({ code: "error", status: 404, message: "Sesión no encontrada" });

    // Solo puede revocar sus propias sesiones (admins pueden revocar cualquiera)
    if (session.user_id !== userId && req.user.role !== "admin") {
      return res.status(403).json({ code: "error", status: 403, message: "No tienes permiso para revocar esta sesión" });
    }

    await col().deleteOne({ id: sessionId });

    logFromReq(req, "revoke_session", sessionId, "session", { revoked_user_id: session.user_id });

    res.status(200).json({ code: "eliminado", status: 200, message: "Sesión revocada correctamente" });
  } catch (err) {
    console.log("error revokeSession:", err);
    res.status(500).json({ code: "error", status: 500, message: "Error al revocar la sesión" });
  }
}

/** DELETE /system/client/sessions — revocar TODAS las sesiones propias excepto la actual */
async function revokeAllSessions(req, res) {
  try {
    const userId       = req.user.id;
    const currentToken = (req.headers.authorization || '').replace('Bearer ', '').trim();

    const result = await col().deleteMany({
      user_id: userId,
      token:   { $ne: currentToken },
    });

    logFromReq(req, "revoke_all_sessions", userId, "session", { count: result.deletedCount });

    res.status(200).json({
      code: "eliminado", status: 200,
      message: `${result.deletedCount} sesión(es) revocada(s)`,
      data: { count: result.deletedCount },
    });
  } catch (err) {
    console.log("error revokeAllSessions:", err);
    res.status(500).json({ code: "error", status: 500, message: "Error al revocar sesiones" });
  }
}

/** GET /system/admin/sessions — todas las sesiones activas (solo admin) */
async function getAllSessions(req, res) {
  try {
    const { user_id, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (user_id) filter.user_id = user_id;

    const skip = (Number(page) - 1) * Number(limit);
    const [sessions, total] = await Promise.all([
      col().find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).toArray(),
      col().countDocuments(filter),
    ]);

    // Marcar expiradas
    const now = new Date();
    const enriched = sessions.map(s => ({
      ...s,
      active: s.expiresAt ? new Date(s.expiresAt) > now : true,
    }));

    res.status(200).json({ code: "registros", status: 200, data: enriched, total, page: Number(page) });
  } catch (err) {
    console.log("error getAllSessions:", err);
    res.status(500).json({ code: "error", status: 500, message: "Error al obtener sesiones" });
  }
}

module.exports = { getSessionByClient, revokeSession, revokeAllSessions, getAllSessions };
