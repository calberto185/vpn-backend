/**
 * cryptoRoutes.js — Pagos con criptomonedas
 * Montadas en: /api/crypto
 */
const router = require("express").Router();
const { verifyToken } = require("../middlewares/verifyTokenMiddleware");
const { validate, schemas } = require("../middlewares/validate.middleware");
const ctrl = require("../controllers/cryptoPaymentController");

/**
 * @swagger
 * /api/crypto/methods:
 *   get:
 *     tags: [Crypto]
 *     summary: Métodos de pago crypto disponibles
 *     description: |
 *       Lista todos los métodos crypto activos y visibles para el checkout.
 *       Tipos soportados: `crypto_usdt_trc20`, `crypto_usdt_erc20`, `crypto_usdt_bep20`,
 *       `crypto_btc`, `crypto_eth`, `crypto_ton`, `crypto_usdc`, `binance_pay`, `bybit_pay`
 *     security: []
 *     responses:
 *       200:
 *         description: Lista de métodos de pago crypto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CryptoMethod'
 */
router.get("/methods", ctrl.getCryptoMethods);

/**
 * @swagger
 * /api/crypto/address/{methodId}:
 *   get:
 *     tags: [Crypto]
 *     summary: Dirección de wallet para un método específico
 *     description: Devuelve la dirección completa, red, QR code y monto mínimo para realizar el pago.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: methodId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del método de pago crypto
 *     responses:
 *       200:
 *         description: Datos de la wallet
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CryptoMethod'
 *                 - type: object
 *                   properties:
 *                     note: { type: string }
 *       404:
 *         description: Método no encontrado o inactivo
 */
router.get("/address/:methodId", ctrl.getWalletAddress);

/**
 * @swagger
 * /api/crypto/payment/register:
 *   post:
 *     tags: [Crypto]
 *     summary: Registrar pago crypto manual con TX hash
 *     description: |
 *       El cliente registra un pago crypto proporcionando el hash de la transacción
 *       como comprobante. El pago queda en "Varificando" hasta que el admin lo confirme
 *       o el sistema lo detecte automáticamente.
 *
 *       **Validaciones:**
 *       - TX hash no puede estar duplicado
 *       - No puede haber otro pago pendiente activo
 *       - Monto mínimo según el método seleccionado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [methodId, planId, amount, txHash]
 *             properties:
 *               methodId:  { type: string, description: ID del método crypto }
 *               planId:    { type: string, description: ID del plan a contratar }
 *               amount:    { type: number, description: Monto enviado }
 *               txHash:    { type: string, description: Hash de la transacción en blockchain }
 *               network:   { type: string, description: Red usada (opcional si no está en el método) }
 *     responses:
 *       201:
 *         description: Pago registrado en verificación (24-48h)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment_id: { type: string }
 *       409:
 *         description: TX hash duplicado o pago pendiente activo
 */
router.post("/payment/register", verifyToken, validate(schemas.registerCrypto), ctrl.registerCryptoPayment);

/**
 * @swagger
 * /api/crypto/binance/order:
 *   post:
 *     tags: [Crypto]
 *     summary: Crear orden de pago en Binance Pay
 *     description: |
 *       Genera una orden de pago en Binance Pay. Devuelve QR code y deep link
 *       para que el cliente pague desde su app de Binance.
 *       La confirmación es automática vía webhook `/api/webhooks/binance`.
 *
 *       Requiere `BINANCE_PAY_API_KEY` y `BINANCE_PAY_SECRET` en .env.
 *       Si no están configurados devuelve `503` sugiriendo usar USDT manual.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId: { type: string }
 *     responses:
 *       200:
 *         description: Orden creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment_id:    { type: string }
 *                     qrcode_url:    { type: string }
 *                     universal_url: { type: string }
 *                     deep_link:     { type: string }
 *                     expires_at:    { type: string, format: date-time }
 *       503:
 *         description: Binance Pay no configurado
 */
router.post("/binance/order", verifyToken, validate(schemas.createBinanceOrder), ctrl.createBinanceOrder);

/**
 * @swagger
 * /api/crypto/bybit/order:
 *   post:
 *     tags: [Crypto]
 *     summary: Crear orden de pago en Bybit Pay
 *     description: |
 *       Genera una orden de pago en Bybit Pay con QR code.
 *       La confirmación es automática vía webhook `/api/webhooks/bybit`.
 *
 *       Requiere `BYBIT_PAY_API_KEY` y `BYBIT_PAY_SECRET` en .env.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId: { type: string }
 *     responses:
 *       200:
 *         description: Orden creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment_id:  { type: string }
 *                     qrcode_url:  { type: string }
 *                     pay_url:     { type: string }
 *                     expires_at:  { type: string, format: date-time }
 *       503:
 *         description: Bybit Pay no configurado
 */
router.post("/bybit/order", verifyToken, validate(schemas.createBybitOrder), ctrl.createBybitOrder);

module.exports = router;
