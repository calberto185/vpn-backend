/**
 * rolesRoutes.js — Gestión de roles del panel
 * Montadas en: /api/roles
 */
const router = require('express').Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const rolesCtrl           = require('../controllers/rolesController');

/** Lista todos los roles — requiere permiso view sobre 'roles' */
router.get('/', verifyToken, checkPermission('roles', 'view'), rolesCtrl.list);

/**
 * Sincroniza rutas del catálogo en todos los roles.
 * Debe ir ANTES de /:name para que Express no lo interprete como un nombre de rol.
 */
router.post('/sync-routes', verifyToken, checkPermission('roles', 'update'), rolesCtrl.syncRoutes);

/**
 * Obtiene un rol por name — cualquier usuario panel autenticado.
 * Usado por PermissionsService para cargar los permisos del usuario actual.
 * No requiere permiso 'roles:view' para no bloquear el bootstrap de permisos.
 */
router.get('/:name', verifyToken, rolesCtrl.getByName);

/** Crear rol */
router.post('/',    verifyToken, checkPermission('roles', 'create'), rolesCtrl.create);

/** Actualizar rol */
router.put('/:id',  verifyToken, checkPermission('roles', 'update'), rolesCtrl.update);

/** Eliminar rol */
router.delete('/:id', verifyToken, checkPermission('roles', 'delete'), rolesCtrl.remove);

module.exports = router;
