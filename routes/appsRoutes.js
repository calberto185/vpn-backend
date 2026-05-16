const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get, edit, create } = require("../controllers/appsController");
const { checkPlan } = require("../middlewares/verifyPlanMiddleware");

router.post("/get", verifyToken, checkRole("admin"), get);
router.post("/create", verifyToken, checkRole("admin"), create);
router.post("/update", verifyToken, checkRole("admin"), edit);

module.exports = router;