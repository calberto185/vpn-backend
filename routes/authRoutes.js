const express = require("express");
const router  = express.Router();
const { login, refreshToken, logout, recoverPassword, signup, loginGoogle, signupGoogle, meProfile } = require('../controllers/authController');
const { verifyToken }  = require('../middlewares/verifyTokenMiddleware');
const { checkReCapcha } = require('../middlewares/verifyRecapcha');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión con email y contraseña
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *     responses:
 *       200:
 *         description: Sesión iniciada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", checkReCapcha, login);

/**
 * @swagger
 * /api/auth/login/google:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión con Google OAuth
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jwt]
 *             properties:
 *               jwt:
 *                 type: string
 *                 description: ID Token obtenido de Google Sign-In
 *     responses:
 *       200:
 *         description: Sesión iniciada con Google
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/LoginResponse'
 */
router.post("/login/google", loginGoogle);

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Registrar nuevo cliente
 *     description: Crea una cuenta nueva con estado "Pendiente". El admin debe verificarla antes de que el cliente pueda iniciar sesión.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupBody'
 *     responses:
 *       200:
 *         description: Cuenta creada. Pendiente de verificación por el admin.
 *       400:
 *         description: Email ya registrado
 */
router.post("/signup", checkReCapcha, signup);

/**
 * @swagger
 * /api/auth/signup/google:
 *   post:
 *     tags: [Auth]
 *     summary: Registro con Google (auto-verificado)
 *     description: Si el usuario no existe se crea automáticamente con estado Activo. Si ya existe, hace login.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jwt]
 *             properties:
 *               jwt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registrado y autenticado
 */
router.post("/signup/google", signupGoogle);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Renovar access token
 *     description: Usa el refresh token almacenado en cookie `refresh_token` para obtener un nuevo access token.
 *     security: []
 *     responses:
 *       200:
 *         description: Nuevo access token generado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token: { type: string }
 *       403:
 *         description: Refresh token inválido o expirado
 */
router.post("/refresh", refreshToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión
 *     description: Invalida el refresh token y borra la cookie de sesión.
 *     responses:
 *       200:
 *         description: Sesión cerrada
 */
router.post("/logout", logout);

/**
 * @swagger
 * /api/auth/recover-password:
 *   post:
 *     tags: [Auth]
 *     summary: Recuperar contraseña
 *     description: Genera una contraseña temporal y la envía por email. Siempre responde igual para no revelar si el email existe.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Email enviado (si existe la cuenta)
 */
router.post("/recover-password", checkReCapcha, recoverPassword);

/**
 * @swagger
 * /api/auth/profile/me:
 *   post:
 *     tags: [Auth]
 *     summary: Obtener perfil del usuario autenticado
 *     responses:
 *       200:
 *         description: Datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ClientProfile'
 */
router.post("/profile/me", verifyToken, meProfile);

module.exports = router;
