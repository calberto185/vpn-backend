// Guard opcional por rol: uso -> router.get('/ruta', verifyToken, requireRole('admin','manager'), handler)
const checkRole = (...rolesPermitidos) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: "no_autenticado",
      status: 401,
      message: "No autenticado",
    });
  }
  if (!rolesPermitidos.includes(req.user.role)) {
    return res.status(403).json({
      code: "sin_permiso",
      status: 403,
      message: "No tienes permisos para esta acción",
    });
  }
  next();
};
module.exports = { checkRole }