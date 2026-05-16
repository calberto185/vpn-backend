const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, edit, create, remove } = require("../controllers/appsController");

router.post("/get",    verifyToken, checkPermission('settings/apps', 'view'),   get);
router.post("/create", verifyToken, checkPermission('settings/apps', 'create'), create);
router.post("/update", verifyToken, checkPermission('settings/apps', 'update'), edit);
router.post("/delete", verifyToken, checkPermission('settings/apps', 'delete'), remove);

module.exports = router;
