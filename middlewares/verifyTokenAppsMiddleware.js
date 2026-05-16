// middlewares/auth.js
const { verifyAccessToken } = require("../utils/jwtService");

// Lee el access token del header Authorization: "Bearer <token>"
const verifyTokenApps = (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth || auth == null || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        code: "token_requerido",
        status: 401,
        message: "No puede acceder a este recurso!.",
      });
    }

    const token = auth.slice(7); // quita "Bearer "
    const payload = verifyAccessToken(token); // lanza si es inválido/expirado

    // Expón lo necesario al request
    req.apps = payload;

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        code: "token_expirado",
        status: 401,
        message: "El token ha expirado",
      });
    }
    return res.status(403).json({
      code: "token_invalido",
      status: 403,
      message: "Token inválido",
    });
  }
};

module.exports = { verifyTokenApps }