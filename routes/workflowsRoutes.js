const express = require("express");
const router  = express.Router();
const { verifyToken }     = require("../middlewares/verifyTokenMiddleware");
const { checkRole }       = require("../middlewares/verifyRoleMiddleware");
const { verifyTokenApps } = require("../middlewares/verifyTokenAppsMiddleware");
const cron = require("../workflows/cron.workflow");
const n8n  = require("../workflows/n8n.workflow");

// Rutas para aplicaciones externas (n8n, webhooks)
router.post("/n8n/clients/get",  verifyTokenApps, n8n.getUsers);

// Triggers manuales del scheduler (solo admin)
router.post("/cron/sync",          verifyToken, checkRole("admin"), async (req, res) => {
  try { await cron.syncSuiDB(); res.json({ code: "ok", message: "Sync ejecutado" }); }
  catch(e) { res.status(500).json({ code: "error", message: e.message }); }
});
router.post("/cron/recordatorios", verifyToken, checkRole("admin"), async (req, res) => {
  try { await cron.enviarRecordatorios(); res.json({ code: "ok", message: "Recordatorios enviados" }); }
  catch(e) { res.status(500).json({ code: "error", message: e.message }); }
});
router.post("/cron/suspender",     verifyToken, checkRole("admin"), async (req, res) => {
  try { await cron.suspenderVencidos(); res.json({ code: "ok", message: "Suspensión ejecutada" }); }
  catch(e) { res.status(500).json({ code: "error", message: e.message }); }
});
router.post("/cron/resumen",       verifyToken, checkRole("admin"), async (req, res) => {
  try { await cron.resumenAdmin(); res.json({ code: "ok", message: "Resumen enviado" }); }
  catch(e) { res.status(500).json({ code: "error", message: e.message }); }
});

module.exports = router;
