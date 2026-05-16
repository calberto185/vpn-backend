/**
 * binnacle.js — Registro de auditoría de acciones del sistema
 *
 * Escribe en la colección "binnacle" cada acción importante:
 *   - Acciones de admin sobre clientes
 *   - Confirmación/rechazo de pagos
 *   - Activación/suspensión de servicios
 *   - Acciones de webhooks
 *
 * Uso:
 *   const { log } = require('../utils/binnacle');
 *   await log({ action: 'verify_client', adminId: req.user.id, targetId: id, data: {} });
 */

const { v4: uuidv4 } = require("uuid");

let _db = null;
let _nameCollections = null;

function init(db, nameCollections) {
  _db = db;
  _nameCollections = nameCollections;
}

/**
 * log — Registra una acción en el binnacle
 * @param {object} entry
 *   action     string  — identificador de la acción ej: "verify_client"
 *   actorId    string  — ID del admin o sistema que ejecutó
 *   actorEmail string  — email del actor (opcional)
 *   targetId   string  — ID del recurso afectado (cliente, pago, etc.)
 *   targetType string  — tipo de recurso: "client" | "payment" | "device" | "server"
 *   data       object  — datos relevantes de la acción
 *   ip         string  — IP del request (opcional)
 *   result     string  — "success" | "error"
 *   error      string  — mensaje de error si aplica
 */
async function log({
  action,
  actorId    = "system",
  actorEmail = "",
  targetId   = "",
  targetType = "",
  data       = {},
  ip         = "",
  result     = "success",
  error      = "",
}) {
  try {
    if (!_db) return; // silencioso si no está inicializado
    await _db.collection(_nameCollections.binnacle).insertOne({
      id:         uuidv4(),
      action,
      actorId,
      actorEmail,
      targetId,
      targetType,
      data,
      ip,
      result,
      error,
      createdAt:  new Date(),
    });
  } catch (e) {
    // Nunca lanzar error desde el binnacle — es logging, no debe romper el flujo
    console.warn("[Binnacle] Error al registrar:", e.message);
  }
}

/**
 * logFromReq — Helper para usar directamente desde un controller con req disponible
 */
function logFromReq(req, action, targetId, targetType, data = {}, result = "success") {
  return log({
    action,
    actorId:    req.user?.id    || "system",
    actorEmail: req.user?.email || "",
    targetId,
    targetType,
    data,
    ip:         req.ip || "",
    result,
  });
}

module.exports = { init, log, logFromReq };
