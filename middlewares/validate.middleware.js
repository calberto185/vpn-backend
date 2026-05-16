/**
 * validate.middleware.js — Joi validation middleware factory
 *
 * Usage:
 *   const { validate, schemas } = require('../middlewares/validate.middleware');
 *   router.post('/endpoint', verifyToken, validate(schemas.createCertificate), handler);
 *
 * validate(schema) returns an Express middleware that:
 *   - Validates req.body against the Joi schema
 *   - Returns 400 with first validation error message if invalid
 *   - Calls next() if valid
 */

const Joi = require("joi");

// ─── Reusable field definitions ───────────────────────────────────────────────
const uuid      = () => Joi.string().uuid({ version: ["v4"] });
const nonEmpty  = () => Joi.string().trim().min(1);
const positiveN = () => Joi.number().positive();

// ═══════════════════════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════════════════════
const schemas = {

  // ── Auth ───────────────────────────────────────────────────────────────────
  login: Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }),

  // ── Payments ───────────────────────────────────────────────────────────────
  hacerPagoInicial: Joi.object({
    payment: Joi.object({
      plan:   nonEmpty().required(),
      bank:   nonEmpty().required(),
      terms:  nonEmpty().required(),
      global: Joi.boolean(),
      payTo:  Joi.number().integer().min(1).max(24),
      total:  positiveN().required(),
      PersonalData: Joi.object().optional(),
    }).required(),
  }).options({ allowUnknown: true }), // multipart sends other fields

  editarPago: Joi.object({
    id:      nonEmpty().required(),
    picture: Joi.string().optional().allow('', null),
    note:    Joi.string().max(500).optional().allow('', null),
    method:  Joi.string().optional().allow('', null),
  }),

  confirmPayment: Joi.object({
    id:   nonEmpty().required(),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  rejectPayment: Joi.object({
    id:     nonEmpty().required(),
    reason: nonEmpty().required(),
  }),

  // ── Crypto payments ────────────────────────────────────────────────────────
  registerCrypto: Joi.object({
    methodId: nonEmpty().required(),
    planId:   nonEmpty().required(),
    amount:   positiveN().required(),
    txHash:   nonEmpty().min(10).required(),
    payTo:    Joi.number().integer().min(1).max(24).optional(),
    network:  Joi.string().optional().allow('', null),
  }),

  createBinanceOrder: Joi.object({
    planId: nonEmpty().required(),
    payTo:  Joi.number().integer().min(1).max(24).optional(),
  }),

  createBybitOrder: Joi.object({
    planId: nonEmpty().required(),
    payTo:  Joi.number().integer().min(1).max(24).optional(),
  }),

  // ── Certificates ──────────────────────────────────────────────────────────
  createCertificate: Joi.object({
    user_id:   nonEmpty().required(),
    device_id: nonEmpty().required(),
    server_id: nonEmpty().required(),
    protocol:  Joi.string().valid('s-ui', 'openvpn').required(),
    note:      Joi.string().max(500).optional().allow('', null),
    valid_days: Joi.alternatives().try(Joi.number().integer().min(1), Joi.string()).optional(),
    expires_at: Joi.alternatives().try(Joi.number().integer().min(1), Joi.string()).optional(),
  }).options({ allowUnknown: true }),

  deleteCertificate: Joi.object({
    user_id:   nonEmpty().required(),
    device_id: nonEmpty().required(),
    server_id: nonEmpty().required(),
  }),

  // ── Users (admin) ─────────────────────────────────────────────────────────
  registerClient: Joi.object({
    firstNames: nonEmpty().required(),
    lastNames:  nonEmpty().required(),
    email:      Joi.string().email().required(),
    password:   Joi.string().min(6).required(),
    role:       Joi.string().optional(),
  }).options({ allowUnknown: true }),

  editClient: Joi.object({
    id: nonEmpty().required(),
  }).options({ allowUnknown: true }),

  // ── Devices ───────────────────────────────────────────────────────────────
  registerDevice: Joi.object({
    user_id:    nonEmpty().required(),
    device:     nonEmpty().required(),
    typeDevice: nonEmpty().required(),
  }).options({ allowUnknown: true }),

  // ── Messages ──────────────────────────────────────────────────────────────
  sendMessage: Joi.object({
    to:      nonEmpty().required(),
    subject: nonEmpty().max(200).required(),
    body:    nonEmpty().max(5000).required(),
  }).options({ allowUnknown: true }),

  // ── Servers ───────────────────────────────────────────────────────────────
  createServer: Joi.object({
    name:     nonEmpty().required(),
    host:     nonEmpty().required(),
    port:     Joi.number().integer().min(1).max(65535).required(),
    protocol: Joi.string().valid('s-ui', 'openvpn', 'both').required(),
  }).options({ allowUnknown: true }),

};

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware factory
// ═══════════════════════════════════════════════════════════════════════════════
function validate(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: true });
    if (error) {
      const msg = error.details[0]?.message?.replace(/['"]/g, '') ?? 'Datos inválidos';
      return res.status(400).json({ code: "validacion", message: msg });
    }
    next();
  };
}

module.exports = { validate, schemas };
