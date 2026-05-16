const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { validate, schemas } = require("../middlewares/validate.middleware");

const { get, conexiones, crear, descargar, desconectar, listar, logs, reactivar,
    revocar, suspender, eliminar, usuarios, usuarios_certificado, usuarios_dispositivos,
    usuarios_historial} = require('../controllers/vpnController');
const { updateDeviceState, getDeviceState } = require("../controllers/stateDevicesController");

// router.post("/crear", verifyToken, checkRole("admin"), crear);
router.post("/certificates/get", verifyToken, checkRole("admin"), get);
router.post("/certificates/create", verifyToken, checkRole("admin"), crear);
router.post("/certificates/revocar", verifyToken, checkRole("admin"), revocar);
router.post("/certificates/suspender", verifyToken, checkRole("admin"), suspender);
router.post("/certificates/reactivar", verifyToken, checkRole("admin"), reactivar);
router.post("/certificates/descargar", verifyToken, checkRole("admin"), descargar);
router.post("/certificates/eliminar",  verifyToken, checkRole("admin"), validate(schemas.deleteCertificate), eliminar);
router.post("/certificates/device/updatestate", verifyToken, updateDeviceState);
router.post("/certificates/device/state", verifyToken, getDeviceState);

router.post("/desconectar", verifyToken, checkRole("admin"), desconectar);
router.get("/listar", verifyToken, listar);
router.get("/logs", verifyToken, logs);
router.get("/descargar/:usuario", verifyToken, checkRole("admin"), descargar);
router.get("/logs/conexiones", verifyToken, checkRole("admin"), conexiones);
router.get("/usuarios", usuarios);
router.get("/usuarios/:usuario/dispositivos", usuarios_dispositivos);
router.get("/usuarios/:usuario/certificado/:dispositivo", usuarios_certificado);
router.get("/usuarios/:usuario/historial", usuarios_historial);

module.exports = router;
