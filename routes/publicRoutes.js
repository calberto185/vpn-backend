const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { get } = require("../controllers/publicController");
const { checkPlan } = require("../middlewares/verifyPlanMiddleware");

/**
 * @swagger
 * /api/public/plans:
 *   get:
 *     tags: [Public]
 *     summary: Obtener planes públicos para el dashboard
 *     description: >
 *       Retorna todos los planes con `global: true`, `active: true` y `visible: true`.
 *       No requiere autenticación. Usado por el frontend público para mostrar los planes disponibles.
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de planes públicos
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PublicPlan'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/plans", get);

module.exports = router;