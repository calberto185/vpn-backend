/**
 * botRoutes.js — Endpoints exclusivos para el bot Telegram Python
 * Montadas en: /api/bot — autenticadas con X-Bot-Key header
 * Rate limit: 120 req/min por clave
 */
const express    = require("express");
const router     = express.Router();
const bot        = require("../controllers/botController");
const { verifyBotKey } = require("../middlewares/verifyBotKeyMiddleware");

router.use(verifyBotKey);

/**
 * @swagger
 * /api/bot/client/activate:
 *   post:
 *     tags: [Bot]
 *     summary: Activar acceso VPN para un cliente
 *     description: |
 *       Crea el cliente en el panel S-UI, genera la suscripción y guarda el DeviceEntity.
 *       Llamado por el bot después de que el admin confirma un pago.
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BotActivateBody'
 *     responses:
 *       200:
 *         description: Cliente activado con sub_url generada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     device_id:  { type: string }
 *                     sui_email:  { type: string }
 *                     sub_url:    { type: string, description: URL de suscripción para la app VPN }
 *       404:
 *         description: Cliente, plan o servidor no encontrado
 */
router.post("/client/activate",   bot.activateClient);

/**
 * @swagger
 * /api/bot/client/suspend:
 *   post:
 *     tags: [Bot]
 *     summary: Suspender cliente y sus dispositivos S-UI
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id]
 *             properties:
 *               telegram_id: { type: integer }
 *               reason:      { type: string }
 *     responses:
 *       200:
 *         description: Cliente suspendido
 */
router.post("/client/suspend",    bot.suspendClient);

/**
 * @swagger
 * /api/bot/client/reactivate:
 *   post:
 *     tags: [Bot]
 *     summary: Reactivar cliente suspendido
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id]
 *             properties:
 *               telegram_id: { type: integer }
 *     responses:
 *       200:
 *         description: Cliente reactivado
 */
router.post("/client/reactivate", bot.reactivateClient);

/**
 * @swagger
 * /api/bot/client/renew:
 *   post:
 *     tags: [Bot]
 *     summary: Renovar plan de un cliente
 *     description: Extiende la fecha de vencimiento y resetea los GB de un cliente existente.
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id, plan_id]
 *             properties:
 *               telegram_id: { type: integer }
 *               plan_id:     { type: string }
 *               gb_limite:   { type: integer, default: 50 }
 *               dias:        { type: integer, default: 30 }
 *               payment_id:  { type: string }
 *     responses:
 *       200:
 *         description: Plan renovado
 */
router.post("/client/renew",      bot.renewClient);

/**
 * @swagger
 * /api/bot/client/revoke:
 *   post:
 *     tags: [Bot]
 *     summary: Revocar acceso VPN definitivamente
 *     description: Da de baja al cliente en S-UI y marca todos sus dispositivos como `revoked=true`.
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id]
 *             properties:
 *               telegram_id: { type: integer }
 *               reason:      { type: string }
 *     responses:
 *       200:
 *         description: Acceso revocado
 */
router.post("/client/revoke",     bot.revokeClient);

/**
 * @swagger
 * /api/bot/client/{telegram_id}:
 *   get:
 *     tags: [Bot]
 *     summary: Obtener datos del cliente por Telegram ID
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - in: path
 *         name: telegram_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Datos del cliente con su dispositivo activo y estado S-UI
 *       404:
 *         description: Cliente no encontrado
 */
router.get("/client/:telegram_id", bot.getClient);

/**
 * @swagger
 * /api/bot/client/{telegram_id}/stats:
 *   get:
 *     tags: [Bot]
 *     summary: Consumo en tiempo real del cliente
 *     description: Consulta S-UI directamente para obtener GB usados, restantes y fecha de expiración.
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - in: path
 *         name: telegram_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Estadísticas de consumo S-UI
 */
router.get("/client/:telegram_id/stats", bot.getClientStats);

/**
 * @swagger
 * /api/bot/payment/confirm:
 *   post:
 *     tags: [Bot]
 *     summary: Confirmar pago desde el bot (admin)
 *     description: El admin confirma un pago manual desde el bot Telegram.
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id]
 *             properties:
 *               payment_id:         { type: string }
 *               admin_telegram_id:  { type: integer }
 *     responses:
 *       200:
 *         description: Pago confirmado
 */
router.post("/payment/confirm", bot.confirmPayment);

/**
 * @swagger
 * /api/bot/payment/reject:
 *   post:
 *     tags: [Bot]
 *     summary: Rechazar pago desde el bot
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id]
 *             properties:
 *               payment_id: { type: string }
 *               reason:     { type: string }
 *     responses:
 *       200:
 *         description: Pago rechazado
 */
router.post("/payment/reject",  bot.rejectPayment);

/**
 * @swagger
 * /api/bot/plans/{service_id}:
 *   get:
 *     tags: [Bot]
 *     summary: Planes activos de un servicio
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - in: path
 *         name: service_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de planes disponibles
 */
router.get("/plans/:service_id", bot.getPlans);

/**
 * @swagger
 * /api/bot/servers/active:
 *   get:
 *     tags: [Bot]
 *     summary: Servidores VPN activos
 *     description: Lista todos los servidores activos con su protocolo y ubicación. El bot usa esto para mostrar opciones al cliente.
 *     security:
 *       - botApiKey: []
 *     responses:
 *       200:
 *         description: Lista de servidores activos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Server'
 */
router.get("/servers/active", bot.getActiveServers);

/**
 * @swagger
 * /api/bot/sync:
 *   post:
 *     tags: [Bot]
 *     summary: Sincronizar S-UI con MongoDB
 *     description: Detecta clientes en S-UI sin registro en la base de datos (huérfanos) y actualiza estados.
 *     security:
 *       - botApiKey: []
 *     responses:
 *       200:
 *         description: Sincronización completada
 */
router.post("/sync", bot.syncSuiWithDB);

/**
 * @swagger
 * /api/bot/client/register:
 *   post:
 *     tags: [Bot]
 *     summary: Registrar nuevo cliente desde el bot Telegram
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstNames, lastNames, email, telegram_id]
 *             properties:
 *               firstNames:   { type: string }
 *               lastNames:    { type: string }
 *               email:        { type: string }
 *               telegram_id:  { type: integer }
 *               phone:        { type: string }
 *               country:      { type: object }
 *     responses:
 *       201:
 *         description: Cliente registrado
 *       409:
 *         description: Email o Telegram ya registrado
 */
router.post("/client/register",  bot.registerClient);

/**
 * @swagger
 * /api/bot/payment/create:
 *   post:
 *     tags: [Bot]
 *     summary: Crear registro de pago (usuario envía comprobante)
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id, plan_id, amount, method]
 *             properties:
 *               telegram_id:      { type: integer }
 *               plan_id:          { type: string }
 *               service_id:       { type: string }
 *               amount:           { type: number }
 *               method:           { type: string }
 *               telegram_file_id: { type: string, description: "file_id del comprobante en Telegram" }
 *               username:         { type: string }
 *     responses:
 *       201:
 *         description: Pago registrado
 */
router.post("/payment/create",   bot.createPayment);

/**
 * @swagger
 * /api/bot/payments/{telegram_id}:
 *   get:
 *     tags: [Bot]
 *     summary: Historial de pagos del cliente
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - in: path
 *         name: telegram_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Últimos 10 pagos del cliente
 */
router.get("/payments/:telegram_id",    bot.getPaymentHistory);

/**
 * @swagger
 * /api/bot/pending-payments:
 *   get:
 *     tags: [Bot]
 *     summary: Pagos pendientes de verificación (para el admin)
 *     security:
 *       - botApiKey: []
 *     responses:
 *       200:
 *         description: Lista de pagos en estado Varificando
 */
router.get("/pending-payments",  bot.getPendingPayments);

/**
 * @swagger
 * /api/bot/clients/expiring:
 *   get:
 *     tags: [Bot]
 *     summary: Clientes con servicios próximos a vencer
 *     description: |
 *       Devuelve clientes con `services[].state=activo` cuyo `endedAt` está dentro de los próximos N días.
 *       Solo incluye clientes que tienen `telegram_id` registrado.
 *       Usado por el notifProcessor del bot para enviar recordatorios.
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - in: query
 *         name: dias
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Ventana de días a consultar (por defecto 7)
 *     responses:
 *       200:
 *         description: Lista de clientes por vencer con su telegram_id
 */
router.get("/clients/expiring", bot.getExpiringClients);

/**
 * @swagger
 * /api/bot/messages/send:
 *   post:
 *     tags: [Bot]
 *     summary: Enviar consulta al admin desde el bot (cliente→admin)
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id, subject, body]
 *             properties:
 *               telegram_id: { type: integer }
 *               subject:     { type: string }
 *               body:        { type: string }
 *     responses:
 *       201:
 *         description: Mensaje enviado
 */
router.post("/messages/send", bot.sendMessageFromBot);

module.exports = router;
