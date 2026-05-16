/**
 * webhookRoutes.js — Webhooks de pasarelas de pago externas
 * Montadas en: /api/webhooks — SIN verifyToken
 * Seguridad: firma/hash dentro de cada controller
 */
const express  = require("express");
const router   = express.Router();
const webhooks = require("../controllers/webhookController");

/**
 * @swagger
 * /api/webhooks/stripe:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de Stripe
 *     description: |
 *       Recibe eventos de Stripe. Procesa `payment_intent.succeeded`.
 *       **Verificación:** firma HMAC en header `Stripe-Signature` usando `STRIPE_WEBHOOK_SECRET`.
 *
 *       Al confirmar pago activa el servicio VPN automáticamente:
 *       `payment_intent.metadata` debe incluir `payment_id`, `user_id`, `plan_id`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Evento de Stripe (body crudo requerido para verificación de firma)
 *     responses:
 *       200:
 *         description: Evento recibido
 *       400:
 *         description: Firma inválida
 */
router.post("/stripe",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
      req.body    = JSON.parse(req.body.toString());
    }
    next();
  },
  webhooks.stripeWebhook
);

/**
 * @swagger
 * /api/webhooks/yoomoney:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de YooMoney
 *     description: |
 *       Recibe notificaciones HTTP de YooMoney (form-urlencoded).
 *       **Verificación:** SHA1 del string `notification_type&operation_id&amount&currency&datetime&sender&codepro&secret&label`.
 *
 *       El `label` debe coincidir con el identificador del pago en MongoDB.
 *       Siempre responde `200 OK` para evitar reintentos de YooMoney.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               notification_type: { type: string }
 *               operation_id:      { type: string }
 *               amount:            { type: string }
 *               currency:          { type: string }
 *               datetime:          { type: string }
 *               sender:            { type: string }
 *               label:             { type: string, description: Identificador del pago }
 *               sha1_hash:         { type: string }
 *     responses:
 *       200:
 *         description: OK (siempre, para evitar reintentos)
 */
router.post("/yoomoney",
  express.urlencoded({ extended: false }),
  webhooks.yoomoneyWebhook
);

/**
 * @swagger
 * /api/webhooks/tbank:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de T-Bank / SBP
 *     description: |
 *       Recibe notificaciones de T-Bank. Procesa estado `CONFIRMED`.
 *       **Verificación:** token en header `X-TBank-Token` o campo `Token` en el body.
 *     security: []
 *     responses:
 *       200:
 *         description: OK
 *       403:
 *         description: Token inválido
 */
router.post("/tbank", webhooks.tbankWebhook);

/**
 * @swagger
 * /api/webhooks/nowpayments:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de NOWPayments
 *     description: |
 *       Recibe IPN de NOWPayments para pagos crypto automáticos (BTC, ETH, USDT, TON, LTC...).
 *       **Verificación:** HMAC-SHA512 en header `X-NOWPayments-Sig`.
 *
 *       Procesa estado `finished` o `confirmed`.
 *     security: []
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/nowpayments", webhooks.nowpaymentsWebhook);

/**
 * @swagger
 * /api/webhooks/cryptobot:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de CryptoBot (Telegram)
 *     description: |
 *       Recibe notificaciones de @CryptoBot — muy popular en Rusia/CIS.
 *       Soporta USDT, BTC, TON, ETH.
 *       **Verificación:** header `Crypto-Pay-Api-Token`.
 *     security: []
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/cryptobot", webhooks.cryptobotWebhook);

/**
 * @swagger
 * /api/webhooks/binance:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de Binance Pay
 *     description: |
 *       Recibe notificaciones de Binance Pay Merchant.
 *       **Verificación:** HMAC-SHA512 con timestamp y nonce.
 *       Responde `{"returnCode":"SUCCESS"}` como requiere Binance.
 *     security: []
 *     responses:
 *       200:
 *         description: '{"returnCode":"SUCCESS","returnMessage":null}'
 */
router.post("/binance", webhooks.binanceWebhook);

/**
 * @swagger
 * /api/webhooks/bybit:
 *   post:
 *     tags: [Webhooks]
 *     summary: Webhook de Bybit Pay
 *     description: |
 *       Recibe notificaciones de Bybit Pay.
 *       **Verificación:** HMAC-SHA256 con timestamp y API key.
 *       Procesa estado `PAID`.
 *     security: []
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/bybit", webhooks.bybitPayWebhook);

module.exports = router;
