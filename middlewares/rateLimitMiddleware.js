/**
 * rateLimitMiddleware.js
 * express-rate-limit v8 — la validación de IPv6 se desactiva con validate: false
 */
const rateLimit = require("express-rate-limit");

const ipKey = (req) => {
  if (req.user?.id) return req.user.id;
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return ip.replace(/^::ffff:/, "");
};

const base = { validate: false, standardHeaders: true, legacyHeaders: false };

const strictLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      10,
  keyGenerator: ipKey,
  skip: () => process.env.NODE_ENV === "development",
  message: { code: "demasiados_intentos", message: "Demasiados intentos. Espera 15 minutos." },
});

const standardLimit = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max:      60,
  keyGenerator: ipKey,
  message: { code: "rate_limit", message: "Demasiadas solicitudes. Espera un momento." },
});

const botApiLimit = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max:      120,
  keyGenerator: (req) => req.headers["x-bot-key"] || ipKey(req),
  message: { code: "rate_limit_bot", message: "Bot rate limit exceeded." },
});

const webhookLimit = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max:      200,
  keyGenerator: ipKey,
  message: { code: "rate_limit_webhook" },
});

const adminLimit = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max:      200,
  keyGenerator: ipKey,
  message: { code: "rate_limit_admin" },
});

module.exports = { strictLimit, standardLimit, botApiLimit, webhookLimit, adminLimit };
