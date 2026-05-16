/**
 * verifyBotTokenMiddleware.js
 * Verifica el token de acceso del bot de Telegram.
 * El bot usa X-Bot-Token en el header (no JWT).
 * Configurar BOT_API_TOKEN en .env
 */
const verifyBotToken = (req, res, next) => {
  const token = req.headers['x-bot-token'];
  if (!token || token !== process.env.BOT_API_TOKEN) {
    return res.status(401).json({ code: 'no_autorizado', status: 401, message: 'Token de bot inválido' });
  }
  next();
};
module.exports = { verifyBotToken };
