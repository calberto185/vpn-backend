/**
 * crmRoutes.js — CRM básico propio
 * Montadas en: /api/admin/crm — requieren role="admin"
 */
const router = require("express").Router();
const { verifyToken } = require("../middlewares/verifyTokenMiddleware");
const { checkRole }   = require("../middlewares/verifyRoleMiddleware");
const crm             = require("../controllers/crmController");

const auth = [verifyToken, checkRole("admin")];

/**
 * @swagger
 * /api/admin/crm/{id}/notes:
 *   post:
 *     tags: [CRM]
 *     summary: Agregar nota interna sobre un cliente
 *     description: Las notas son visibles solo para admins. Se registra quién creó la nota y cuándo.
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
 *             required: [text]
 *             properties:
 *               text: { type: string, minLength: 1 }
 *     responses:
 *       201:
 *         description: Nota creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/CRMNote'
 */
router.post("/:id/notes", ...auth, crm.addNote);

/**
 * @swagger
 * /api/admin/crm/{id}/notes/{noteId}:
 *   delete:
 *     tags: [CRM]
 *     summary: Eliminar una nota
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Nota eliminada
 */
router.delete("/:id/notes/:noteId", ...auth, crm.deleteNote);

/**
 * @swagger
 * /api/admin/crm/{id}/tags:
 *   post:
 *     tags: [CRM]
 *     summary: Agregar un tag al cliente
 *     description: Usa $addToSet — no crea duplicados. Los tags se guardan en minúsculas.
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
 *             required: [tag]
 *             properties:
 *               tag:
 *                 type: string
 *                 description: Etiqueta (ej. "vip", "rusia", "latam", "moroso")
 *     responses:
 *       200:
 *         description: Tag agregado
 */
router.post("/:id/tags", ...auth, crm.addTag);

/**
 * @swagger
 * /api/admin/crm/{id}/tags:
 *   put:
 *     tags: [CRM]
 *     summary: Reemplazar todos los tags del cliente
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
 *             required: [tags]
 *             properties:
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["vip", "rusia"]
 *     responses:
 *       200:
 *         description: Tags actualizados
 */
router.put("/:id/tags", ...auth, crm.setTags);

/**
 * @swagger
 * /api/admin/crm/{id}/tags/{tag}:
 *   delete:
 *     tags: [CRM]
 *     summary: Quitar un tag específico
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tag eliminado
 */
router.delete("/:id/tags/:tag", ...auth, crm.removeTag);

/**
 * @swagger
 * /api/admin/crm/{id}/pipeline:
 *   put:
 *     tags: [CRM]
 *     summary: Cambiar etapa del pipeline de ventas
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
 *             required: [stage]
 *             properties:
 *               stage:
 *                 $ref: '#/components/schemas/PipelineStage'
 *     responses:
 *       200:
 *         description: Stage actualizado
 *       400:
 *         description: Stage inválido
 */
router.put("/:id/pipeline", ...auth, crm.setPipelineStage);

/**
 * @swagger
 * /api/admin/crm/pipeline/board:
 *   get:
 *     tags: [CRM]
 *     summary: Vista kanban del pipeline
 *     description: |
 *       Devuelve todos los clientes agrupados por `pipeline_stage`.
 *       Útil para el panel kanban del panel admin Angular.
 *
 *       Stages: `lead` → `contactado` → `activo` → `riesgo` → `inactivo`
 *     responses:
 *       200:
 *         description: Board del pipeline
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     board:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/ClientProfile'
 *                     stages:
 *                       type: array
 *                       items:
 *                         type: string
 *                     total: { type: integer }
 */
router.get("/pipeline/board", ...auth, crm.getPipelineBoard);

/**
 * @swagger
 * /api/admin/crm/tags/list:
 *   get:
 *     tags: [CRM]
 *     summary: Lista de todos los tags usados
 *     description: Devuelve cada tag con el número de clientes que lo tienen, ordenado por frecuencia.
 *     responses:
 *       200:
 *         description: Tags con conteo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tag:   { type: string }
 *                       count: { type: integer }
 */
router.get("/tags/list", ...auth, crm.getTagsList);

/**
 * @swagger
 * /api/admin/crm/tags/{tag}/clients:
 *   get:
 *     tags: [CRM]
 *     summary: Clientes con un tag específico
 *     parameters:
 *       - in: path
 *         name: tag
 *         required: true
 *         schema:
 *           type: string
 *         description: El tag a buscar (case-insensitive)
 *     responses:
 *       200:
 *         description: Lista de clientes con ese tag
 */
router.get("/tags/:tag/clients", ...auth, crm.getClientsByTag);

module.exports = router;
