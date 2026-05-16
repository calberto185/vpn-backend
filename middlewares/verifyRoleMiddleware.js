// Guard por roles específicos: uso -> router.get('/ruta', verifyToken, checkRole('admin'), handler)
const checkRole = (...rolesPermitidos) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: "no_autenticado",
      status: 401,
      message: "No autenticado",
    });
  }
  // Users with no role assigned are treated as 'client'
  const userRole = req.user.role || 'client';
  if (!rolesPermitidos.includes(userRole)) {
    return res.status(403).json({
      code: "sin_permiso",
      status: 403,
      message: "No tienes permisos para esta acción",
    });
  }
  next();
};

/**
 * checkAdminPanel — permite acceso a cualquier usuario que NO sea "client".
 * Usado en rutas del panel que admiten múltiples roles (manager, support, etc.).
 * Las rutas exclusivamente admin siguen usando checkRole('admin').
 */
const checkAdminPanel = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: "no_autenticado",
      status: 401,
      message: "No autenticado",
    });
  }
  // Users with no role are treated as 'client' — blocked from admin panel
  const userRole = req.user.role || 'client';
  if (userRole === "client" || userRole === "standar") {
    return res.status(403).json({
      code: "sin_permiso",
      status: 403,
      message: "Acceso restringido al panel de administración",
    });
  }
  next();
};

module.exports = { checkRole, checkAdminPanel };