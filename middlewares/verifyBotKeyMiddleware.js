/**
 * verifyBotKeyMiddleware.js
 * Protege las rutas /api/bot/* con una API Key estática.
 * El bot Python envía: header X-Bot-Key: <BOT_API_KEY>
 */
function verifyBotKey(req, res, next) {
  const key        = req.headers["x-bot-key"];
  const serverKey  = process.env.BOT_API_KEY;

  if (!serverKey) {
    console.error("❌ BOT_API_KEY no definida en .env");
    return res.status(500).json({ code: "config_error", message: "Server misconfigured" });
  }
  if (!key || key !== serverKey) {
    return res.status(401).json({ code: "no_autorizado", message: "API Key inválida" });
  }
  next();
}

module.exports = { verifyBotKey };
