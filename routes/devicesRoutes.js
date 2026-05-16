const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get, create, update, getDevicesClient, createDevicesClient, downloadCertificateClient } = require("../controllers/devicesController");
const { crear: crearCertificado } = require("../controllers/vpnController");
const { checkPlan } = require("../middlewares/verifyPlanMiddleware");

router.post("/get", verifyToken, checkRole("admin"), get);
router.post("/create", verifyToken, checkRole("admin"), create);
router.post("/update", verifyToken, checkRole("admin"), update);

// clients
router.post("/client/get", verifyToken, checkRole("client"), getDevicesClient);
router.post("/client/create", verifyToken, checkRole("client"), checkPlan, createDevicesClient, crearCertificado);
router.post("/client/certificate/get", verifyToken, checkRole("client"), checkPlan, downloadCertificateClient);

module.exports = router;