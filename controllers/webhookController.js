/**
 * webhookController.js — Webhooks de pasarelas de pago
 *
 * Rutas montadas en /api/webhooks (SIN verifyToken — son llamadas externas)
 * Seguridad: verificación de firma/hash según cada pasarela
 *
 * POST /api/webhooks/stripe        → Stripe (payment_intent.succeeded)
 * POST /api/webhooks/yoomoney      → YooMoney (notificación HTTP)
 * POST /api/webhooks/tbank         → T-Bank (notificación HTTP)
 *
 * Al confirmarse un pago, el webhook:
 *   1. Verifica autenticidad (firma/hash)
 *   2. Busca el pago pendiente por label/order_id
 *   3. Lo confirma en MongoDB
 *   4. Activa el servicio VPN automáticamente (crea device en S-UI)
 *   5. Notifica al cliente vía Telegram y email
 */

const crypto                     = require("crypto");
const { v4: uuidv4 }             = require("uuid");
const { getDB, nameCollections } = require("../services/dbServices");
const sui                        = require("../services/suiService");
const DeviceEntity               = require("../models/deviceEntity");
const CertificateEntity          = require("../models/certificateEntity");
const { sendMail }               = require("../shared/mailer");
const { log: binLog }            = require("../utils/binnacle");

// ─── Helper: activar servicio VPN tras pago confirmado ────────────────────────

async function _activarServicioTrasConfirmacion(db, userId, paymentId, planId, serviceId) {
  try {
    // Buscar plan
    const plan = await db.collection(nameCollections.plans).findOne({ id: planId, active: true });
    if (!plan) {
      console.warn(`[Webhook] Plan ${planId} no encontrado para activar servicio`);
      return { ok: false, error: "plan_no_encontrado" };
    }

    // Buscar servidor asignado al plan
    const serverRef = plan.servers?.[0];
    if (!serverRef?.server_id) {
      console.warn(`[Webhook] Plan ${planId} sin servidor asignado`);
      return { ok: false, error: "sin_servidor" };
    }
    const servidor = await db.collection(nameCollections.servers)
      .findOne({ id: serverRef.server_id, active: true });
    if (!servidor) return { ok: false, error: "servidor_inactivo" };

    // Datos del cliente
    const cliente = await db.collection(nameCollections.admin).findOne({ id: userId });
    if (!cliente) return { ok: false, error: "cliente_no_encontrado" };

    // Generar email VPN
    const now      = new Date();
    const dia      = String(now.getDate()).padStart(2, "0");
    const svcName  = plan.service?.sortName || "VPN";
    const nombre   = (cliente.firstNames || "").replace(/\s+/g, "").slice(0, 15);
    const email    = `${svcName.toUpperCase()}-${dia}th-${nombre}-${userId.slice(0, 8)}`;

    const gbLimite = plan.details?.find(d => d.key === "gb")?.value     || 50;
    const dias     = plan.details?.find(d => d.key === "dias")?.value   || 30;

    // ── Bifurcar según protocolo del servidor ─────────────────────────────────
    const protocol = servidor.protocol || "s-ui";

    if (protocol === "s-ui" || protocol === "both") {
    // ── S-UI ──────────────────────────────────────────────────────────────────
    const suiResult = await sui.agregarCliente(servidor, {
      email,
      gbLimite: Number(gbLimite),
      dias:     Number(dias),
      desc:     `${cliente.firstNames} ${cliente.lastNames} | pago auto`,
    });

    if (!suiResult.success) {
      console.error("[Webhook] Error S-UI:", suiResult.error);
      return { ok: false, error: suiResult.error };
    }

    // Guardar DeviceEntity
    const device        = new DeviceEntity();
    device.id           = uuidv4();
    device.user_id      = userId;
    device.plan_id      = planId;
    device.service_id   = serviceId || plan.service?.id || "";
    device.server_id    = servidor.id;
    device.protocol     = "s-ui";
    device.device       = "Suscripción VPN";
    device.typeDevice   = "subscription";
    device.active       = true;
    device.sui_uuid     = suiResult.sui_uuid;
    device.sui_email    = suiResult.sui_email;
    device.sui_sub_id   = suiResult.sub_id;
    device.sui_config   = suiResult.sui_config;
    device.createdAt    = now;
    device.updatedAt    = now;

    await db.collection(nameCollections.devices).insertOne(device);

    // Actualizar services[] del cliente
    const serviceSnapshot = {
      service_id:  device.service_id,
      plan_id:     planId,
      plan_title:  plan.title_name,
      plan_price:  plan.price,
      device_id:   device.id,
      server_id:   servidor.id,
      state:       "activo",
      startedAt:   now,
      endedAt:     new Date(now.getTime() + Number(dias) * 86400000),
      updatedAt:   now,
    };
    await db.collection(nameCollections.admin).updateOne(
      { id: userId },
      { $push: { services: serviceSnapshot }, $set: { onService: true, onServiceAt: now } }
    );

    // Notificar al cliente por email
    try {
      await sendMail(
        cliente.email,
        "✅ Tu servicio VPN está activo",
        `Hola ${cliente.firstNames},\n\nTu pago fue confirmado y tu acceso VPN está listo.\n\nLink de suscripción: ${suiResult.sub_url}\n\nVigencia: ${dias} días | ${gbLimite}GB\n\nSaludos,\n${process.env.NAME_APP || "SVION VPN"}`
      );
    } catch (mailErr) {
      console.warn("[Webhook] Email no enviado:", mailErr.message);
    }

    console.log(`[Webhook] ✅ S-UI activado: user=${userId} email=${email} device=${device.id}`);
    return { ok: true, device_id: device.id, sub_url: suiResult.sub_url };

    } else {
    // ── OpenVPN vía SSH ────────────────────────────────────────────────────────
    const dayjs = require("dayjs");
    const now2  = new Date();
    const dia2  = String(now2.getDate()).padStart(2, "0");
    const userName = `${(plan.service?.sortName || "VPN").toUpperCase()}-${dia2}-${(cliente.firstNames||"").replace(/\s+/g,"").slice(0,12)}-${userId.slice(0,8)}`;

    const cert        = new CertificateEntity();
    cert.user_id      = userId;
    cert.user         = userName;
    cert.hostname     = servidor.host;
    cert.server_id    = servidor.id;
    cert.server       = servidor.name || servidor.host;
    cert.device_id    = device.id;
    cert.device       = "Suscripción VPN";
    cert.ip           = servidor.host;
    cert.profile_type = "client";
    cert.tags         = "subscription";
    cert.valid_days   = String(Number(dias));
    cert.expires_at   = new Date(now2.getTime() + Number(dias) * 86400000).toISOString();
    cert.note         = "activado por webhook";
    cert.version      = "2";

    // Simular req/res para reutilizar vpnController.crear
    const { crear: crearCertificado } = require("../controllers/vpnController");
    const fakeRes = {
      _data: null, _status: 200,
      status(s) { this._status = s; return this; },
      send(d)   { this._data = d; return this; },
      json(d)   { this._data = d; return this; },
    };
    const fakeReq = { body: cert, user: { id: userId, role: "client" } };
    await crearCertificado(fakeReq, fakeRes);

    if (fakeRes._status >= 400) {
      console.error("[Webhook] OpenVPN crear error:", fakeRes._data);
      return { ok: false, error: "openvpn_create_failed" };
    }

    await db.collection(nameCollections.devices).insertOne(device);
    await db.collection(nameCollections.admin).updateOne(
      { id: userId },
      { $push: { services: serviceSnapshot }, $set: { onService: true, onServiceAt: now2 } }
    );

    try {
      await sendMail(
        cliente.email,
        "✅ Tu acceso VPN está listo",
        `Hola ${cliente.firstNames},

Tu pago fue confirmado. Descarga tu archivo .ovpn desde el panel.

Saludos,
${process.env.NAME_APP || "SVION VPN"}`
      );
    } catch {}

    console.log(`[Webhook] ✅ OpenVPN activado: user=${userId} cert=${userName}`);
    return { ok: true, device_id: device.id };
    } // end protocol switch

  } catch (e) {
    console.error("[Webhook] _activarServicio error:", e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Helper: confirmar pago en DB ─────────────────────────────────────────────

async function _confirmarPago(db, pagoId, fuente) {
  const now = new Date();
  binLog({ action: `payment_confirmed:${fuente}`, actorId: `webhook:${fuente}`, targetId: pagoId, targetType: "payment", data: { fuente } });
  await db.collection(nameCollections.payments).updateOne(
    { id: pagoId },
    {
      $set: { state: "Aceptado", confirmedAt: now, confirmedBy: `webhook:${fuente}` },
      $push: { states: { state: "Aceptado", createdAt: now } },
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/stripe
// ═══════════════════════════════════════════════════════════════════════════════
async function stripeWebhook(req, res) {
  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  // Verificar firma de Stripe (requiere body raw — ver app.js)
  if (secret) {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const event  = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, secret);

      if (event.type === "payment_intent.succeeded") {
        const intent   = event.data.object;
        const pagoId   = intent.metadata?.payment_id;
        const userId   = intent.metadata?.user_id;
        const planId   = intent.metadata?.plan_id;
        const serviceId = intent.metadata?.service_id;

        if (pagoId && userId && planId) {
          const db = getDB();
          await _confirmarPago(db, pagoId, "stripe");
          await _activarServicioTrasConfirmacion(db, userId, pagoId, planId, serviceId);
        }
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("[Stripe Webhook] Firma inválida:", err.message);
      return res.status(400).json({ error: err.message });
    }
  }

  // Sin secret configurado: modo desarrollo
  console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET no configurado — modo desarrollo");
  return res.status(200).json({ received: true, dev_mode: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/yoomoney
// YooMoney envía HTTP POST con campos de formulario
// Verificación: SHA1(notification_type&operation_id&amount&currency&datetime&sender&codepro&secret&label)
// ═══════════════════════════════════════════════════════════════════════════════
async function yoomoneyWebhook(req, res) {
  try {
    const {
      notification_type, operation_id, amount, currency,
      datetime, sender, codepro, label, sha1_hash,
    } = req.body;

    const secret = process.env.YOOMONEY_NOTIFICATION_SECRET;

    // Verificar hash si está configurado
    if (secret && sha1_hash) {
      const str    = [notification_type, operation_id, amount, currency,
                      datetime, sender, codepro, secret, label].join("&");
      const expected = crypto.createHash("sha1").update(str).digest("hex");
      if (expected !== sha1_hash) {
        console.error("[YooMoney Webhook] Hash inválido");
        return res.status(400).send("Hash inválido");
      }
    }

    // El label es el email VPN (SVION-03th-Nombre-ID) que usamos como identificador
    // Buscar el pago pendiente por label
    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({
      state: { $in: ["Varificando", "Pendiente"] },
      $or: [
        { "methodPay.label":  label },
        { label },
        { yoomoney_label: label },
      ],
    });

    if (!pago) {
      console.warn(`[YooMoney Webhook] Pago no encontrado para label: ${label}`);
      return res.status(200).send("OK"); // siempre 200 a YooMoney
    }

    await _confirmarPago(db, pago.id, "yoomoney");
    await _activarServicioTrasConfirmacion(
      db, pago.user_id, pago.id,
      pago.plan?.plan_id || pago.plan_id,
      pago.plan?.service_id || pago.service_id
    );

    console.log(`[YooMoney Webhook] ✅ Pago confirmado: ${operation_id} | ${amount} ${currency}`);
    return res.status(200).send("OK");
  } catch (e) {
    console.error("[YooMoney Webhook] Error:", e.message);
    return res.status(200).send("OK"); // siempre 200 para evitar reintentos
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/tbank
// T-Bank / SBP — verificación por token en header o body
// ═══════════════════════════════════════════════════════════════════════════════
async function tbankWebhook(req, res) {
  try {
    const { OperationId, Amount, Status, OrderId, CustomerKey } = req.body;

    // Verificar token
    const expectedToken = process.env.TBANK_NOTIFICATION_TOKEN;
    const receivedToken = req.headers["x-tbank-token"] || req.body.Token;
    if (expectedToken && receivedToken !== expectedToken) {
      console.error("[T-Bank Webhook] Token inválido");
      return res.status(403).json({ error: "token_invalido" });
    }

    if (Status !== "CONFIRMED") {
      return res.status(200).json({ ok: true, status: Status });
    }

    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({
      state: { $in: ["Varificando", "Pendiente"] },
      $or: [{ tbank_order_id: OrderId }, { id: OrderId }],
    });

    if (!pago) {
      console.warn(`[T-Bank Webhook] Pago no encontrado para OrderId: ${OrderId}`);
      return res.status(200).json({ ok: true });
    }

    await _confirmarPago(db, pago.id, "tbank");
    await _activarServicioTrasConfirmacion(
      db, pago.user_id, pago.id,
      pago.plan?.plan_id || pago.plan_id,
      pago.plan?.service_id || pago.service_id
    );

    console.log(`[T-Bank Webhook] ✅ Pago confirmado: ${OperationId} | ${Amount}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[T-Bank Webhook] Error:", e.message);
    return res.status(200).json({ ok: true });
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/nowpayments
// NOWPayments — pasarela automática multi-crypto (BTC, ETH, USDT, TON, etc.)
// Docs: https://documenter.getpostman.com/view/7907941/2s93JqTRWN
// Verificación: HMAC-SHA512 del body con IPN_SECRET_KEY
// ═══════════════════════════════════════════════════════════════════════════════
async function nowpaymentsWebhook(req, res) {
  try {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;

    // Verificar firma si está configurada
    if (secret) {
      const receivedSig = req.headers["x-nowpayments-sig"];
      const bodyStr     = JSON.stringify(
        Object.keys(req.body).sort().reduce((acc, k) => { acc[k] = req.body[k]; return acc; }, {})
      );
      const expected = crypto.createHmac("sha512", secret).update(bodyStr).digest("hex");
      if (expected !== receivedSig) {
        console.error("[NOWPayments Webhook] Firma inválida");
        return res.status(400).json({ error: "firma_invalida" });
      }
    }

    const { payment_status, order_id, pay_amount, pay_currency, price_amount, price_currency } = req.body;

    // Solo procesar pagos completados
    if (!["finished", "confirmed"].includes(payment_status)) {
      return res.status(200).json({ ok: true, status: payment_status });
    }

    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({
      state: { $in: ["Varificando", "Pendiente"] },
      $or: [
        { nowpayments_order_id: order_id },
        { id: order_id },
        { "methodPay.order_id": order_id },
      ],
    });

    if (!pago) {
      console.warn(`[NOWPayments Webhook] Pago no encontrado para order_id: ${order_id}`);
      return res.status(200).json({ ok: true });
    }

    await _confirmarPago(db, pago.id, `nowpayments:${pay_currency}`);
    const result = await _activarServicioTrasConfirmacion(
      db, pago.user_id, pago.id,
      pago.plan?.plan_id || pago.plan_id,
      pago.plan?.service_id || pago.service_id
    );

    console.log(
      `[NOWPayments Webhook] ✅ ${pay_amount} ${pay_currency} ` +
      `(≈${price_amount} ${price_currency}) | order=${order_id} | ok=${result.ok}`
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[NOWPayments Webhook] Error:", e.message);
    return res.status(200).json({ ok: true }); // siempre 200 para evitar reintentos
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/cryptobot
// CryptoBot (@CryptoBot en Telegram) — popular en Rusia
// Verificación: token en header X-Api-Token
// ═══════════════════════════════════════════════════════════════════════════════
async function cryptobotWebhook(req, res) {
  try {
    // Verificar token de CryptoBot
    const expectedToken = process.env.CRYPTOBOT_API_TOKEN;
    const receivedToken = req.headers["crypto-pay-api-token"];
    if (expectedToken && receivedToken !== expectedToken) {
      console.error("[CryptoBot Webhook] Token inválido");
      return res.status(401).json({ error: "token_invalido" });
    }

    const { update_type, payload } = req.body;
    if (update_type !== "invoice_paid") {
      return res.status(200).json({ ok: true });
    }

    const { invoice_id, payload: invoicePayload, amount, asset, status } = payload || {};
    if (status !== "paid") return res.status(200).json({ ok: true });

    // invoicePayload contiene el payment_id que guardamos al crear la factura
    const pagoId = invoicePayload || invoice_id?.toString();
    const db     = getDB();
    const pago   = await db.collection(nameCollections.payments).findOne({
      state: { $in: ["Varificando", "Pendiente"] },
      $or: [
        { id: pagoId },
        { cryptobot_invoice_id: invoice_id?.toString() },
        { "methodPay.invoice_id": invoice_id?.toString() },
      ],
    });

    if (!pago) {
      console.warn(`[CryptoBot Webhook] Pago no encontrado: invoice=${invoice_id}`);
      return res.status(200).json({ ok: true });
    }

    await _confirmarPago(db, pago.id, `cryptobot:${asset}`);
    const result = await _activarServicioTrasConfirmacion(
      db, pago.user_id, pago.id,
      pago.plan?.plan_id || pago.plan_id,
      pago.plan?.service_id || pago.service_id
    );

    console.log(`[CryptoBot Webhook] ✅ ${amount} ${asset} | invoice=${invoice_id} | ok=${result.ok}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[CryptoBot Webhook] Error:", e.message);
    return res.status(200).json({ ok: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/binance
// Binance Pay — verificación por HMAC-SHA512
// Para pagos manuales: el admin confirma y esto activa el servicio
// Para pagos automáticos: Binance Pay Webhook (requiere cuenta Merchant)
// ═══════════════════════════════════════════════════════════════════════════════
async function binanceWebhook(req, res) {
  try {
    const secret = process.env.BINANCE_PAY_SECRET;

    if (secret) {
      // Verificar: HMAC-SHA512(timestamp + "\n" + nonce + "\n" + body)
      const timestamp  = req.headers["binancepay-timestamp"];
      const nonce      = req.headers["binancepay-nonce"];
      const signature  = req.headers["binancepay-signature"];
      const bodyStr    = JSON.stringify(req.body);
      const payload_str = `${timestamp}\n${nonce}\n${bodyStr}\n`;
      const expected   = crypto.createHmac("sha512", secret)
                               .update(payload_str).digest("hex").toUpperCase();
      if (expected !== signature) {
        console.error("[Binance Webhook] Firma inválida");
        return res.status(400).json({ returnCode: "FAIL", returnMessage: "Invalid signature" });
      }
    }

    const { bizType, bizStatus, bizIdStr, data } = req.body;
    if (bizType !== "PAY" || bizStatus !== "PAY_SUCCESS") {
      return res.status(200).json({ returnCode: "SUCCESS", returnMessage: "OK" });
    }

    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({
      state: { $in: ["Varificando", "Pendiente"] },
      $or: [
        { binance_order_id: bizIdStr },
        { id: bizIdStr },
        { "methodPay.order_id": bizIdStr },
      ],
    });

    if (!pago) {
      console.warn(`[Binance Webhook] Pago no encontrado: bizIdStr=${bizIdStr}`);
      return res.status(200).json({ returnCode: "SUCCESS", returnMessage: "OK" });
    }

    const currency = data?.currency || "USDT";
    await _confirmarPago(db, pago.id, `binance:${currency}`);
    await _activarServicioTrasConfirmacion(
      db, pago.user_id, pago.id,
      pago.plan?.plan_id || pago.plan_id,
      pago.plan?.service_id || pago.service_id
    );

    console.log(`[Binance Webhook] ✅ Pago ${bizIdStr} confirmado`);
    return res.status(200).json({ returnCode: "SUCCESS", returnMessage: "OK" });
  } catch (e) {
    console.error("[Binance Webhook] Error:", e.message);
    return res.status(200).json({ returnCode: "SUCCESS", returnMessage: "OK" });
  }
}

// bybitPayWebhook — alias de la función existente (misma lógica que binanceWebhook pero para Bybit)
async function bybitPayWebhook(req, res) {
  try {
    const { orderId, merchantOrderId, status, amount, currency } = req.body;
    const apiSecret = process.env.BYBIT_PAY_SECRET;
    if (apiSecret) {
      const ts   = req.headers["x-bapi-timestamp"];
      const sign = req.headers["x-bapi-sign"];
      const expected = crypto.createHmac("sha256", apiSecret)
        .update(`${ts}${process.env.BYBIT_PAY_API_KEY}${JSON.stringify(req.body)}`)
        .digest("hex");
      if (expected !== sign) {
        console.error("[Bybit Pay Webhook] Firma inválida");
        return res.status(403).json({ code: "firma_invalida" });
      }
    }
    if (status !== "PAID") return res.status(200).json({ code: "ok", status });
    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({
      $or: [{ bybit_order_id: orderId }, { bybit_merchant_order: merchantOrderId }],
    });
    if (!pago) {
      console.warn(`[Bybit Pay Webhook] Orden no encontrada: ${orderId}`);
      return res.status(200).json({ code: "ok" });
    }
    await _confirmarPago(db, pago.id, "bybit_pay");
    await _activarServicioTrasConfirmacion(db, pago.user_id, pago.id,
      pago.plan?.plan_id, pago.plan?.service_id);
    console.log(`[Bybit Pay Webhook] ✅ ${orderId} | ${amount} ${currency}`);
    return res.status(200).json({ code: "ok" });
  } catch (e) {
    console.error("[Bybit Pay Webhook] Error:", e.message);
    return res.status(200).json({ code: "ok" });
  }
}

module.exports = { stripeWebhook, yoomoneyWebhook, tbankWebhook, nowpaymentsWebhook, cryptobotWebhook, binanceWebhook, bybitPayWebhook };
