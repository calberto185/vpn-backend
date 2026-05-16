const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { checkRole }       = require('../middlewares/verifyRoleMiddleware');
const { historial, usuarios_panel, generateKeyApp, listAppTokens, revokeAppToken, health } = require('../controllers/systemController');
const { get, create, update } = require('../controllers/bankAccountController');
const { getSessionByClient, revokeSession, revokeAllSessions, getAllSessions } = require('../controllers/sessionsController');

router.get("/historial/:usuario",   historial);                        // public

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get("/client/sessions",             verifyToken, getSessionByClient);
router.delete("/client/sessions/all",      verifyToken, revokeAllSessions);
router.delete("/client/sessions/:sessionId", verifyToken, revokeSession);
router.get("/admin/sessions",              verifyToken, checkPermission('systems', 'view'), getAllSessions);

// ── Bank accounts ─────────────────────────────────────────────────────────────
router.post("/client/bankaccount",  verifyToken, checkRole('client', 'standar'), get);
router.get("/usuarios-panel",       verifyToken, checkPermission('systems', 'view'),   usuarios_panel);
router.post("/bankaccount/get",     verifyToken, checkPermission('settings/bank-account', 'view'),   get);
router.post("/bankaccount/create",  verifyToken, checkPermission('settings/bank-account', 'create'), create);
router.post("/bankaccount/update",  verifyToken, checkPermission('settings/bank-account', 'update'), update);

// ── App tokens ────────────────────────────────────────────────────────────────
router.post("/app/token",           verifyToken, checkPermission('systems', 'update'), generateKeyApp);
router.get("/app/tokens",           verifyToken, checkPermission('systems', 'view'),   listAppTokens);
router.delete("/app/token/:id",     verifyToken, checkPermission('systems', 'update'), revokeAppToken);

// ── Health ────────────────────────────────────────────────────────────────────
router.get("/health",               verifyToken, checkPermission('systems', 'view'),   health);

module.exports = router;
