const express = require('express');
const router  = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const ctrl = require('../controllers/translationsController');

const canView   = [verifyToken, checkPermission('settings/translations', 'view')];
const canUpdate = [verifyToken, checkPermission('settings/translations', 'update')];
const canDelete = [verifyToken, checkPermission('settings/translations', 'delete')];

// Public — flat map per language for LocaleService
router.get('/',        ctrl.getAll);

// Admin — array of { key, values } for the editor
router.get('/all',     ...canView,   ctrl.getAllAdmin);

// Admin mutations
router.put('/',        ...canUpdate, ctrl.upsertOne);
router.put('/bulk',    ...canUpdate, ctrl.upsertBulk);
router.delete('/:key', ...canDelete, ctrl.remove);

module.exports = router;
