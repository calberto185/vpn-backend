const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, getHomeContent, upsertHomeContent } = require("../controllers/publicController");

router.get("/plans",              get);             // public
router.get("/home-content",       getHomeContent);  // public
router.post("/home-content/upsert", verifyToken, checkPermission('settings/public-content', 'update'), upsertHomeContent);

module.exports = router;
