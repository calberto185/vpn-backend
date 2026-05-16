/**
 * mailer.js — Servicio de email (nodemailer)
 *
 * Soporta dos modos según .env:
 *   EMAIL_PROVIDER=smtp  → servidor SMTP genérico (Gmail, Hostinger, etc.)
 *   EMAIL_PROVIDER=gmail → Gmail con OAuth2 App Password
 *
 * Variables requeridas en .env:
 *   EMAIL_HOST     smtp.gmail.com | smtp.hostinger.com
 *   EMAIL_PORT     465 (SSL) | 587 (STARTTLS)
 *   EMAIL_SECURE   true | false
 *   EMAIL_USER     tu@correo.com
 *   EMAIL_PASS     contraseña o App Password
 *   NAME_APP       SVION VPN
 */
const nodemailer = require("nodemailer");

let _transporter = null;

function _getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST   || "smtp.gmail.com",
    port:   parseInt(process.env.EMAIL_PORT || "465"),
    secure: process.env.EMAIL_SECURE !== "false", // true por defecto (SSL 465)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
  return _transporter;
}

/**
 * sendMail — Envía un email de texto plano
 * @param {string} to       - destinatario
 * @param {string} subject  - asunto
 * @param {string} text     - cuerpo texto plano
 * @param {string} [html]   - cuerpo HTML opcional
 */
async function sendMail(to, subject, text, html = null) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("[Mailer] EMAIL_USER o EMAIL_PASS no configurados — email omitido");
    return { skipped: true };
  }
  try {
    const info = await _getTransporter().sendMail({
      from:    `${process.env.NAME_APP || "SVION VPN"} <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      ...(html && { html }),
    });
    console.log(`[Mailer] ✅ Email enviado a ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[Mailer] ❌ Error enviando a ${to}:`, err.message);
    throw err; // relanzar para que el caller decida si es crítico
  }
}

/**
 * sendMailHtml — Envía un email con plantilla HTML
 */
async function sendMailHtml(to, subject, html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return sendMail(to, subject, text, html);
}

/**
 * sendMailHtmlWithConfig — Envía email con configuración dinámica (DB settings)
 * @param {object} cfg   - { host, port, secure, user, pass, from_name }
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
async function sendMailHtmlWithConfig(cfg, to, subject, html) {
  if (!cfg?.user || !cfg?.pass) {
    console.warn('[Mailer] Config dinámica incompleta — email omitido');
    return { skipped: true };
  }
  const transporter = nodemailer.createTransport({
    host:   cfg.host   || 'smtp.gmail.com',
    port:   cfg.port   || 465,
    secure: cfg.secure !== false,
    auth:   { user: cfg.user, pass: cfg.pass },
    tls:    { rejectUnauthorized: false },
  });
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const info = await transporter.sendMail({
    from:    `${cfg.from_name || cfg.user} <${cfg.user}>`,
    to,
    subject,
    text,
    html,
  });
  console.log(`[Mailer] ✅ (config dinámica) Email enviado a ${to}: ${info.messageId}`);
  return info;
}

/**
 * verifyConnection — Verifica la conexión SMTP (útil en startup)
 */
async function verifyConnection() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("[Mailer] Credenciales no configuradas — verificación omitida");
    return false;
  }
  try {
    await _getTransporter().verify();
    console.log("[Mailer] ✅ Conexión SMTP verificada");
    return true;
  } catch (err) {
    console.warn("[Mailer] ⚠️ SMTP no disponible:", err.message);
    return false;
  }
}

module.exports = { sendMail, sendMailHtml, sendMailHtmlWithConfig, verifyConnection };
