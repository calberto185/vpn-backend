/**
 * supplierPaymentsRoutes.js — Gestión de pagos a proveedores
 * Montadas en: /api/supplier-payments
 */
const router  = require('express').Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const ctrl    = require('../controllers/supplierPaymentsController');

router.post('/get',                verifyToken, checkPermission('supplier-payments', 'view'),   ctrl.list);
router.get('/stats/by-supplier',   verifyToken, checkPermission('supplier-payments', 'view'),   ctrl.statsBySupplier);
router.get('/next-reference',      verifyToken, checkPermission('supplier-payments', 'view'),   ctrl.nextReference);
router.get('/recipients',          verifyToken, checkPermission('supplier-payments', 'view'),   ctrl.recipients);
router.get('/:id',                 verifyToken, checkPermission('supplier-payments', 'view'),   ctrl.getOne);
router.post('/',                 verifyToken, checkPermission('supplier-payments', 'create'), ctrl.create);
router.put('/:id',               verifyToken, checkPermission('supplier-payments', 'update'), ctrl.update);
router.delete('/:id',            verifyToken, checkPermission('supplier-payments', 'delete'), ctrl.remove);
router.post('/:id/notify/email', verifyToken, checkPermission('supplier-payments', 'view'),   ctrl.notifyEmail);

module.exports = router;
