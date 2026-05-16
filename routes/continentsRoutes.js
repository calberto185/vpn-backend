const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get, edit } = require("../controllers/continentsController");

router.get("/", get);
router.post("/", verifyToken, checkRole("admin"), edit);


module.exports = router;