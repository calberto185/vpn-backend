const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get, create, update, remove } = require('../controllers/serversController')

router.post("/get", verifyToken, checkRole("admin"), get);
router.post("/create", verifyToken, checkRole("admin"), create);
router.post("/update", verifyToken, checkRole("admin"), update);
router.post("/delete", verifyToken, checkRole("admin"), remove);


module.exports = router;