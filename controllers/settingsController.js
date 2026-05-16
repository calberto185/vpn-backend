/**
 * settingsController.js
 * Configuración de canales de notificación (Telegram, WhatsApp, Email).
 *
 * GET  /api/settings/notifications                   → getNotificationsConfig
 * PUT  /api/settings/notifications                   → saveNotificationsConfig
 * POST /api/settings/notifications/test/telegram     → testTelegram
 * POST /api/settings/notifications/test/email        → testEmail
 * POST /api/settings/notifications/test/whatsapp     → testWhatsApp
 */
const { getNotificationsConfigRaw, upsertNotificationsConfig } = require('../services/settingsService');
const nodemailer = require('nodemailer');

// ─── Helpers internos ─────────────────────────────────────────────────────────

function _mask(doc) {
  if (!doc) return null;
  return {
    telegram: {
      token:         doc.telegram?.token     ? '***' : '',
      hasToken:      !!doc.telegram?.token,
      admin_chat_id: doc.telegram?.admin_chat_id || '',
    },
    whatsapp: {
      provider:     doc.whatsapp?.provider     || 'twilio',
      account_sid:  doc.whatsapp?.account_sid  || '',
      auth_token:   doc.whatsapp?.auth_token   ? '***' : '',
      hasAuthToken: !!doc.whatsapp?.auth_token,
      from:         doc.whatsapp?.from         || 'whatsapp:+14155238886',
    },
    email: {
      host:        doc.email?.host        || '',
      port:        doc.email?.port        || 465,
      secure:      doc.email?.secure      !== false,
      user:        doc.email?.user        || '',
      pass:        doc.email?.pass        ? '***' : '',
      hasPass:     !!doc.email?.pass,
      from_name:   doc.email?.from_name   || '',
      admin_email: doc.email?.admin_email || '',
    },
  };
}

async function _sendTg(token, chatId, text) {
  if (!token || !chatId) return { sent: false, error: 'Token o Chat ID faltante' };
  try {
    const url  = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const json = await resp.json();
    if (!json.ok) throw new Error(json.description || 'Telegram error');
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function _sendEmail(cfg, to, subject, bodyText) {
  const transporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
    tls:    { rejectUnauthorized: false },
  });
  try {
    await transporter.sendMail({
      from:    `${cfg.from_name || cfg.user} <${cfg.user}>`,
      to,
      subject,
      text: bodyText,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function _sendWa(cfg, toPhone, text) {
  const to = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;
  try {
    const creds  = Buffer.from(`${cfg.account_sid}:${cfg.auth_token}`).toString('base64');
    const params = new URLSearchParams({ From: cfg.from, To: to, Body: text });
    const resp   = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.account_sid}/Messages.json`,
      {
        method:  'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      }
    );
    const json = await resp.json();
    if (json.error_code) throw new Error(`Twilio ${json.error_code}: ${json.message}`);
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/settings/notifications
// ═══════════════════════════════════════════════════════════════════════════════
async function getNotificationsConfig(req, res) {
  try {
    const doc = await getNotificationsConfigRaw();
    return res.status(200).json({ code: 'consultado', data: _mask(doc) });
  } catch (err) {
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/settings/notifications
// ═══════════════════════════════════════════════════════════════════════════════
async function saveNotificationsConfig(req, res) {
  try {
    const current = (await getNotificationsConfigRaw()) || {};
    const b       = req.body;

    // Si el campo viene como '***' se conserva el valor actual
    const merged = {
      telegram: {
        token:
          b.telegram?.token === '***'
            ? current.telegram?.token || ''
            : (b.telegram?.token ?? current.telegram?.token ?? ''),
        admin_chat_id: b.telegram?.admin_chat_id ?? current.telegram?.admin_chat_id ?? '',
      },
      whatsapp: {
        provider:    b.whatsapp?.provider    ?? current.whatsapp?.provider    ?? 'twilio',
        account_sid: b.whatsapp?.account_sid ?? current.whatsapp?.account_sid ?? '',
        auth_token:
          b.whatsapp?.auth_token === '***'
            ? current.whatsapp?.auth_token || ''
            : (b.whatsapp?.auth_token ?? current.whatsapp?.auth_token ?? ''),
        from: b.whatsapp?.from ?? current.whatsapp?.from ?? 'whatsapp:+14155238886',
      },
      email: {
        host:   b.email?.host   ?? current.email?.host   ?? 'smtp.gmail.com',
        port:   b.email?.port   ?? current.email?.port   ?? 465,
        secure: b.email?.secure ?? current.email?.secure ?? true,
        user:   b.email?.user   ?? current.email?.user   ?? '',
        pass:
          b.email?.pass === '***'
            ? current.email?.pass || ''
            : (b.email?.pass ?? current.email?.pass ?? ''),
        from_name:   b.email?.from_name   ?? current.email?.from_name   ?? '',
        admin_email: b.email?.admin_email ?? current.email?.admin_email ?? '',
      },
    };

    await upsertNotificationsConfig(merged);
    return res.status(200).json({ code: 'guardado', data: _mask(merged) });
  } catch (err) {
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/settings/notifications/test/telegram
// ═══════════════════════════════════════════════════════════════════════════════
async function testTelegram(req, res) {
  try {
    const cfg    = (await getNotificationsConfigRaw()) || {};
    const token  = cfg.telegram?.token  || process.env.TELEGRAM_TOKEN;
    const chatId = cfg.telegram?.admin_chat_id || process.env.ADMIN_TELEGRAM_ID;

    if (!token)  return res.status(400).json({ code: 'sin_token',   message: 'Token de Telegram no configurado' });
    if (!chatId) return res.status(400).json({ code: 'sin_chat_id', message: 'Chat ID de admin no configurado' });

    const result = await _sendTg(token, chatId,
      '🧪 <b>Test de conexión</b>\n\nTelegram está correctamente configurado en el panel.'
    );
    if (result.sent) return res.status(200).json({ code: 'enviado', message: 'Mensaje de prueba enviado' });
    return res.status(502).json({ code: 'error', message: result.error });
  } catch (err) {
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/settings/notifications/test/email
// ═══════════════════════════════════════════════════════════════════════════════
async function testEmail(req, res) {
  try {
    const cfg   = (await getNotificationsConfigRaw()) || {};
    const eCfg  = {
      host:      cfg.email?.host      || process.env.EMAIL_HOST    || 'smtp.gmail.com',
      port:      cfg.email?.port      || parseInt(process.env.EMAIL_PORT || '465'),
      secure:    cfg.email?.secure    !== undefined ? cfg.email.secure : process.env.EMAIL_SECURE !== 'false',
      user:      cfg.email?.user      || process.env.EMAIL_USER    || '',
      pass:      cfg.email?.pass      || process.env.EMAIL_PASS    || '',
      from_name: cfg.email?.from_name || process.env.NAME_APP      || 'Panel VPN',
    };
    const adminEmail = cfg.email?.admin_email || process.env.ADMIN_EMAIL || eCfg.user;

    if (!eCfg.user || !eCfg.pass) return res.status(400).json({ code: 'sin_credenciales', message: 'Credenciales SMTP no configuradas' });
    if (!adminEmail) return res.status(400).json({ code: 'sin_destino', message: 'Email del administrador no configurado' });

    const result = await _sendEmail(eCfg, adminEmail, 'Test de conexión — Panel VPN',
      '🧪 El sistema de email (Nodemailer) está correctamente configurado.'
    );
    if (result.sent) return res.status(200).json({ code: 'enviado', message: 'Email de prueba enviado' });
    return res.status(502).json({ code: 'error', message: result.error });
  } catch (err) {
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/settings/notifications/test/whatsapp
// Body: { to: "+51987..." }
// ═══════════════════════════════════════════════════════════════════════════════
async function testWhatsApp(req, res) {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ code: 'sin_numero', message: 'Proporciona un número de prueba en el campo "to"' });

    const cfg = (await getNotificationsConfigRaw()) || {};
    const wCfg = {
      account_sid: cfg.whatsapp?.account_sid || process.env.TWILIO_ACCOUNT_SID || '',
      auth_token:  cfg.whatsapp?.auth_token  || process.env.TWILIO_AUTH_TOKEN  || '',
      from:        cfg.whatsapp?.from        || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    };

    if (!wCfg.account_sid || !wCfg.auth_token)
      return res.status(400).json({ code: 'sin_credenciales', message: 'Credenciales de Twilio no configuradas' });

    const result = await _sendWa(wCfg, to, '🧪 Test de conexión — WhatsApp está correctamente configurado en el panel.');
    if (result.sent) return res.status(200).json({ code: 'enviado', message: 'Mensaje de prueba enviado' });
    return res.status(502).json({ code: 'error', message: result.error });
  } catch (err) {
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

module.exports = {
  getNotificationsConfig,
  saveNotificationsConfig,
  testTelegram,
  testEmail,
  testWhatsApp,
};
