const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, create, update, deletePlan } = require("../controllers/plansController");

router.post("/get",    get);   // public — used by signup/public pages
router.post("/create", verifyToken, checkPermission('settings/plans', 'create'), create);
router.post("/update", verifyToken, checkPermission('settings/plans', 'update'), update);
router.post("/delete", verifyToken, checkPermission('settings/plans', 'delete'), deletePlan);

module.exports = router;
