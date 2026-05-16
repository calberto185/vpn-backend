/**
 * docsAuthMiddleware.js — Protección de /api/docs
 *
 * Dos métodos de acceso (cualquiera es válido):
 *
 * 1. HTTP Basic Auth — para el navegador
 *    Usuario: DOCS_USER (default: "svion_docs")
 *    Password: DOCS_PASS (default: generado aleatorio, ver logs al arrancar)
 *
 * 2. Bearer JWT de admin — para acceso programático
 *    Header: Authorization: Bearer <token_de_admin>
 *
 * Si NODE_ENV=production y ninguna credencial está configurada,
 * los docs quedan BLOQUEADOS completamente.
 */

const { verifyAccessToken } = require("../utils/jwtService");

function docsAuth(req, res, next) {
  // En desarrollo se puede deshabilitar la protección
  if (process.env.NODE_ENV !== "production" && process.env.DOCS_OPEN === "true") {
    return next();
  }

  // ── Intento 1: Bearer JWT de admin ────────────────────────────────────────
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(authHeader.slice(7));
      if (payload.role === "admin" || payload.isAdmin) {
        req.user = payload;
        return next();
      }
      // Token válido pero no es admin
      return _unauthorized(res, "Solo administradores pueden acceder a los docs");
    } catch {
      // Token inválido — continúa a Basic Auth
    }
  }

  // ── Intento 2: HTTP Basic Auth ────────────────────────────────────────────
  const docsUser = process.env.DOCS_USER || "svion_docs";
  const docsPass = process.env.DOCS_PASS || "";

  if (!docsPass) {
    // Sin contraseña configurada → bloquear en producción
    if (process.env.NODE_ENV === "production") {
      return _unauthorized(res, "Documentación no disponible. Configura DOCS_PASS en .env");
    }
    // En desarrollo sin contraseña → acceso libre
    return next();
  }

  const b64 = (authHeader.startsWith("Basic ")) ? authHeader.slice(6) : "";
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const [user, ...passParts] = decoded.split(":");
    const pass = passParts.join(":"); // soporta ":" en la contraseña

    if (user === docsUser && pass === docsPass) {
      return next();
    }
  }

  // Sin credenciales o incorrectas → pedir Basic Auth al navegador
  return _unauthorized(res);
}

function _unauthorized(res, message = null) {
  if (message) {
    return res.status(403).json({ code: "sin_permiso", message });
  }
  // Enviar header WWW-Authenticate para que el navegador muestre el popup de login
  res.setHeader("WWW-Authenticate", 'Basic realm="SVION VPN API Docs"');
  return res.status(401).send(
    "<html><body style='font-family:sans-serif;text-align:center;margin-top:100px'>" +
    "<h2>🔒 Documentación API protegida</h2>" +
    "<p>Acceso solo para administradores y desarrolladores.</p>" +
    "</body></html>"
  );
}

module.exports = { docsAuth };
