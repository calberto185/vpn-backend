/**
 * cryptoService.js — Servicio para crear invoices/facturas en pasarelas crypto
 *
 * Soporta:
 *   - NOWPayments  → https://nowpayments.io  (multi-crypto: BTC, ETH, USDT TRC20/ERC20, TON, LTC...)
 *   - CryptoBot    → @CryptoBot en Telegram  (USDT, BTC, TON, ETH — muy popular en Rusia)
 *   - Binance Pay  → ID estático (manual, sin Merchant API)
 *   - Bybit Pay    → ID estático (manual, sin Merchant API)
 *
 * Flujo automático (NOWPayments / CryptoBot):
 *   1. Al crear pago → llamar createInvoice(provider, { amount, currency, paymentId, ... })
 *   2. Devuelve URL de pago y datos para mostrar al cliente
 *   3. Al pagar → el webhook confirma y activa el servicio automáticamente
 *
 * Flujo manual (Binance Pay / Bybit Pay):
 *   1. Mostrar Pay ID al cliente
 *   2. Cliente envía comprobante
 *   3. Admin confirma manualmente
 */

const https  = require("https");
const crypto = require("crypto");

// ─── Helper HTTP ──────────────────────────────────────────────────────────────

function _httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOWPayments — crear invoice
// Acepta prácticamente cualquier crypto: BTC, ETH, USDT-TRC20, USDT-ERC20,
// TON, LTC, XMR, DOGE, SOL, MATIC, TRX, BNB y más de 300 monedas
// ═══════════════════════════════════════════════════════════════════════════════
async function createNowPaymentsInvoice({
  amountUsd,        // monto en USD (NOWPayments convierte automáticamente)
  currency = "usdttrc20", // moneda preferida del cliente
  paymentId,        // nuestro ID interno del pago
  description = "VPN Service",
}) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY no configurado");

  const body = {
    price_amount:   amountUsd,
    price_currency: "usd",
    pay_currency:   currency,
    order_id:       paymentId,
    order_description: description,
    ipn_callback_url: `${process.env.BACKEND_URL}/api/webhooks/nowpayments`,
    success_url:    `${process.env.FRONTEND_URL || process.env.BACKEND_URL}/payment/success`,
    cancel_url:     `${process.env.FRONTEND_URL || process.env.BACKEND_URL}/payment/cancel`,
  };

  const res = await _httpRequest(
    "https://api.nowpayments.io/v1/invoice",
    {
      method:  "POST",
      headers: {
        "x-api-key":    apiKey,
        "Content-Type": "application/json",
      },
    },
    body
  );

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`NOWPayments error ${res.status}: ${JSON.stringify(res.data)}`);
  }

  return {
    provider:    "nowpayments",
    invoice_id:  res.data.id,
    invoice_url: res.data.invoice_url,
    pay_currency: currency,
    order_id:    paymentId,
    expires_at:  res.data.expiration_estimate_date,
    raw:         res.data,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CryptoBot (@CryptoBot) — crear invoice
// Acepta: USDT, BTC, TON, ETH, BNB, TRX, USDC, LTC, BUSD, MATIC
// Muy popular en Telegram/Rusia — el pago se hace directamente en el bot
// ═══════════════════════════════════════════════════════════════════════════════
async function createCryptoBotInvoice({
  amount,           // monto en la moneda elegida
  asset = "USDT",   // "USDT" | "BTC" | "TON" | "ETH" | "LTC" | "TRX" | "BNB"
  paymentId,        // nuestro ID interno (se guarda en payload)
  description = "VPN Service",
  expiresIn = 3600, // segundos (1 hora)
}) {
  const token = process.env.CRYPTOBOT_API_TOKEN;
  if (!token) throw new Error("CRYPTOBOT_API_TOKEN no configurado");

  // CryptoBot tiene dos endpoints: mainnet y testnet
  const baseUrl = process.env.CRYPTOBOT_TESTNET === "true"
    ? "https://testnet-pay.crypt.bot"
    : "https://pay.crypt.bot";

  const params = new URLSearchParams({
    asset,
    amount:       String(amount),
    description,
    payload:      paymentId,       // nuestro ID → llega en el webhook
    expires_in:   String(expiresIn),
  });

  const res = await _httpRequest(
    `${baseUrl}/api/createInvoice?${params}`,
    {
      method:  "GET",
      headers: { "Crypto-Pay-API-Token": token },
    }
  );

  if (!res.data?.ok) {
    throw new Error(`CryptoBot error: ${JSON.stringify(res.data)}`);
  }

  const invoice = res.data.result;
  return {
    provider:    "cryptobot",
    invoice_id:  String(invoice.invoice_id),
    invoice_url: invoice.bot_invoice_url || invoice.pay_url,
    asset,
    amount,
    payload:     paymentId,
    expires_at:  new Date(Date.now() + expiresIn * 1000).toISOString(),
    raw:         invoice,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Binance Pay — datos para pago manual (sin Merchant API)
// El cliente transfiere al Pay ID del admin y envía comprobante
// ═══════════════════════════════════════════════════════════════════════════════
function getBinancePayData({ amountUsdt, paymentId }) {
  const payId = process.env.BINANCE_PAY_ID;
  if (!payId) throw new Error("BINANCE_PAY_ID no configurado");
  return {
    provider:    "binance",
    pay_id:      payId,
    amount_usdt: amountUsdt,
    payment_id:  paymentId,
    note:        `VPN-${paymentId.slice(0, 8)}`, // nota para identificar el pago
    instructions: [
      `Envía exactamente ${amountUsdt} USDT`,
      `al Binance Pay ID: ${payId}`,
      `en la nota escribe: VPN-${paymentId.slice(0, 8)}`,
      "Luego envía el comprobante (screenshot)",
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bybit Pay — datos para pago manual
// ═══════════════════════════════════════════════════════════════════════════════
function getBybitPayData({ amountUsdt, paymentId }) {
  const payId = process.env.BYBIT_PAY_ID;
  if (!payId) throw new Error("BYBIT_PAY_ID no configurado");
  return {
    provider:    "bybit",
    pay_id:      payId,
    amount_usdt: amountUsdt,
    payment_id:  paymentId,
    note:        `VPN-${paymentId.slice(0, 8)}`,
    instructions: [
      `Envía exactamente ${amountUsdt} USDT`,
      `al Bybit Pay ID: ${payId}`,
      `en la nota escribe: VPN-${paymentId.slice(0, 8)}`,
      "Luego envía el comprobante (screenshot)",
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dispatcher — elige la pasarela correcta según el método elegido
// ═══════════════════════════════════════════════════════════════════════════════
async function createCryptoPayment({ method, amountUsd, amountUsdt, paymentId, description }) {
  switch (method) {
    case "nowpayments_btc":
      return createNowPaymentsInvoice({ amountUsd, currency: "btc", paymentId, description });
    case "nowpayments_usdt_trc20":
    case "nowpayments":
      return createNowPaymentsInvoice({ amountUsd, currency: "usdttrc20", paymentId, description });
    case "nowpayments_usdt_erc20":
      return createNowPaymentsInvoice({ amountUsd, currency: "usdterc20", paymentId, description });
    case "nowpayments_ton":
      return createNowPaymentsInvoice({ amountUsd, currency: "ton", paymentId, description });
    case "nowpayments_eth":
      return createNowPaymentsInvoice({ amountUsd, currency: "eth", paymentId, description });
    case "nowpayments_ltc":
      return createNowPaymentsInvoice({ amountUsd, currency: "ltc", paymentId, description });
    case "cryptobot_usdt":
    case "cryptobot":
      return createCryptoBotInvoice({ amount: amountUsdt, asset: "USDT", paymentId, description });
    case "cryptobot_ton":
      return createCryptoBotInvoice({ amount: amountUsdt, asset: "TON", paymentId, description });
    case "cryptobot_btc":
      return createCryptoBotInvoice({ amount: amountUsdt, asset: "BTC", paymentId, description });
    case "binance":
      return getBinancePayData({ amountUsdt, paymentId });
    case "bybit":
      return getBybitPayData({ amountUsdt, paymentId });
    default:
      throw new Error(`Método crypto no reconocido: ${method}`);
  }
}

module.exports = {
  createNowPaymentsInvoice,
  createCryptoBotInvoice,
  getBinancePayData,
  getBybitPayData,
  createCryptoPayment,
};
