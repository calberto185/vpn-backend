const express = require("express");
const router  = express.Router();
const { verifyToken }  = require("../middlewares/verifyTokenMiddleware");
const { checkRole }    = require("../middlewares/verifyRoleMiddleware");
const { getBranding, saveBranding, deleteLogo, uploadFields } = require("../controllers/brandingController");

// GET  /api/branding        — public read (used by client layout, landing, etc.)
router.get("/", getBranding);

// PUT  /api/branding        — admin only, multipart (logos + JSON fields)
router.put("/", verifyToken, checkRole("admin"), uploadFields, saveBranding);

// DELETE /api/branding/logo/:field  — remove a specific logo file
router.delete("/logo/:field", verifyToken, checkRole("admin"), deleteLogo);

module.exports = router;
