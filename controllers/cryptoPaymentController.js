/**
 * cryptoPaymentController.js — Pagos con criptomonedas
 *
 * Flujo para pagos manuales (con comprobante):
 *   1. Cliente solicita dirección de wallet  → GET /api/crypto/address/:methodId
 *   2. Cliente realiza la transferencia off-chain
 *   3. Cliente sube TX hash como comprobante → POST /api/crypto/verify
 *   4. Admin confirma o el webhook lo hace automáticamente
 *
 * Flujo para Binance Pay / Bybit Pay (automático):
 *   1. Backend genera orden de pago          → POST /api/crypto/binance/order
 *   2. Usuario paga en su app de Binance/Bybit
 *   3. Webhook confirma automáticamente      → POST /api/webhooks/binance
 *                                            → POST /api/webhooks/bybit
 *
 * Tipos soportados:
 *   crypto_usdt_trc20, crypto_usdt_erc20, crypto_usdt_bep20
 *   crypto_btc, crypto_eth, crypto_ton, crypto_usdc
 *   binance_pay, bybit_pay
 */

const { v4: uuidv4 }             = require("uuid");
const crypto                     = require("crypto");
const { getDB, nameCollections } = require("../services/dbServices");
const { sendMail }               = require("../shared/mailer");

// ─── Tipos de cripto reconocidos ──────────────────────────────────────────────
const CRYPTO_TYPES = [
  "crypto_usdt_trc20", "crypto_usdt_erc20", "crypto_usdt_bep20",
  "crypto_btc", "crypto_eth", "crypto_ton", "crypto_usdc",
  "binance_pay", "bybit_pay",
];

const CRYPTO_LABELS = {
  crypto_usdt_trc20: "USDT TRC-20 (Tron)",
  crypto_usdt_erc20: "USDT ERC-20 (Ethereum)",
  crypto_usdt_bep20: "USDT BEP-20 (BSC)",
  crypto_btc:        "Bitcoin (BTC)",
  crypto_eth:        "Ethereum (ETH)",
  crypto_ton:        "TON",
  crypto_usdc:       "USDC",
  binance_pay:       "Binance Pay",
  bybit_pay:         "Bybit Pay",
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/crypto/methods
// Lista los métodos cripto activos y visibles para el cliente
// ═══════════════════════════════════════════════════════════════════════════════
async function getCryptoMethods(req, res) {
  try {
    const db      = getDB();
    const methods = await db.collection(nameCollections.bankAccount)
      .find({
        active:  true,
        visible: true,
        typeAccount: { $in: CRYPTO_TYPES },
      })
      .project({ number: 1, name: 1, typeAccount: 1, network: 1,
                 currency: 1, qr_code: 1, min_amount: 1, note: 1, id: 1 })
      .toArray();

    return res.status(200).json({ code: "consultado", data: methods });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/crypto/address/:methodId
// Devuelve la dirección de wallet para un método específico
// ═══════════════════════════════════════════════════════════════════════════════
async function getWalletAddress(req, res) {
  try {
    const db     = getDB();
    const method = await db.collection(nameCollections.bankAccount)
      .findOne({ id: req.params.methodId, active: true });

    if (!method || !CRYPTO_TYPES.includes(method.typeAccount)) {
      return res.status(404).json({ code: "no_encontrado", message: "Método no encontrado" });
    }

    return res.status(200).json({
      code: "consultado",
      data: {
        id:          method.id,
        name:        method.name,
        typeAccount: method.typeAccount,
        label:       CRYPTO_LABELS[method.typeAccount] || method.name,
        address:     method.number,   // wallet address o Pay ID
        network:     method.network,
        currency:    method.currency,
        qr_code:     method.qr_code,
        min_amount:  method.min_amount,
        note:        method.note,
      },
    });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/crypto/payment/register
// Cliente registra un pago cripto manual (con TX hash como comprobante)
// body: { methodId, planId, amount, txHash, network?, screenshot? }
// ═══════════════════════════════════════════════════════════════════════════════
async function registerCryptoPayment(req, res) {
  try {
    const { methodId, planId, amount, txHash, network } = req.body;
    if (!methodId || !planId || !amount || !txHash) {
      return res.status(400).json({
        code: "faltan_datos",
        message: "methodId, planId, amount y txHash son requeridos",
      });
    }

    const db     = getDB();
    const method = await db.collection(nameCollections.bankAccount)
      .findOne({ id: methodId, active: true });
    if (!method) return res.status(404).json({ code: "metodo_no_encontrado" });

    const plan = await db.collection(nameCollections.plans)
      .findOne({ id: planId, active: true });
    if (!plan)   return res.status(404).json({ code: "plan_no_encontrado" });

    // Verificar que no haya un pago pendiente activo
    const pagoExistente = await db.collection(nameCollections.payments).findOne({
      user_id: req.user.id,
      state:   { $in: ["Varificando", "Pendiente"] },
    });
    if (pagoExistente) {
      return res.status(409).json({
        code: "pago_pendiente",
        message: "Ya tienes un pago en proceso. Espera a que sea confirmado.",
      });
    }

    // Verificar que el TX hash no esté duplicado
    const txExistente = await db.collection(nameCollections.payments).findOne({
      crypto_tx_hash: txHash,
    });
    if (txExistente) {
      return res.status(409).json({
        code: "tx_duplicado",
        message: "Este TX hash ya fue registrado anteriormente",
      });
    }

    const user = await db.collection(nameCollections.admin).findOne({ id: req.user.id });

    const pago = {
      id:              uuidv4(),
      user_id:         req.user.id,
      user_name:       `${user?.firstNames || ""} ${user?.lastNames || ""}`.trim(),
      user_email:      user?.email || "",
      plan:            {
        plan_id:     plan.id,
        service_id:  plan.service?.id || "",
        title_name:  plan.title_name,
        price:       plan.price,
        currencySymbol: plan.currencySymbol || "USD",
      },
      amount:          Number(amount),
      method:          "crypto",
      methodPay: {
        id:          method.id,
        name:        method.name,
        number:      method.number,
        typeAccount: method.typeAccount,
        cardAccount: method.typeAccount,
        network:     method.network || network || "",
        currency:    method.currency || "",
      },
      // Campos específicos de cripto
      crypto_tx_hash:  txHash,
      crypto_network:  method.network || network || "",
      crypto_currency: method.currency || "",
      crypto_address:  method.number,
      //
      picture:    txHash,   // el tx hash es el "comprobante"
      state:      "Varificando",
      states:     [{ state: "Varificando", createdAt: new Date() }],
      note:       `Pago cripto ${CRYPTO_LABELS[method.typeAccount] || method.typeAccount}`,
      period:     "1",
      kind:       "mes",
      isPrePay:   false,
      createdAt:  new Date(),
    };

    await db.collection(nameCollections.payments).insertOne(pago);

    // Notificar al admin
    try {
      const adminEmail = process.env.ROOT_USER;
      if (adminEmail) {
        await sendMail(
          adminEmail,
          "Nuevo pago cripto para verificar",
          `Cliente: ${pago.user_name}\nPlan: ${plan.title_name}\nMonto: ${amount} ${method.currency}\nRed: ${method.network}\nTX Hash: ${txHash}\n\nVerifica en el panel de pagos.`
        );
      }
    } catch {}

    return res.status(201).json({
      code:    "pago_registrado",
      message: "✅ Pago registrado, en proceso de verificación (24-48h)",
      data: { payment_id: pago.id },
    });
  } catch (e) {
    console.error("cryptoPayment.registerCryptoPayment:", e);
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/crypto/binance/order
// Genera una orden de pago en Binance Pay
// body: { planId }
// ═══════════════════════════════════════════════════════════════════════════════
async function createBinanceOrder(req, res) {
  try {
    const apiKey    = process.env.BINANCE_PAY_API_KEY;
    const apiSecret = process.env.BINANCE_PAY_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(503).json({
        code: "no_configurado",
        message: "Binance Pay no está configurado. Usa pago manual con USDT.",
      });
    }

    const { planId } = req.body;
    const db   = getDB();
    const plan = await db.collection(nameCollections.plans).findOne({ id: planId, active: true });
    if (!plan) return res.status(404).json({ code: "plan_no_encontrado" });

    const user  = await db.collection(nameCollections.admin).findOne({ id: req.user.id });
    const nonce = uuidv4().replace(/-/g, "").slice(0, 32);
    const ts    = Date.now();

    // Binance Pay API v2
    const payload = {
      env:            { terminalType: "WEB" },
      merchantTradeNo: nonce,
      orderAmount:    String(Number(plan.price).toFixed(2)),
      currency:       plan.currencyCode || "USDT",
      goods: {
        goodsType:     "02",
        goodsCategory: "Z000",
        referenceGoodsId: plan.id,
        goodsName:     plan.title_name,
        goodsDetail:   plan.description || plan.title_name,
      },
      buyer: {
        referenceBuyerId: req.user.id,
        buyerEmail:       user?.email || "",
        buyerName: {
          firstName: user?.firstNames || "",
          lastName:  user?.lastNames  || "",
        },
      },
    };

    const body      = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha512", apiSecret)
      .update(`${ts}\n${nonce}\n${body}\n`)
      .digest("hex")
      .toUpperCase();

    const resp = await fetch("https://bpay.binanceapi.com/binancepay/openapi/v2/order", {
      method:  "POST",
      headers: {
        "Content-Type":           "application/json",
        "BinancePay-Timestamp":   String(ts),
        "BinancePay-Nonce":       nonce,
        "BinancePay-Certificate-SN": apiKey,
        "BinancePay-Signature":   signature,
      },
      body,
    });
    const data = await resp.json();

    if (data.status !== "SUCCESS") {
      console.error("[Binance Pay] Error:", data);
      return res.status(502).json({ code: "binance_error", message: data.errorMessage || "Error en Binance Pay" });
    }

    // Registrar el pago pendiente en MongoDB
    const pago = {
      id:              uuidv4(),
      user_id:         req.user.id,
      user_name:       `${user?.firstNames || ""} ${user?.lastNames || ""}`.trim(),
      user_email:      user?.email || "",
      plan:            { plan_id: plan.id, title_name: plan.title_name, price: plan.price },
      amount:          Number(plan.price),
      method:          "crypto",
      methodPay: {
        id: "binance_pay", name: "Binance Pay",
        number: process.env.BINANCE_PAY_ID || "",
        typeAccount: "binance_pay", cardAccount: "binance_pay",
      },
      binance_order_id:      data.data.prepayId,
      binance_merchant_trade: nonce,
      picture:               data.data.qrcodeLink || nonce,
      state:   "Pendiente",
      states:  [{ state: "Pendiente", createdAt: new Date() }],
      note:    "Binance Pay",
      period:  "1", kind: "mes", isPrePay: false,
      createdAt: new Date(),
    };
    await db.collection(nameCollections.payments).insertOne(pago);

    return res.status(200).json({
      code: "orden_creada",
      data: {
        payment_id:    pago.id,
        qrcode_url:    data.data.qrcodeLink,
        universal_url: data.data.universalUrl,
        deep_link:     data.data.deeplink,
        expires_at:    new Date(Date.now() + 15 * 60000), // 15 min
      },
    });
  } catch (e) {
    console.error("cryptoPayment.createBinanceOrder:", e);
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/crypto/bybit/order
// Genera una orden de pago en Bybit Pay
// body: { planId }
// ═══════════════════════════════════════════════════════════════════════════════
async function createBybitOrder(req, res) {
  try {
    const apiKey    = process.env.BYBIT_PAY_API_KEY;
    const apiSecret = process.env.BYBIT_PAY_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(503).json({
        code: "no_configurado",
        message: "Bybit Pay no está configurado. Usa pago manual con USDT.",
      });
    }

    const { planId } = req.body;
    const db   = getDB();
    const plan = await db.collection(nameCollections.plans).findOne({ id: planId, active: true });
    if (!plan) return res.status(404).json({ code: "plan_no_encontrado" });

    const user       = await db.collection(nameCollections.admin).findOne({ id: req.user.id });
    const merchantOrderId = uuidv4().replace(/-/g, "").slice(0, 32);
    const ts         = Date.now();

    const payload = {
      merchantOrderId,
      orderAmount:  String(Number(plan.price).toFixed(2)),
      currency:     plan.currencyCode || "USDT",
      productType:  "SERVICE",
      productName:  plan.title_name,
      userId:       req.user.id,
    };

    const body      = JSON.stringify(payload);
    const sign      = crypto
      .createHmac("sha256", apiSecret)
      .update(`${ts}${apiKey}${body}`)
      .digest("hex");

    const resp = await fetch("https://api.bybit.com/v5/pay/order/create", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": String(ts),
        "X-BAPI-SIGN":    sign,
      },
      body,
    });
    const data = await resp.json();

    if (data.retCode !== 0) {
      console.error("[Bybit Pay] Error:", data);
      return res.status(502).json({ code: "bybit_error", message: data.retMsg || "Error en Bybit Pay" });
    }

    const pago = {
      id:      uuidv4(),
      user_id: req.user.id,
      user_name: `${user?.firstNames || ""} ${user?.lastNames || ""}`.trim(),
      user_email: user?.email || "",
      plan:    { plan_id: plan.id, title_name: plan.title_name, price: plan.price },
      amount:  Number(plan.price),
      method:  "crypto",
      methodPay: {
        id: "bybit_pay", name: "Bybit Pay",
        number: process.env.BYBIT_PAY_ID || "",
        typeAccount: "bybit_pay", cardAccount: "bybit_pay",
      },
      bybit_order_id:       data.result?.orderId,
      bybit_merchant_order: merchantOrderId,
      picture:              data.result?.qrCodeUrl || merchantOrderId,
      state:    "Pendiente",
      states:   [{ state: "Pendiente", createdAt: new Date() }],
      note:     "Bybit Pay",
      period:   "1", kind: "mes", isPrePay: false,
      createdAt: new Date(),
    };
    await db.collection(nameCollections.payments).insertOne(pago);

    return res.status(200).json({
      code: "orden_creada",
      data: {
        payment_id:  pago.id,
        qrcode_url:  data.result?.qrCodeUrl,
        pay_url:     data.result?.payUrl,
        expires_at:  new Date(Date.now() + 15 * 60000),
      },
    });
  } catch (e) {
    console.error("cryptoPayment.createBybitOrder:", e);
    return res.status(500).json({ code: "error", message: e.message });
  }
}

module.exports = {
  getCryptoMethods,
  getWalletAddress,
  registerCryptoPayment,
  createBinanceOrder,
  createBybitOrder,
};
