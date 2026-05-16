/**
 * suiRoutes.js — Gestión del panel S-UI multi-servidor
 * Montadas en: /api/sui — requieren role="admin"
 */
const express = require('express');
const router  = express.Router();
const { verifyToken }     = require('../../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../../middlewares/checkPermissionMiddleware');
const ctrl = require('../../controllers/sui/suiController');

const view   = [verifyToken, checkPermission('systems', 'view')];
const create = [verifyToken, checkPermission('systems', 'create')];
const update = [verifyToken, checkPermission('systems', 'update')];
const del    = [verifyToken, checkPermission('systems', 'delete')];

/**
 * @swagger
 * /api/sui/pool/refresh:
 *   post:
 *     tags: [S-UI]
 *     summary: Recargar pool de servidores S-UI
 *     description: |
 *       Recarga el pool de conexiones S-UI desde MongoDB.
 *       Añade servidores nuevos, elimina los inactivos.
 *       Llamar después de agregar/modificar un servidor en `/api/servers`.
 *     responses:
 *       200:
 *         description: Pool actualizado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok:    { type: boolean }
 *                     count: { type: integer, description: Número de servidores en el pool }
 */
router.post('/pool/refresh', ...update, ctrl.refreshPool);

/**
 * @swagger
 * /api/sui/pool/status:
 *   get:
 *     tags: [S-UI]
 *     summary: Estado del pool de servidores
 *     description: Lista qué servidores S-UI están cargados en el pool actualmente.
 *     responses:
 *       200:
 *         description: Estado del pool
 */
router.get('/pool/status', ...view, ctrl.poolStatus);

/**
 * @swagger
 * /api/sui/clientes/listar:
 *   post:
 *     tags: [S-UI]
 *     summary: Listar clientes de un servidor S-UI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId]
 *             properties:
 *               serverId: { type: string }
 *     responses:
 *       200:
 *         description: Lista de clientes del panel S-UI
 */
router.post('/clientes/listar', ...view, ctrl.listarClientes);

/**
 * @swagger
 * /api/sui/clientes/todos:
 *   post:
 *     tags: [S-UI]
 *     summary: Listar clientes de TODOS los servidores
 *     description: Ejecuta `listarClientes` en todos los servidores del pool en paralelo.
 *     responses:
 *       200:
 *         description: Clientes de todos los servidores
 */
router.post('/clientes/todos', ...view, ctrl.listarClientesTodos);

/**
 * @swagger
 * /api/sui/clientes/stats:
 *   post:
 *     tags: [S-UI]
 *     summary: Estadísticas de consumo de un cliente S-UI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId, email]
 *             properties:
 *               serverId: { type: string }
 *               email:    { type: string, description: Email VPN del cliente en S-UI }
 *     responses:
 *       200:
 *         description: Estadísticas de consumo
 */
router.post('/clientes/stats', ...view, ctrl.statsCliente);

/**
 * @swagger
 * /api/sui/clientes/crear:
 *   post:
 *     tags: [S-UI]
 *     summary: Crear cliente en un servidor S-UI
 *     description: |
 *       Crea el cliente en el panel S-UI y opcionalmente registra el DeviceEntity en MongoDB.
 *       Genera automáticamente la configuración VLESS/Hysteria2.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId, email, gbLimite, dias]
 *             properties:
 *               serverId:     { type: string }
 *               email:        { type: string, description: Identificador único en S-UI }
 *               gbLimite:     { type: integer, description: Límite de tráfico en GB }
 *               dias:         { type: integer, description: Días de validez }
 *               dispositivos: { type: integer, default: 1 }
 *               desc:         { type: string, description: Descripción (nombre del cliente) }
 *               userId:       { type: string, description: UUID del cliente en MongoDB (opcional) }
 *               serviceId:    { type: string }
 *               planId:       { type: string }
 *     responses:
 *       200:
 *         description: Cliente creado con sub_url y configuración generada
 */
router.post('/clientes/crear', ...create, ctrl.crearCliente);

/**
 * @swagger
 * /api/sui/clientes/renovar:
 *   post:
 *     tags: [S-UI]
 *     summary: Renovar cliente en S-UI
 *     description: Extiende la fecha de expiración y resetea el límite de tráfico.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId, clientId, gbLimite, dias]
 *             properties:
 *               serverId:  { type: string }
 *               clientId:  { type: string, description: UUID del cliente en S-UI }
 *               gbLimite:  { type: integer }
 *               dias:      { type: integer }
 *               xuiConfig: { type: object, description: Configuración guardada (opcional) }
 *     responses:
 *       200:
 *         description: Cliente renovado
 */
router.post('/clientes/renovar', ...update, ctrl.renovarCliente);

/**
 * @swagger
 * /api/sui/clientes/suspender:
 *   post:
 *     tags: [S-UI]
 *     summary: Suspender cliente en S-UI
 *     description: Deshabilita el cliente en el panel S-UI (disable=true). Actualiza el device en MongoDB.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId, clientId]
 *             properties:
 *               serverId:  { type: string }
 *               clientId:  { type: string }
 *               xuiConfig: { type: object }
 *     responses:
 *       200:
 *         description: Cliente suspendido
 */
router.post('/clientes/suspender', ...update, ctrl.suspenderCliente);

/**
 * @swagger
 * /api/sui/clientes/reactivar:
 *   post:
 *     tags: [S-UI]
 *     summary: Reactivar cliente en S-UI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId, clientId]
 *             properties:
 *               serverId:  { type: string }
 *               clientId:  { type: string }
 *               xuiConfig: { type: object }
 *     responses:
 *       200:
 *         description: Cliente reactivado
 */
router.post('/clientes/reactivar', ...update, ctrl.reactivarCliente);

/**
 * @swagger
 * /api/sui/clientes/eliminar:
 *   post:
 *     tags: [S-UI]
 *     summary: Eliminar cliente de S-UI
 *     description: Elimina el cliente del panel S-UI y marca el device como `revoked=true` en MongoDB.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serverId, clientId]
 *             properties:
 *               serverId:  { type: string }
 *               clientId:  { type: string }
 *               xuiConfig: { type: object }
 *     responses:
 *       200:
 *         description: Cliente eliminado
 */
router.post('/clientes/eliminar', ...del, ctrl.eliminarCliente);

/**
 * @swagger
 * /api/sui/sincronizar:
 *   post:
 *     tags: [S-UI]
 *     summary: Sincronizar S-UI con MongoDB
 *     description: |
 *       Detecta clientes que existen en el panel S-UI pero no tienen registro
 *       en la colección `devices` de MongoDB (huérfanos).
 *       Útil para detectar desincronizaciones y clientes creados directamente en el panel.
 *     responses:
 *       200:
 *         description: Resultados de sincronización por servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, description: Total de huérfanos detectados }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       serverId:  { type: string }
 *                       total:     { type: integer }
 *                       huerfanos: { type: array }
 */
router.post('/sincronizar', ...update, ctrl.sincronizar);

module.exports = router;
