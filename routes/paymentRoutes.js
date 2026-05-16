const express = require("express");
const router  = express.Router();
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { hacerpago, editarpago, hacerpagoInicial, getPaymentsFromClient,
        getPaymentsToAdmin, hacerpagoAdmin, confirmPayment, rejectPayment,
        createCryptoInvoice } = require("../controllers/paymentController");
const { uploadFileMiddleware } = require("../middlewares/uploadFileMiddleware");
const { directoryFiles } = require("../services/storageService");

/**
 * @swagger
 * /api/payments/get:
 *   post:
 *     tags: [Payments]
 *     summary: Listar todos los pagos (admin)
 *     description: Devuelve todos los pagos del sistema. Soporta pipeline de MongoDB aggregate para filtros.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aggregate:
 *                 type: array
 *                 description: Etapas adicionales de MongoDB aggregate
 *     responses:
 *       200:
 *         description: Lista de pagos
 */
router.post("/get", verifyToken, checkPermission('payments', 'view'), getPaymentsToAdmin);

/**
 * @swagger
 * /api/payments/hacer-pago:
 *   post:
 *     tags: [Payments]
 *     summary: Registrar pago manual (admin)
 *     description: El admin registra un pago en nombre de un cliente con voucher adjunto.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               voucher:  { type: string, format: binary, description: Imagen del comprobante }
 *               payment:  { type: string, description: JSON con datos del pago }
 *     responses:
 *       200:
 *         description: Pago registrado
 */
router.post("/hacer-pago", verifyToken, checkPermission('payments', 'create'),
  uploadFileMiddleware(directoryFiles.vouchers, "voucher"), hacerpagoAdmin);

/**
 * @swagger
 * /api/payments/confirm:
 *   post:
 *     tags: [Payments]
 *     summary: Confirmar pago pendiente (admin)
 *     description: |
 *       El admin confirma un pago que está en estado "Varificando" o "Pendiente".
 *       - Cambia el estado del pago a "Aceptado"
 *       - Envía email de confirmación al cliente
 *       - Registra la acción en el binnacle
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id]
 *             properties:
 *               payment_id: { type: string }
 *     responses:
 *       200:
 *         description: Pago confirmado y cliente notificado
 *       400:
 *         description: El pago ya estaba confirmado
 *       404:
 *         description: Pago no encontrado
 */
router.post("/confirm", verifyToken, checkPermission('payments', 'update'), confirmPayment);

/**
 * @swagger
 * /api/payments/reject:
 *   post:
 *     tags: [Payments]
 *     summary: Rechazar pago (admin)
 *     description: Cambia el estado del pago a "Devuelto" y notifica al cliente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id]
 *             properties:
 *               payment_id: { type: string }
 *               reason:     { type: string, description: Motivo del rechazo }
 *     responses:
 *       200:
 *         description: Pago rechazado
 */
router.post("/reject", verifyToken, checkPermission('payments', 'update'), rejectPayment);

/**
 * @swagger
 * /api/payments/client/get:
 *   post:
 *     tags: [Payments]
 *     summary: Pagos del cliente autenticado
 *     responses:
 *       200:
 *         description: Lista de pagos del cliente
 */
router.post("/client/get", verifyToken, getPaymentsFromClient);

/**
 * @swagger
 * /api/payments/client/hacer-pago-inicial:
 *   post:
 *     tags: [Payments]
 *     summary: Registrar nuevo pago con comprobante (cliente)
 *     description: |
 *       El cliente sube el comprobante de pago (imagen/PDF). El pago queda en
 *       estado "Varificando" hasta que el admin lo confirme.
 *       Incluye validación del plan, términos y monto.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               voucher:  { type: string, format: binary }
 *               payment:
 *                 type: string
 *                 description: |
 *                   JSON string con:
 *                   - plan: ID del plan
 *                   - bank: ID del método de pago
 *                   - terms: ID de los términos
 *                   - payTo: número de meses
 *                   - total: monto total
 *                   - PersonalData: datos del cliente
 *     responses:
 *       200:
 *         description: Pago enviado a revisión
 */
router.post("/client/hacer-pago",         verifyToken,
  uploadFileMiddleware(directoryFiles.vouchers, "voucher"), hacerpagoInicial);
router.post("/client/hacer-pago-inicial", verifyToken,
  uploadFileMiddleware(directoryFiles.vouchers, "voucher"), hacerpagoInicial);

/**
 * @swagger
 * /api/payments/client/editar-pago:
 *   post:
 *     tags: [Payments]
 *     summary: Editar un pago pendiente (cliente)
 *     description: Permite al cliente actualizar el comprobante de un pago en estado "Varificando".
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payment_id: { type: string }
 *     responses:
 *       200:
 *         description: Pago actualizado
 */
router.post("/client/editar-pago", verifyToken, editarpago);

/**
 * @swagger
 * /api/payments/crypto/create-invoice:
 *   post:
 *     tags: [Payments]
 *     summary: Crear factura en pasarela crypto
 *     description: |
 *       Crea una factura en NOWPayments o CryptoBot para un pago ya registrado.
 *       Devuelve la URL de pago para mostrar al cliente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id, method]
 *             properties:
 *               payment_id:   { type: string }
 *               method:       { type: string, enum: [nowpayments, cryptobot] }
 *               amount_usd:   { type: number }
 *               amount_usdt:  { type: number }
 *               description:  { type: string }
 *     responses:
 *       200:
 *         description: Factura creada con URL de pago
 */
router.post("/crypto/create-invoice", verifyToken, createCryptoInvoice);

module.exports = router;
