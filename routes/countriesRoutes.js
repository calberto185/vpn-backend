const express = require("express");
const router = express.Router();
const { checkRole } = require('../middlewares/verifyRoleMiddleware');
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { getCountries, createCountry, editCountry } = require("../controllers/countryController");

/**
 * @swagger
 * /api/countries:
 *   get:
 *     tags: [Public]
 *     summary: Obtener lista de países
 *     description: >
 *       Retorna todos los países registrados. Con `?isActive=true` filtra solo los activos.
 *       No requiere autenticación. Usado por el frontend público para mostrar países disponibles.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         required: false
 *         description: >
 *           Si es `true`, retorna solo países con `isActive: true`
 *     responses:
 *       200:
 *         description: Lista de países
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
 *                         $ref: '#/components/schemas/Country'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", getCountries);

/**
 * @swagger
 * /api/countries:
 *   post:
 *     tags: [Admin]
 *     summary: Crear un nuevo país
 *     description: Crea un país. Requiere rol `admin`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CountryBody'
 *     responses:
 *       200:
 *         description: País creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: El país ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", verifyToken, checkRole("admin"), createCountry);

/**
 * @swagger
 * /api/countries:
 *   put:
 *     tags: [Admin]
 *     summary: Editar un país existente
 *     description: Actualiza los datos de un país. Requiere rol `admin`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - type: object
 *                 required: [id]
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: ID del país a editar
 *               - $ref: '#/components/schemas/CountryBody'
 *     responses:
 *       200:
 *         description: País actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: País no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/", verifyToken, checkRole("admin"), editCountry);


module.exports = router;