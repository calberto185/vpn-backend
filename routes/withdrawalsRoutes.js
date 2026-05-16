const express = require('express');
const router  = express.Router();
const { verifyToken }      = require('../middlewares/verifyTokenMiddleware');
const { checkPermission }  = require('../middlewares/checkPermissionMiddleware');
const ctrl = require('../controllers/withdrawalsController');

router.post('/get',             verifyToken, checkPermission('withdrawals', 'view'),   ctrl.list);
router.get('/next-reference',   verifyToken, checkPermission('withdrawals', 'view'),   ctrl.nextReference);
router.get('/recipients',       verifyToken, checkPermission('withdrawals', 'view'),   ctrl.recipients);
router.get('/:id',              verifyToken, checkPermission('withdrawals', 'view'),   ctrl.getOne);
router.post('/',                verifyToken, checkPermission('withdrawals', 'create'), ctrl.create);
router.put('/:id',              verifyToken, checkPermission('withdrawals', 'update'), ctrl.update);
router.delete('/:id',           verifyToken, checkPermission('withdrawals', 'delete'), ctrl.remove);
router.post('/:id/notify/email',verifyToken, checkPermission('withdrawals', 'view'),   ctrl.notifyEmail);

module.exports = router;
