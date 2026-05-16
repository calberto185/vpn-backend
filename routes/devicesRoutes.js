const express = require("express");
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { get, create, update, getDevicesClient, createDevicesClient, downloadCertificateClient } = require("../controllers/devicesController");
const { crear: crearCertificado } = require("../controllers/vpnController");
const { checkPlan } = require("../middlewares/verifyPlanMiddleware");

// Panel — permiso por acción sobre la ruta 'devices'
router.post("/get",    verifyToken, checkPermission('devices', 'view'),   get);
router.post("/create", verifyToken, checkPermission('devices', 'create'), create);
router.post("/update", verifyToken, checkPermission('devices', 'update'), update);

// Clients — "standar" es el rol asignado en registro público; "client" por el admin
router.post("/client/get",             verifyToken, checkRole("client", "standar"), getDevicesClient);
router.post("/client/create",          verifyToken, checkRole("client", "standar"), checkPlan, createDevicesClient, crearCertificado);
router.post("/client/certificate/get", verifyToken, checkRole("client", "standar"), checkPlan, downloadCertificateClient);

module.exports = router;
