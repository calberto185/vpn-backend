const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, create, update, remove } = require('../controllers/serversController');

router.post("/get",    verifyToken, checkPermission('settings/servers', 'view'),   get);
router.post("/create", verifyToken, checkPermission('settings/servers', 'create'), create);
router.post("/update", verifyToken, checkPermission('settings/servers', 'update'), update);
router.post("/delete", verifyToken, checkPermission('settings/servers', 'delete'), remove);

module.exports = router;
