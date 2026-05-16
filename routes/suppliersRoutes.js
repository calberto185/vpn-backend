/**
 * suppliersRoutes.js — Gestión de proveedores/empresas
 * Montadas en: /api/suppliers
 */
const router  = require('express').Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const ctrl    = require('../controllers/suppliersController');

router.get('/',      verifyToken, checkPermission('suppliers', 'view'),   ctrl.list);
router.get('/:id',   verifyToken, checkPermission('suppliers', 'view'),   ctrl.getOne);
router.post('/',     verifyToken, checkPermission('suppliers', 'create'), ctrl.create);
router.put('/:id',   verifyToken, checkPermission('suppliers', 'update'), ctrl.update);
router.delete('/:id',verifyToken, checkPermission('suppliers', 'delete'), ctrl.remove);

module.exports = router;
