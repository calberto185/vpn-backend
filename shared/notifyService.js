/**
 * notifyService.js — Servicio unificado de notificaciones externas
 *
 * Canales soportados:
 *   email     → nodemailer (config en DB o .env fallback)
 *   telegram  → Telegram Bot API directa
 *   whatsapp  → Twilio WhatsApp REST API
 *
 * La configuración se lee primero de la colección "settings" en MongoDB,
 * con fallback a variables de entorno (.env).
 */

const { sendMailHtml, sendMailHtmlWithConfig } = require('./mailer');

// ─── Obtener config de DB (lazy, sin cacheo permanente) ───────────────────────
async function _getDbCfg() {
  try {
    const { getNotificationsConfigRaw } = require('../services/settingsService');
    return (await getNotificationsConfigRaw()) || {};
  } catch {
    return {};
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────
async function sendTelegram(chatId, text) {
  const cfg   = await _getDbCfg();
  const token = cfg.telegram?.token || process.env.TELEGRAM_TOKEN;

  if (!token) {
    console.warn('[notify:telegram] Token no configurado — omitido');
    return { skipped: true };
  }
  if (!chatId) return { skipped: true, reason: 'sin telegram_id' };

  try {
    const url  = `https://api.telegram.org/bot${token}/sendMessage`;
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const json = await resp.json();
    if (!json.ok) throw new Error(json.description || 'Telegram error');
    console.log(`[notify:telegram] ✅ Enviado a chat_id ${chatId}`);
    return { sent: true };
  } catch (err) {
    console.error(`[notify:telegram] ❌ Error → ${err.message}`);
    return { sent: false, error: err.message };
  }
}

// ─── WhatsApp (Twilio) ────────────────────────────────────────────────────────
async function sendWhatsApp(toPhone, text) {
  const cfg = await _getDbCfg();
  const sid   = cfg.whatsapp?.account_sid || process.env.TWILIO_ACCOUNT_SID;
  const token = cfg.whatsapp?.auth_token  || process.env.TWILIO_AUTH_TOKEN;
  const from  = cfg.whatsapp?.from        || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!sid || !token) {
    console.warn('[notify:whatsapp] Credenciales Twilio no configuradas — omitido');
    return { skipped: true };
  }
  if (!toPhone) return { skipped: true, reason: 'sin número' };

  try {
    const to      = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;
    const creds   = Buffer.from(`${sid}:${token}`).toString('base64');
    const params  = new URLSearchParams({ From: from, To: to, Body: text });
    const resp    = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method:  'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      }
    );
    const json = await resp.json();
    if (json.error_code) throw new Error(`Twilio ${json.error_code}: ${json.message}`);
    console.log(`[notify:whatsapp] ✅ Enviado a ${to} — SID: ${json.sid}`);
    return { sent: true };
  } catch (err) {
    console.error(`[notify:whatsapp] ❌ Error → ${err.message}`);
    return { sent: false, error: err.message };
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────
async function sendEmail(toEmail, subject, body) {
  if (!toEmail) return { skipped: true, reason: 'sin email' };

  const cfg      = await _getDbCfg();
  const appName  = cfg.email?.from_name || process.env.NAME_APP || 'SVION VPN';
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1a1a2e;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">${appName}</h2>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
        <h3 style="margin-top:0;color:#111;">${escapeHtml(subject)}</h3>
        <div style="color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="color:#9ca3af;font-size:12px;margin:0;">
          Este mensaje fue enviado desde el panel de administración de ${appName}.
        </p>
      </div>
    </div>`;
  try {
    // Use DB config if available, otherwise fall back to env-based mailer
    if (cfg.email?.user && cfg.email?.pass) {
      await sendMailHtmlWithConfig(cfg.email, toEmail, subject, html);
    } else {
      await sendMailHtml(toEmail, subject, html);
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

// ─── Dispatcher principal ──────────────────────────────────────────────────────
async function notifyUser(user, subject, body, channels = ['in_app']) {
  const delivery = {
    email:    { sent: false, error: null },
    telegram: { sent: false, error: null },
    whatsapp: { sent: false, error: null },
  };
  const text = `${subject}\n\n${body}`;

  await Promise.allSettled([
    channels.includes('email') && user?.email
      ? sendEmail(user.email, subject, body).then(r => { delivery.email = r; })
      : Promise.resolve(),

    channels.includes('telegram') && user?.telegram_id
      ? sendTelegram(user.telegram_id, `<b>${escapeHtml(subject)}</b>\n\n${escapeHtml(body)}`)
          .then(r => { delivery.telegram = r; })
      : Promise.resolve(),

    channels.includes('whatsapp')
      ? (() => {
          const phone = user?.telephone?.[0]?.phone;
          const cc    = user?.country?.phoneCode || '';
          const full  = phone ? `+${cc}${phone}`.replace(/\s+/g, '') : null;
          return full ? sendWhatsApp(full, text).then(r => { delivery.whatsapp = r; }) : Promise.resolve();
        })()
      : Promise.resolve(),
  ]);

  return delivery;
}

// ─── Notificar al administrador ───────────────────────────────────────────────
async function notifyAdmin(fromUser, subject, body) {
  const cfg         = await _getDbCfg();
  const adminEmail  = cfg.email?.admin_email || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  const adminTgId   = cfg.telegram?.admin_chat_id || process.env.ADMIN_TELEGRAM_ID;
  const appName     = cfg.email?.from_name || process.env.NAME_APP || 'SVION VPN';
  const clientName  = `${fromUser?.firstNames || ''} ${fromUser?.lastNames || ''}`.trim() || fromUser?.email || 'Cliente';

  const results = {};

  if (adminTgId) {
    const tgText =
      `📩 <b>Nuevo mensaje de cliente</b>\n\n` +
      `👤 <b>${escapeHtml(clientName)}</b> (${escapeHtml(fromUser?.email || '')})\n` +
      `📋 <b>Asunto:</b> ${escapeHtml(subject)}\n\n` +
      `${escapeHtml(body)}`;
    results.telegram = await sendTelegram(adminTgId, tgText);
  }

  if (adminEmail) {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1a1a2e;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;">📩 Nuevo mensaje de cliente — ${appName}</h2>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
          <table style="font-size:14px;color:#374151;margin-bottom:16px;">
            <tr><td style="padding-right:12px;font-weight:bold;">Cliente:</td><td>${escapeHtml(clientName)}</td></tr>
            <tr><td style="font-weight:bold;">Email:</td><td>${escapeHtml(fromUser?.email || '—')}</td></tr>
            <tr><td style="font-weight:bold;">Asunto:</td><td>${escapeHtml(subject)}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
          <div style="color:#374151;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="color:#9ca3af;font-size:12px;">Responde desde el Panel → Mensajes.</p>
        </div>
      </div>`;
    try {
      if (cfg.email?.user && cfg.email?.pass) {
        await sendMailHtmlWithConfig(cfg.email, adminEmail, `[${appName}] Mensaje de ${clientName}: ${subject}`, html);
      } else {
        await sendMailHtml(adminEmail, `[${appName}] Mensaje de ${clientName}: ${subject}`, html);
      }
      results.email = { sent: true };
    } catch (err) {
      results.email = { sent: false, error: err.message };
    }
  }

  return results;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendTelegram, sendWhatsApp, sendEmail, notifyUser, notifyAdmin };
