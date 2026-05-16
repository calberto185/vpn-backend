/**
 * messagesRoutes.js
 * Montadas en /api/messages
 *
 * Admin (/api/messages/admin/*) — verifyToken + checkPermission('messages', action)
 * Cliente (/api/messages/client/*) — verifyToken + checkRole('client'|'standar')
 */
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/messagesController');
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkRole }       = require('../middlewares/verifyRoleMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');

// Acepta "client" (creado por admin) y "standar" (registro público antiguo)
const isClient = checkRole('client', 'standar');

// ── Admin ──────────────────────────────────────────────────────────────────────
router.get ('/admin/inbox',                  verifyToken, checkPermission('messages', 'view'),   ctrl.adminInbox);
router.get ('/admin/sent',                   verifyToken, checkPermission('messages', 'view'),   ctrl.adminSent);
router.get ('/admin/unread-count',           verifyToken, checkPermission('messages', 'view'),   ctrl.adminUnreadCount);
router.get ('/admin/preview',                verifyToken, checkPermission('messages', 'view'),   ctrl.adminPreview);
router.get ('/admin/clients',                verifyToken, checkPermission('messages', 'view'),   ctrl.adminGetClients);
router.get ('/admin/received',               verifyToken, checkPermission('messages', 'view'),   ctrl.adminReceived);
router.get ('/admin/received-unread-count',  verifyToken, checkPermission('messages', 'view'),   ctrl.adminReceivedUnreadCount);
router.post('/admin/send',                   verifyToken, checkPermission('messages', 'create'), ctrl.adminSend);
router.post('/admin/mark-read/:id',          verifyToken, checkPermission('messages', 'update'), ctrl.adminMarkRead);
router.get ('/admin/thread/:id',             verifyToken, checkPermission('messages', 'view'),   ctrl.adminGetThread);

// ── Cliente ────────────────────────────────────────────────────────────────────
router.get ('/client/inbox',         verifyToken, isClient, ctrl.clientInbox);
router.get ('/client/sent',          verifyToken, isClient, ctrl.clientSent);
router.get ('/client/unread-count',  verifyToken, isClient, ctrl.clientUnreadCount);
router.get ('/client/preview',       verifyToken, isClient, ctrl.clientPreview);
router.post('/client/send',          verifyToken, isClient, ctrl.clientSend);
router.post('/client/mark-read/:id', verifyToken, isClient, ctrl.clientMarkRead);
router.get ('/client/thread/:id',    verifyToken, isClient, ctrl.clientGetThread);

module.exports = router;
