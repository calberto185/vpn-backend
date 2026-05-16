/**
 * messageSendService.js
 *
 * Core send logic shared between the HTTP controller and the WebSocket handler.
 * Avoids duplicating DB/notify logic in two places.
 *
 * Circular-dep note: wsService ← messageSendService ← wsService
 * This is safe because the require inside the functions is called lazily
 * (after module initialisation is complete on both sides).
 */

const { getDB, nameCollections } = require('./dbServices');
const { notifyUser, notifyAdmin } = require('../shared/notifyService');

function newId() {
  try { return require('uuid').v4(); } catch { return require('crypto').randomUUID(); }
}

// Lazy-require to avoid circular dependency at load time
function ws() { return require('./wsService'); }

async function getUserById(id) {
  const db = getDB();
  return db.collection(nameCollections.admin).findOne({ id }, { projection: { password: 0 } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin → Client(s)
// ─────────────────────────────────────────────────────────────────────────────
async function adminSendMessage(senderId, payload) {
  const {
    to, to_label, subject, body,
    channels = ['in_app'], reply_to_id, attachments = [],
  } = payload;

  if (!subject?.trim())                   throw Object.assign(new Error('sin_asunto'),      { code: 'sin_asunto' });
  if (!body?.trim() && !attachments.length) throw Object.assign(new Error('sin_cuerpo'),    { code: 'sin_cuerpo' });
  if (!to)                                throw Object.assign(new Error('sin_destinatario'),{ code: 'sin_destinatario' });

  const db        = getDB();
  const admin     = await getUserById(senderId);
  const adminName = admin ? `${admin.firstNames} ${admin.lastNames}`.trim() : 'Administrador';

  let recipients = [];
  if (to === 'all') {
    recipients = await db.collection(nameCollections.admin)
      .find({ isAdmin: false, state: 'Activo' }, { projection: { password: 0 } })
      .toArray();
  } else if (Array.isArray(to)) {
    recipients = await db.collection(nameCollections.admin)
      .find({ id: { $in: to }, isAdmin: false }, { projection: { password: 0 } })
      .toArray();
  } else {
    throw Object.assign(new Error('destinatario_invalido'), { code: 'destinatario_invalido' });
  }

  if (!recipients.length)
    throw Object.assign(new Error('sin_destinatarios_validos'), { code: 'sin_destinatarios_validos' });

  // Resolve thread_id for threaded conversations
  let thread_id = null;
  if (reply_to_id) {
    const original = await db.collection(nameCollections.messages).findOne({ id: reply_to_id });
    thread_id = original?.thread_id || original?.id || null;
  }

  const now   = new Date();
  const msgId = newId();
  const msg   = {
    id:          msgId,
    thread_id:   thread_id || msgId,
    reply_to_id: reply_to_id || null,
    type:        'admin_to_client',
    from_id:     senderId,
    from_name:   adminName,
    to:          to === 'all' ? 'all' : recipients.map(r => r.id),
    to_label:    to_label || (to === 'all' ? 'Todos los clientes' : `${recipients.length} clientes`),
    subject:     subject.trim(),
    body:        (body || '').trim(),
    attachments: Array.isArray(attachments) ? attachments : [],
    channels,
    delivery:    { email: { sent: false }, telegram: { sent: false }, whatsapp: { sent: false } },
    read_by:     [],
    createdAt:   now,
    updatedAt:   now,
  };

  await db.collection(nameCollections.messages).insertOne(msg);
  console.log(`[adminSendMessage] saved msg id=${msg.id} type=${msg.type} to=${JSON.stringify(msg.to)} reply_to_id=${msg.reply_to_id} recipients=${recipients.length}`);

  // Notify recipients via WS (real-time inbox update)
  const socketPayload = {
    message_id:  msg.id,
    thread_id:   msg.thread_id,
    reply_to_id: msg.reply_to_id,
    from_name:   adminName,
    subject:     msg.subject,
    preview:     msg.body.slice(0, 100),
    createdAt:   msg.createdAt,
  };
  recipients.forEach(r => ws().emitToUser(r.id, 'messages:new-for-user', socketPayload));

  // External notifications (async — does not block the response)
  Promise.all(recipients.map(user => notifyUser(user, subject.trim(), body.trim(), channels)))
    .then(results => {
      const summary = { email: false, telegram: false, whatsapp: false };
      results.forEach(r => {
        if (r.email?.sent)    summary.email    = true;
        if (r.telegram?.sent) summary.telegram = true;
        if (r.whatsapp?.sent) summary.whatsapp = true;
      });
      db.collection(nameCollections.messages).updateOne(
        { id: msg.id },
        { $set: {
            'delivery.email.sent':    summary.email,
            'delivery.telegram.sent': summary.telegram,
            'delivery.whatsapp.sent': summary.whatsapp,
            updatedAt: new Date(),
          }
        }
      );
    })
    .catch(err => console.error('[messageSendService] adminSend notify error:', err.message));

  return { id: msg.id, recipients: recipients.length, msg };
}

// ─────────────────────────────────────────────────────────────────────────────
// Client → Admin
// ─────────────────────────────────────────────────────────────────────────────
async function clientSendMessage(senderId, payload) {
  const { subject, body, reply_to_id, attachments = [] } = payload;

  if (!subject?.trim())                   throw Object.assign(new Error('sin_asunto'),  { code: 'sin_asunto' });
  if (!body?.trim() && !attachments.length) throw Object.assign(new Error('sin_cuerpo'),{ code: 'sin_cuerpo' });

  const db   = getDB();
  const user = await getUserById(senderId);
  if (!user) throw Object.assign(new Error('usuario_no_encontrado'), { code: 'usuario_no_encontrado' });

  const clientName = `${user.firstNames} ${user.lastNames}`.trim();

  // Resolve thread_id
  let thread_id = null;
  if (reply_to_id) {
    const original = await db.collection(nameCollections.messages).findOne({ id: reply_to_id });
    thread_id = original?.thread_id || original?.id || null;
  }

  // Find active soporte users as recipients
  const soporteUsers = await db.collection(nameCollections.admin)
    .find({ role: { $regex: /^soporte$/i }, state: 'Activo' }, { projection: { id: 1 } })
    .toArray();
  const soporteIds = soporteUsers.map(u => u.id);

  const now   = new Date();
  const msgId = newId();
  const msg   = {
    id:          msgId,
    thread_id:   thread_id || msgId,
    reply_to_id: reply_to_id || null,
    type:        'client_to_admin',
    from_id:     senderId,
    from_name:   clientName,
    to:          soporteIds,
    to_label:    'Soporte',
    subject:     subject.trim(),
    body:        (body || '').trim(),
    attachments: Array.isArray(attachments) ? attachments : [],
    channels:    ['in_app'],
    delivery:    { email: { sent: false }, telegram: { sent: false }, whatsapp: { sent: false } },
    read_by:     [],
    createdAt:   now,
    updatedAt:   now,
  };

  await db.collection(nameCollections.messages).insertOne(msg);

  // Notify soporte users via WS; fallback to all admins if none found
  const wsPayload = {
    message_id:  msg.id,
    thread_id:   msg.thread_id,
    reply_to_id: msg.reply_to_id,
    from_id:     senderId,
    from_name:   clientName,
    subject:     msg.subject,
    preview:     msg.body.slice(0, 100),
    createdAt:   msg.createdAt,
  };
  if (soporteIds.length > 0) {
    soporteIds.forEach(uid => ws().emitToUser(uid, 'messages:new-for-admin', wsPayload));
  } else {
    ws().emitToAdmins('messages:new-for-admin', wsPayload);
  }

  // External admin notifications (async)
  notifyAdmin(user, subject.trim(), body.trim())
    .then(results => {
      db.collection(nameCollections.messages).updateOne(
        { id: msg.id },
        { $set: {
            'delivery.email.sent':    results.email?.sent    || false,
            'delivery.telegram.sent': results.telegram?.sent || false,
            updatedAt: new Date(),
          }
        }
      );
    })
    .catch(err => console.error('[messageSendService] clientSend notify error:', err.message));

  return { id: msg.id, msg };
}

module.exports = { adminSendMessage, clientSendMessage };
