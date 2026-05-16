const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, create, update } = require("../controllers/termsController");

router.post("/get",    get);   // public
router.post("/create", verifyToken, checkPermission('settings/terms', 'create'), create);
router.post("/update", verifyToken, checkPermission('settings/terms', 'update'), update);

module.exports = router;
