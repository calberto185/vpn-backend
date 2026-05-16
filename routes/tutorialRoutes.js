const express = require('express');
const router  = express.Router();
const { verifyToken }      = require('../middlewares/verifyTokenMiddleware');
const { checkRole }        = require('../middlewares/verifyRoleMiddleware');
const { checkPermission }  = require('../middlewares/checkPermissionMiddleware');
const {
  getAll, getPublic, create, update, remove, reorder,
} = require('../controllers/tutorialController');

// Client — visible nodes only (any logged-in client or admin)
router.post('/public',  verifyToken, checkRole('client', 'standar', 'admin'), getPublic);

// Admin — full management (permission-based, consistent with other admin routes)
router.post('/get',     verifyToken, checkPermission('tutorial', 'view'),   getAll);
router.post('/create',  verifyToken, checkPermission('tutorial', 'create'), create);
router.post('/update',  verifyToken, checkPermission('tutorial', 'update'), update);
router.post('/delete',  verifyToken, checkPermission('tutorial', 'delete'), remove);
router.post('/reorder', verifyToken, checkPermission('tutorial', 'update'), reorder);

module.exports = router;
