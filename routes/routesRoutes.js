/**
 * routesRoutes.js — Catálogo de rutas del panel admin
 * Montadas en: /api/routes
 *
 * GET  /api/routes        — cualquier usuario autenticado (el frontend lo necesita al iniciar)
 * POST /api/routes        — requiere permiso create sobre 'settings/routes'
 * PUT  /api/routes/:id    — requiere permiso update sobre 'settings/routes'
 * DEL  /api/routes/:id    — requiere permiso delete sobre 'settings/routes'
 */
const router = require('express').Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const routesCtrl          = require('../controllers/routesController');

router.get('/',       verifyToken,                                          routesCtrl.list);
router.post('/',      verifyToken, checkPermission('settings/routes', 'create'), routesCtrl.create);
router.put('/:id',    verifyToken, checkPermission('settings/routes', 'update'), routesCtrl.update);
router.delete('/:id', verifyToken, checkPermission('settings/routes', 'delete'), routesCtrl.remove);

module.exports = router;
