const express = require("express");
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');

const { get, conexiones, crear, descargar, desconectar, eliminar, listar, logs, reactivar,
    revocar, suspender, usuarios, usuarios_certificado, usuarios_dispositivos,
    usuarios_historial } = require('../controllers/vpnController');
const { updateDeviceState, getDeviceState } = require("../controllers/stateDevicesController");

const perm = (action) => [verifyToken, checkPermission('certificates', action)];

router.post("/certificates/get",      ...perm('view'),   get);
router.post("/certificates/create",   ...perm('create'), crear);
router.post("/certificates/revocar",  ...perm('delete'), revocar);
router.post("/certificates/eliminar", ...perm('delete'), eliminar);
router.post("/certificates/suspender",...perm('update'), suspender);
router.post("/certificates/reactivar",...perm('update'), reactivar);
router.post("/certificates/descargar",...perm('view'),   descargar);
router.post("/certificates/device/updatestate", verifyToken, updateDeviceState);
router.post("/certificates/device/state", verifyToken, getDeviceState);

router.post("/desconectar",           ...perm('update'), desconectar);
router.get("/listar",                 verifyToken,       listar);
router.get("/logs",                   verifyToken,       logs);
router.get("/descargar/:usuario",     ...perm('view'),   descargar);
router.get("/logs/conexiones",        ...perm('view'),   conexiones);

// Public — used by client VPN app (no auth)
router.get("/usuarios",                                  usuarios);
router.get("/usuarios/:usuario/dispositivos",            usuarios_dispositivos);
router.get("/usuarios/:usuario/certificado/:dispositivo",usuarios_certificado);
router.get("/usuarios/:usuario/historial",               usuarios_historial);

module.exports = router;
