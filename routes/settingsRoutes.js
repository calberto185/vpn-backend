/**
 * settingsRoutes.js
 * Montadas en /api/settings
 *
 * Requieren JWT de admin con rol != 'client'
 */
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/settingsController');
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');

// Solo admins con permiso de settings (o superadmin)
const canViewSettings   = [verifyToken, checkPermission('settings', 'view')];
const canUpdateSettings = [verifyToken, checkPermission('settings', 'update')];

router.get ('/notifications',                  ...canViewSettings,   ctrl.getNotificationsConfig);
router.put ('/notifications',                  ...canUpdateSettings, ctrl.saveNotificationsConfig);
router.post('/notifications/test/telegram',    ...canUpdateSettings, ctrl.testTelegram);
router.post('/notifications/test/email',       ...canUpdateSettings, ctrl.testEmail);
router.post('/notifications/test/whatsapp',    ...canUpdateSettings, ctrl.testWhatsApp);

module.exports = router;
