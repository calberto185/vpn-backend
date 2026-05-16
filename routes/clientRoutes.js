/**
 * clientRoutes.js — Portal del cliente Angular
 * Montadas en: /api/client — requieren JWT con role="client"
 */
const router = require("express").Router();
const client = require("../controllers/clientController");
const { verifyToken } = require("../middlewares/verifyTokenMiddleware");
const { checkRole }   = require("../middlewares/verifyRoleMiddleware");

// "standar" es el rol asignado por registro público; "client" por el admin panel
const auth = [verifyToken, checkRole("client", "standar")];

/**
 * @swagger
 * /api/client/me:
 *   get:
 *     tags: [Client]
 *     summary: Obtener perfil completo del cliente autenticado
 *     description: Devuelve todos los datos del cliente incluyendo servicios, tags y notas del CRM. Nunca devuelve el password.
 *     responses:
 *       200:
 *         description: Perfil del cliente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ClientProfile'
 *       404:
 *         description: Perfil no encontrado
 */
router.get("/me", ...auth, client.getMe);

/**
 * @swagger
 * /api/client/me:
 *   put:
 *     tags: [Client]
 *     summary: Actualizar datos personales
 *     description: Solo permite actualizar campos seguros (nombre, foto, teléfono). No se puede cambiar email, role ni estado.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstNames: { type: string }
 *               lastNames:  { type: string }
 *               picture:    { type: string }
 *               telephone:  { type: array }
 *     responses:
 *       200:
 *         description: Perfil actualizado
 */
router.put("/me", ...auth, client.updateMe);

/**
 * @swagger
 * /api/client/me/password:
 *   put:
 *     tags: [Client]
 *     summary: Cambiar contraseña
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *       401:
 *         description: Contraseña actual incorrecta
 */
router.put("/me/password", ...auth, client.changePassword);

/**
 * @swagger
 * /api/client/me/services:
 *   get:
 *     tags: [Client]
 *     summary: Servicios VPN contratados
 *     description: Lista todos los servicios del cliente con estado, plan, fechas y días restantes calculados.
 *     responses:
 *       200:
 *         description: Lista de servicios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/ServiceSnapshot'
 *                       - type: object
 *                         properties:
 *                           dias_restantes: { type: integer }
 *                           service_name:   { type: string }
 */
router.get("/me/services", ...auth, client.getMyServices);

/**
 * @swagger
 * /api/client/me/services/{service_id}/stats:
 *   get:
 *     tags: [Client]
 *     summary: Consumo en tiempo real de un servicio
 *     description: Consulta directamente el panel S-UI para obtener GB usados, restantes y fecha de expiración.
 *     parameters:
 *       - in: path
 *         name: service_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del servicio (del snapshot en services[])
 *     responses:
 *       200:
 *         description: Estadísticas de consumo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     gb_usado:     { type: number }
 *                     gb_total:     { type: number }
 *                     gb_restante:  { type: number }
 *                     expiry_date:  { type: string, format: date-time }
 *                     sub_url:      { type: string }
 *       404:
 *         description: Dispositivo no encontrado o servidor no disponible
 */
router.get("/me/services/:service_id/stats", ...auth, client.getServiceStats);

/**
 * @swagger
 * /api/client/me/services/{service_id}/suspend:
 *   post:
 *     tags: [Client]
 *     summary: Suspender servicio propio (S-UI)
 *     description: El cliente pausa temporalmente su acceso VPN en S-UI. Puede reactivarlo después.
 *     parameters:
 *       - in: path
 *         name: service_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Servicio suspendido
 *       400:
 *         description: El servicio ya está suspendido
 *       404:
 *         description: Servicio no encontrado
 */
router.post("/me/services/:service_id/suspend",    ...auth, client.suspendService);

/**
 * @swagger
 * /api/client/me/services/{service_id}/reactivate:
 *   post:
 *     tags: [Client]
 *     summary: Reactivar servicio suspendido
 *     description: Reactiva el acceso VPN del cliente en S-UI.
 *     parameters:
 *       - in: path
 *         name: service_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Servicio reactivado
 *       400:
 *         description: El servicio no está suspendido
 */
router.post("/me/services/:service_id/reactivate", ...auth, client.reactivateService);

/**
 * @swagger
 * /api/client/me/services/{service_id}/cancel-request:
 *   post:
 *     tags: [Client]
 *     summary: Solicitar cancelación de servicio
 *     description: El cliente envía una solicitud de cancelación. El administrador la procesará. Se registra como nota CRM.
 *     parameters:
 *       - in: path
 *         name: service_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: Motivo de cancelación }
 *     responses:
 *       200:
 *         description: Solicitud registrada
 */
router.post("/me/services/:service_id/cancel-request", ...auth, client.requestCancelService);

/**
 * @swagger
 * /api/client/me/payments:
 *   get:
 *     tags: [Client]
 *     summary: Historial de pagos del cliente
 *     description: Devuelve los últimos 50 pagos del cliente ordenados por fecha descendente.
 *     responses:
 *       200:
 *         description: Lista de pagos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Payment'
 */
router.get("/me/payments", ...auth, client.getMyPayments);

/**
 * @swagger
 * /api/client/me/devices:
 *   get:
 *     tags: [Client]
 *     summary: Dispositivos VPN activos
 *     description: Lista los dispositivos activos del cliente. Para dispositivos S-UI incluye la `sub_url` lista para importar en la app VPN. No expone `sui_config` ni credenciales completas.
 *     responses:
 *       200:
 *         description: Lista de dispositivos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Device'
 */
router.get("/me/devices", ...auth, client.getMyDevices);

module.exports = router;
