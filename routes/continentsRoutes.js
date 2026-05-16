const express = require("express");
const router = express.Router();
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get, edit } = require("../controllers/continentsController");

router.get("/", get);
router.post("/", verifyToken, checkPermission('settings/countries', 'update'), edit);


module.exports = router;