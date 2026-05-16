const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get, create, update } = require('../controllers/servicesController')

router.post("/get", verifyToken, get);
router.post("/create", verifyToken, checkRole("admin"), create);
router.post("/update", verifyToken, checkRole("admin"), update);


module.exports = router;