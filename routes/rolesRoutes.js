/**
 * rolesRoutes.js — Gestión de roles
 * Montadas en: /api/roles
 *
 * GET  /api/roles         — solo admin (listar todos)
 * GET  /api/roles/:name   — usuario autenticado (cargar sus propios permisos)
 * POST /api/roles         — solo admin
 * PUT  /api/roles/:id     — solo admin
 * DEL  /api/roles/:id     — solo admin
 */
const router = require("express").Router();
const { checkRole }   = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const roles = require('../controllers/rolesController');

const auth      = [verifyToken, checkRole("admin")];
const authUser  = [verifyToken];   // any logged-in user can read their own role

router.get("/",              ...auth,     roles.getAll);
router.post("/sync-routes",  ...auth,     roles.syncRoutes);  // must be before /:name
router.get("/:name",         ...authUser, roles.getByName);
router.post("/",             ...auth,     roles.create);
router.put("/:id",           ...auth,     roles.update);
router.delete("/:id",        ...auth,     roles.remove);

module.exports = router;
