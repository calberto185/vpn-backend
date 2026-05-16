/**
 * routesRoutes.js — Catálogo de rutas del panel admin
 * Montadas en: /api/routes
 *
 * GET  /api/routes        — público (el frontend lo carga al iniciar sesión)
 * POST /api/routes        — solo admin
 * PUT  /api/routes/:id    — solo admin
 * DEL  /api/routes/:id    — solo admin
 */
const router = require("express").Router();
const { checkRole }   = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const routes = require('../controllers/routesController');

const auth = [verifyToken, checkRole("admin")];

router.get("/",       verifyToken, routes.getAll);
router.post("/",      ...auth,     routes.create);
router.put("/:id",    ...auth,     routes.update);
router.delete("/:id", ...auth,     routes.remove);

module.exports = router;
