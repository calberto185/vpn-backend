/**
 * adminRoutes.js — Panel de administración
 * Montadas en: /api/admin — requieren role="admin"
 */
const router = require("express").Router();
const { checkRole }   = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { validate, schemas } = require("../middlewares/validate.middleware");
const admin = require('../controllers/adminController');

const auth = [verifyToken, checkRole("admin")];

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Estadísticas globales del dashboard
 *     description: |
 *       Devuelve métricas en tiempo real:
 *       - Total de clientes por estado
 *       - Pagos pendientes de revisión
 *       - Dispositivos activos
 *       - Clientes que vencen en 7 días
 *       - Servidores activos
 *     responses:
 *       200:
 *         description: Estadísticas del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     clientes:
 *                       type: object
 *                       properties:
 *                         total:       { type: integer }
 *                         activos:     { type: integer }
 *                         suspendidos: { type: integer }
 *                         pendientes:  { type: integer }
 *                     pagos:
 *                       type: object
 *                       properties:
 *                         pendientes: { type: integer }
 *                     devices:
 *                       type: object
 *                       properties:
 *                         activos: { type: integer }
 *                     vencen_7d:  { type: integer }
 *                     servidores:
 *                       type: object
 *                       properties:
 *                         activos: { type: integer }
 */
router.get("/stats", ...auth, admin.getStats);

/**
 * @swagger
 * /api/admin/clients:
 *   post:
 *     tags: [Admin]
 *     summary: Listar clientes con filtros
 *     description: Soporta pipeline de agregación de MongoDB para filtros avanzados. Nunca devuelve contraseñas.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aggregate:
 *                 type: array
 *                 description: Etapas adicionales de MongoDB aggregate (opcional)
 *                 example: [{"$match": {"state": "Activo"}}]
 *     responses:
 *       200:
 *         description: Lista de clientes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ClientProfile'
 */
router.post("/clients", ...auth, admin.getClients);

/**
 * @swagger
 * /api/admin/clients/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Detalle de un cliente
 *     description: Devuelve el perfil completo del cliente más sus últimos 10 pagos y todos sus dispositivos.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID del cliente
 *     responses:
 *       200:
 *         description: Perfil completo con devices y pagos recientes
 *       404:
 *         description: Cliente no encontrado
 */
router.get("/clients/:id", ...auth, admin.getClient);

/**
 * @swagger
 * /api/admin/clients/register:
 *   post:
 *     tags: [Admin]
 *     summary: Crear cliente desde el panel
 *     description: El admin crea un cliente directamente. La cuenta queda verificada y activa desde el inicio (sin pasar por el proceso de registro público).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstNames, lastNames, email, password]
 *             properties:
 *               firstNames: { type: string }
 *               lastNames:  { type: string }
 *               email:      { type: string, format: email }
 *               password:   { type: string }
 *               country:    { type: object }
 *               dni:        { type: string }
 *               telephone:  { type: array }
 *     responses:
 *       201:
 *         description: Cliente creado
 *       409:
 *         description: Email ya registrado
 */
router.post("/clients/register", ...auth, validate(schemas.registerClient), admin.registerClient);

/**
 * @swagger
 * /api/admin/clients/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Editar cliente
 *     description: El admin puede editar cualquier campo del cliente. Si se incluye `password` en claro, se encripta automáticamente. Los campos `isAdmin` y `_id` se ignoran siempre.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientProfile'
 *     responses:
 *       200:
 *         description: Cliente actualizado
 */
router.put("/clients/:id", ...auth, admin.editClient);

/**
 * @swagger
 * /api/admin/clients/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Dar de baja (soft-delete)
 *     description: No elimina el registro. Marca al cliente como `bloqued=true` y `state="Bloqueado"`. El cliente no puede volver a iniciar sesión.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cliente bloqueado
 */
router.delete("/clients/:id", ...auth, admin.deleteClient);

/**
 * @swagger
 * /api/admin/clients/{id}/verify:
 *   post:
 *     tags: [Admin]
 *     summary: Verificar cuenta de cliente
 *     description: |
 *       Activa el acceso del cliente (pasa de "Pendiente" a "Activo").
 *       - Establece `verified=true` y `state="Activo"`
 *       - Envía email de bienvenida al cliente
 *       - Registra la acción en el binnacle de auditoría
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cuenta verificada (o ya estaba verificada). Cliente notificado por email si era nuevo.
 */
router.post("/clients/:id/verify", ...auth, admin.verifyClient);

/**
 * @swagger
 * /api/admin/clients/{id}/suspend:
 *   post:
 *     tags: [Admin]
 *     summary: Suspender cliente
 *     description: Marca al cliente como suspendido. El cliente no puede iniciar sesión. Sus dispositivos S-UI siguen activos hasta que el cron job los suspenda.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: Motivo de la suspensión }
 *     responses:
 *       200:
 *         description: Cliente suspendido
 */
router.post("/clients/:id/suspend", ...auth, admin.suspendClient);

/**
 * @swagger
 * /api/admin/clients/{id}/reactivate:
 *   post:
 *     tags: [Admin]
 *     summary: Reactivar cliente
 *     description: Reactiva un cliente suspendido o bloqueado. Vuelve a `state="Activo"`, `suspend=false`, `bloqued=false`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cliente reactivado
 */
router.post("/clients/:id/reactivate", ...auth, admin.reactivateClient);

/**
 * @swagger
 * /api/admin/clients/{id}/services:
 *   post:
 *     tags: [Admin]
 *     summary: Asignar servicios al cliente
 *     description: Añade servicios al array `services[]` del cliente. Ignora duplicados (por service_id).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [services]
 *             properties:
 *               services:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ServiceSnapshot'
 *     responses:
 *       200:
 *         description: Servicios asignados
 *       409:
 *         description: Todos los servicios ya existían
 */
router.post("/clients/:id/services", ...auth, admin.updateServices);

// Búsqueda global del panel admin
router.get("/search",                 ...auth, admin.globalSearch);

// Rutas legacy para compatibilidad con código anterior
router.post("/consulta",              ...auth, admin.getClients);
router.post("/registrar",             ...auth, admin.registerClient);
router.post("/editar",                ...auth, admin.editClient);
router.post("/eliminar",              ...auth, admin.deleteClient);
router.post("/clients/update_services", ...auth, admin.updateServices);

module.exports = router;
