const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, create, update, deleteService } = require('../controllers/servicesController');

router.post("/get",    verifyToken, checkPermission('settings/services', 'view'),   get);
router.post("/create", verifyToken, checkPermission('settings/services', 'create'), create);
router.post("/update", verifyToken, checkPermission('settings/services', 'update'), update);
router.post("/delete", verifyToken, checkPermission('settings/services', 'delete'), deleteService);

module.exports = router;
