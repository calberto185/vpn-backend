const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { historial, usuarios_panel } = require('../controllers/systemController');
const { get, create, update, } = require('../controllers/bankAccountController');
const { generateKeyApp } = require('../controllers/systemController');
const { getSessionByClient } = require('../controllers/sessionsController');

router.get("/historial/:usuario", historial);
router.get("/client/sessions", verifyToken, getSessionByClient);
router.get("/usuarios-panel", verifyToken, checkRole("admin"), usuarios_panel);
router.post("/bankaccount/get", verifyToken, get);
router.post("/bankaccount/create", verifyToken, checkRole("admin"), create);
router.post("/bankaccount/update", verifyToken, checkRole("admin"), update);
router.post("/app/token", verifyToken, checkRole("admin"), generateKeyApp);


module.exports = router;
