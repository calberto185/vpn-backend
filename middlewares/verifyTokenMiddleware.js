// middlewares/auth.js
const { verifyAccessToken } = require("../utils/jwtService");

// Lee el access token del header Authorization: "Bearer <token>"
const verifyToken = (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({
        code: "token_requerido",
        status: 401,
        message: "Se requiere un token Bearer en el encabezado Authorization",
      });
    }

    const token = auth.slice(7); // quita "Bearer "
    const payload = verifyAccessToken(token); // lanza si es inválido/expirado


    if (payload.bloqued) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta fue bloqueada!. Contactar con el administrador!.",
      });
    }
    if (payload.suspend) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta fue suspendida!. Contactar con el administrador!.",
      });
    }
    if (!payload.verified) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta aun no ha sido verificada!. En breve seré veridicada!.",
      });
    }
    // Expón lo necesario al request
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      firstNames: payload.firstNames,
      picture: payload.picture,
      // services: payload.services,
      bloqued: payload.bloqued,
      suspend: payload.suspend,
      verified: payload.verified,
    };

    return next();
  } catch (err) {
    console.log(err)
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

module.exports = { verifyToken }