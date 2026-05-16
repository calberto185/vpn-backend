/**
 * messagesController.js
 *
 * Gestión de mensajes entre administrador y clientes.
 *
 * Rutas Admin (/api/messages/admin/*) — requieren JWT de admin:
 *   GET  /inbox         → mensajes recibidos de clientes
 *   GET  /sent          → mensajes enviados por el admin
 *   GET  /unread-count  → cantidad de no leídos en inbox
 *   POST /send          → enviar mensaje a 1, varios o todos los clientes
 *   POST /mark-read/:id → marcar mensaje como leído
 *
 * Rutas Cliente (/api/messages/client/*) — requieren JWT de cliente:
 *   GET  /inbox         → mensajes recibidos del admin
 *   GET  /unread-count  → cantidad de no leídos
 *   POST /send          → enviar consulta al admin
 *   POST /mark-read/:id → marcar mensaje como leído
 */

const { v4: uuidv4 }    = require('crypto').webcrypto
  ? (() => { try { return require('uuid'); } catch { return { v4: () => require('crypto').randomUUID() }; } })()
  : { v4: () => require('crypto').randomUUID() };

const { getDB, nameCollections } = require('../services/dbServices');
const { notifyUser, notifyAdmin }= require('../shared/notifyService');
const { emitToAdmins, emitToUser } = require('../services/wsService');

// ─── Helper UUID ──────────────────────────────────────────────────────────────
function newId() {
  try { return require('uuid').v4(); } catch { return require('crypto').randomUUID(); }
}

// ─── Helper: obtener un usuario por ID ────────────────────────────────────────
async function getUserById(id) {
  const db = getDB();
  return db.collection(nameCollections.admin).findOne({ id }, { projection: { password: 0 } });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — ENVIAR MENSAJE
// POST /api/messages/admin/send
// Body: { to: "all" | string[], to_label?, subject, body, channels[] }
// ═══════════════════════════════════════════════════════════════════════════════
async function adminSend(req, res) {
  try {
    const { to, to_label, subject, body, channels = ['in_app'], reply_to_id, attachments = [] } = req.body;
    if (!subject?.trim())                  return res.status(400).json({ code: 'sin_asunto' });
    if (!body?.trim() && !attachments.length) return res.status(400).json({ code: 'sin_cuerpo' });
    if (!to)                               return res.status(400).json({ code: 'sin_destinatario' });

    const db        = getDB();
    const admin     = await getUserById(req.user.id);
    const adminName = admin ? `${admin.firstNames} ${admin.lastNames}`.trim() : 'Administrador';

    // Resolver lista de destinatarios
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
      return res.status(400).json({ code: 'destinatario_invalido' });
    }

    if (!recipients.length) {
      return res.status(404).json({ code: 'sin_destinatarios_validos' });
    }

    // Resolver thread_id para hilos de conversación
    let thread_id = null;
    if (reply_to_id) {
      const original = await db.collection(nameCollections.messages).findOne({ id: reply_to_id });
      thread_id = original?.thread_id || original?.id || null;
    }

    const now = new Date();
    const msgId = newId();
    const msg = {
      id:           msgId,
      thread_id:    thread_id || msgId,  // root of new thread if no reply
      reply_to_id:  reply_to_id || null,
      type:         'admin_to_client',
      from_id:      req.user.id,
      from_name:    adminName,
      to:           to === 'all' ? 'all' : recipients.map(r => r.id),
      to_label:     to_label || (to === 'all' ? 'Todos los clientes' : `${recipients.length} clientes`),
      subject:      subject.trim(),
      body:         (body || '').trim(),
      attachments:  Array.isArray(attachments) ? attachments : [],
      channels,
      delivery:     { email: { sent: false }, telegram: { sent: false }, whatsapp: { sent: false } },
      read_by:      [],
      createdAt:    now,
      updatedAt:    now,
    };

    await db.collection(nameCollections.messages).insertOne(msg);

    // Notificar en tiempo real a cada destinatario (socket)
    const recipientIds = to === 'all' ? recipients.map(r => r.id) : recipients.map(r => r.id);
    const socketPayload = {
      message_id:  msg.id,
      thread_id:   msg.thread_id,
      reply_to_id: msg.reply_to_id,
      from_name:   adminName,
      subject:     msg.subject,
      preview:     msg.body.slice(0, 100),
      createdAt:   msg.createdAt,
    };
    recipientIds.forEach(uid => emitToUser(uid, 'messages:new-for-user', socketPayload));

    // Enviar notificaciones externas (async, no bloquea respuesta)
    const deliverySummary = { email: [], telegram: [], whatsapp: [] };

    for (const user of recipients) {
      const result = await notifyUser(user, subject.trim(), body.trim(), channels);
      if (result.email?.sent)    deliverySummary.email.push(user.id);
      if (result.telegram?.sent) deliverySummary.telegram.push(user.id);
      if (result.whatsapp?.sent) deliverySummary.whatsapp.push(user.id);
    }

    // Actualizar resumen de entrega en el mensaje
    await db.collection(nameCollections.messages).updateOne(
      { id: msg.id },
      {
        $set: {
          'delivery.email.sent':    deliverySummary.email.length > 0,
          'delivery.telegram.sent': deliverySummary.telegram.length > 0,
          'delivery.whatsapp.sent': deliverySummary.whatsapp.length > 0,
          updatedAt: new Date(),
        }
      }
    );

    return res.status(201).json({
      code: 'enviado',
      data: {
        id:         msg.id,
        recipients: recipients.length,
        delivery:   deliverySummary,
      },
    });
  } catch (err) {
    console.error('messagesController.adminSend:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — BANDEJA DE ENTRADA (mensajes de clientes)
// GET /api/messages/admin/inbox?page=1&limit=20
// ═══════════════════════════════════════════════════════════════════════════════
async function adminInbox(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const skip  = (page - 1) * limit;
    const uid   = req.user.id;

    const db = getDB();
    // Only show root messages directed to this user (or legacy messages with empty to[])
    const inboxFilter = {
      type:        'client_to_admin',
      reply_to_id: null,
      $or:         [{ to: [] }, { to: uid }],
    };
    const [messages, total] = await Promise.all([
      db.collection(nameCollections.messages)
        .find(inboxFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(nameCollections.messages)
        .countDocuments(inboxFilter),
    ]);

    return res.status(200).json({ code: 'consultado', data: messages, total, page, limit });
  } catch (err) {
    console.error('messagesController.adminInbox:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — MENSAJES ENVIADOS
// GET /api/messages/admin/sent?page=1&limit=20
// ═══════════════════════════════════════════════════════════════════════════════
async function adminSent(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const skip  = (page - 1) * limit;

    const db = getDB();
    const [messages, total] = await Promise.all([
      db.collection(nameCollections.messages)
        .find({ type: 'admin_to_client', from_id: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(nameCollections.messages)
        .countDocuments({ type: 'admin_to_client', from_id: req.user.id }),
    ]);

    return res.status(200).json({ code: 'consultado', data: messages, total, page, limit });
  } catch (err) {
    console.error('messagesController.adminSent:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — CONTEO DE NO LEÍDOS
// GET /api/messages/admin/unread-count
// ═══════════════════════════════════════════════════════════════════════════════
async function adminUnreadCount(req, res) {
  try {
    const uid = req.user.id;
    const db  = getDB();
    // Count only root unread messages directed to this user (or legacy empty-to messages)
    const count = await db.collection(nameCollections.messages).countDocuments({
      type:        'client_to_admin',
      reply_to_id: null,
      $or:         [{ to: [] }, { to: uid }],
      read_by:     { $nin: [uid] },
    });
    return res.status(200).json({ code: 'consultado', data: { count } });
  } catch (err) {
    console.error('messagesController.adminUnreadCount:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — MARCAR COMO LEÍDO
// POST /api/messages/admin/mark-read/:id
// ═══════════════════════════════════════════════════════════════════════════════
async function adminMarkRead(req, res) {
  try {
    const db = getDB();
    await db.collection(nameCollections.messages).updateOne(
      { id: req.params.id },
      { $addToSet: { read_by: req.user.id }, $set: { updatedAt: new Date() } }
    );
    return res.status(200).json({ code: 'actualizado' });
  } catch (err) {
    console.error('messagesController.adminMarkRead:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — OBTENER LISTA DE CLIENTES (para selector de destinatarios)
// GET /api/messages/admin/clients
// ═══════════════════════════════════════════════════════════════════════════════
async function adminGetClients(req, res) {
  try {
    const db = getDB();
    const clients = await db.collection(nameCollections.admin)
      .find({ isAdmin: false }, { projection: { id: 1, firstNames: 1, lastNames: 1, email: 1, state: 1, tags: 1 } })
      .sort({ firstNames: 1 })
      .toArray();
    return res.status(200).json({ code: 'consultado', data: clients });
  } catch (err) {
    console.error('messagesController.adminGetClients:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — ENVIAR MENSAJE AL ADMIN
// POST /api/messages/client/send
// Body: { subject, body }
// ═══════════════════════════════════════════════════════════════════════════════
async function clientSend(req, res) {
  try {
    const { subject, body, reply_to_id, attachments = [] } = req.body;
    if (!subject?.trim())                     return res.status(400).json({ code: 'sin_asunto' });
    if (!body?.trim() && !attachments.length) return res.status(400).json({ code: 'sin_cuerpo' });

    const db   = getDB();
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ code: 'usuario_no_encontrado' });

    const clientName = `${user.firstNames} ${user.lastNames}`.trim();

    // Resolver thread_id para hilos de conversación
    let thread_id = null;
    if (reply_to_id) {
      const original = await db.collection(nameCollections.messages).findOne({ id: reply_to_id });
      thread_id = original?.thread_id || original?.id || null;
    }

    // Buscar usuarios con rol 'soporte' (activos) como destinatarios
    const soporteUsers = await db.collection(nameCollections.admin)
      .find({ role: { $regex: /^soporte$/i }, state: 'Activo' }, { projection: { id: 1, firstNames: 1, lastNames: 1, email: 1 } })
      .toArray();
    const soporteIds = soporteUsers.map(u => u.id);

    const now   = new Date();
    const msgId = newId();
    const msg = {
      id:          msgId,
      thread_id:   thread_id || msgId,
      reply_to_id: reply_to_id || null,
      type:        'client_to_admin',
      from_id:     req.user.id,
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

    // Notificar en tiempo real solo a usuarios de soporte conectados
    const wsPayload = {
      message_id:  msg.id,
      thread_id:   msg.thread_id,
      reply_to_id: msg.reply_to_id,
      from_id:     req.user.id,
      from_name:   clientName,
      subject:     msg.subject,
      preview:     msg.body.slice(0, 100),
      createdAt:   msg.createdAt,
    };
    if (soporteIds.length > 0) {
      soporteIds.forEach(uid => emitToUser(uid, 'messages:new-for-admin', wsPayload));
    } else {
      // Fallback: si no hay soporte activo, notificar a todos los admins
      emitToAdmins('messages:new-for-admin', wsPayload);
    }

    // Notificar al admin por email/telegram (async, no bloquea respuesta)
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
      .catch(err => console.error('clientSend notify admin error:', err.message));

    return res.status(201).json({ code: 'enviado', data: { id: msg.id } });
  } catch (err) {
    console.error('messagesController.clientSend:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — BANDEJA DE ENTRADA
// GET /api/messages/client/inbox?page=1&limit=20
// ═══════════════════════════════════════════════════════════════════════════════
async function clientInbox(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const skip  = (page - 1) * limit;
    const uid   = req.user.id;

    const db = getDB();
    // Only show root messages — replies are visible inside the thread view
    // MongoDB: { to: uid } matches both string equality and array element membership
    const filter = {
      type:        'admin_to_client',
      reply_to_id: null,
      $or: [{ to: 'all' }, { to: uid }],
    };

    // ── DEBUG: remove after confirming flow works ─────────────────────────────
    const allAdminMsgs = await db.collection(nameCollections.messages)
      .find({ type: 'admin_to_client' })
      .sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`[clientInbox] uid=${uid}`);
    console.log(`[clientInbox] all admin_to_client in DB (last 5):`,
      allAdminMsgs.map(m => ({ id: m.id, to: m.to, reply_to_id: m.reply_to_id, subject: m.subject })));
    // ─────────────────────────────────────────────────────────────────────────

    const [messages, total] = await Promise.all([
      db.collection(nameCollections.messages)
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(nameCollections.messages).countDocuments(filter),
    ]);

    console.log(`[clientInbox] filter matched ${total} messages for uid=${uid}`);
    return res.status(200).json({ code: 'consultado', data: messages, total, page, limit });
  } catch (err) {
    console.error('messagesController.clientInbox:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — MIS CONSULTAS ENVIADAS
// GET /api/messages/client/sent?page=1&limit=20
// ═══════════════════════════════════════════════════════════════════════════════
async function clientSent(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const skip  = (page - 1) * limit;

    const db = getDB();
    const [messages, total] = await Promise.all([
      db.collection(nameCollections.messages)
        .find({ type: 'client_to_admin', from_id: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(nameCollections.messages)
        .countDocuments({ type: 'client_to_admin', from_id: req.user.id }),
    ]);

    return res.status(200).json({ code: 'consultado', data: messages, total, page, limit });
  } catch (err) {
    console.error('messagesController.clientSent:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — CONTEO DE NO LEÍDOS
// GET /api/messages/client/unread-count
// ═══════════════════════════════════════════════════════════════════════════════
async function clientUnreadCount(req, res) {
  try {
    const uid = req.user.id;
    const db  = getDB();
    // Count only root unread messages so the badge matches the inbox list
    const count = await db.collection(nameCollections.messages).countDocuments({
      type:        'admin_to_client',
      reply_to_id: null,
      $or:         [{ to: 'all' }, { to: uid }],
      read_by:     { $nin: [uid] },
    });
    return res.status(200).json({ code: 'consultado', data: { count } });
  } catch (err) {
    console.error('messagesController.clientUnreadCount:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — MARCAR COMO LEÍDO
// POST /api/messages/client/mark-read/:id
// ═══════════════════════════════════════════════════════════════════════════════
async function clientMarkRead(req, res) {
  try {
    const uid = req.user.id;
    const db  = getDB();
    await db.collection(nameCollections.messages).updateOne(
      { id: req.params.id },
      { $addToSet: { read_by: uid }, $set: { updatedAt: new Date() } }
    );
    return res.status(200).json({ code: 'actualizado' });
  } catch (err) {
    console.error('messagesController.clientMarkRead:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — PREVIEW para la campana (últimos 5 no leídos)
// GET /api/messages/client/preview
// ═══════════════════════════════════════════════════════════════════════════════
async function clientPreview(req, res) {
  try {
    const uid = req.user.id;
    const db  = getDB();
    const messages = await db.collection(nameCollections.messages)
      .find({
        type:    'admin_to_client',
        $or:     [{ to: 'all' }, { to: uid }],
        read_by: { $nin: [uid] },
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ id: 1, subject: 1, body: 1, from_name: 1, createdAt: 1 })
      .toArray();
    return res.status(200).json({ code: 'consultado', data: messages });
  } catch (err) {
    console.error('messagesController.clientPreview:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — MENSAJES RECIBIDOS (enviados por el admin principal a este usuario)
// GET /api/messages/admin/received?page=1&limit=20
// ═══════════════════════════════════════════════════════════════════════════════
async function adminReceived(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const skip  = (page - 1) * limit;
    const uid   = req.user.id;

    const db = getDB();
    const filter = {
      type:        'admin_to_client',
      reply_to_id: null,
      $or:         [{ to: 'all' }, { to: uid }],
    };

    const [messages, total] = await Promise.all([
      db.collection(nameCollections.messages)
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection(nameCollections.messages).countDocuments(filter),
    ]);

    return res.status(200).json({ code: 'consultado', data: messages, total, page, limit });
  } catch (err) {
    console.error('messagesController.adminReceived:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — CONTEO DE NO LEÍDOS EN RECIBIDOS
// GET /api/messages/admin/received-unread-count
// ═══════════════════════════════════════════════════════════════════════════════
async function adminReceivedUnreadCount(req, res) {
  try {
    const uid   = req.user.id;
    const db    = getDB();
    const count = await db.collection(nameCollections.messages).countDocuments({
      type:        'admin_to_client',
      reply_to_id: null,
      $or:         [{ to: 'all' }, { to: uid }],
      read_by:     { $nin: [uid] },
    });
    return res.status(200).json({ code: 'consultado', data: { count } });
  } catch (err) {
    console.error('messagesController.adminReceivedUnreadCount:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — PREVIEW para la campana (últimos 5 no leídos de clientes)
// GET /api/messages/admin/preview
// ═══════════════════════════════════════════════════════════════════════════════
async function adminPreview(req, res) {
  try {
    const uid = req.user.id;
    const db  = getDB();
    const messages = await db.collection(nameCollections.messages)
      .find({
        type:    'client_to_admin',
        $or:     [{ to: [] }, { to: uid }],
        read_by: { $nin: [uid] },
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ id: 1, subject: 1, body: 1, from_name: 1, from_id: 1, createdAt: 1 })
      .toArray();
    return res.status(200).json({ code: 'consultado', data: messages });
  } catch (err) {
    console.error('messagesController.adminPreview:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — HILO DE CONVERSACIÓN
// GET /api/messages/admin/thread/:id
// ═══════════════════════════════════════════════════════════════════════════════
async function adminGetThread(req, res) {
  try {
    const db  = getDB();
    const root = await db.collection(nameCollections.messages).findOne({ id: req.params.id });
    if (!root) return res.status(404).json({ code: 'not_found' });

    const thread_id = root.thread_id || root.id;
    const messages  = await db.collection(nameCollections.messages)
      .find({ thread_id })
      .sort({ createdAt: 1 })
      .toArray();

    return res.status(200).json({ code: 'consultado', data: messages });
  } catch (err) {
    console.error('messagesController.adminGetThread:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTE — HILO DE CONVERSACIÓN
// GET /api/messages/client/thread/:id
// ═══════════════════════════════════════════════════════════════════════════════
async function clientGetThread(req, res) {
  try {
    const uid = req.user.id;
    const db  = getDB();
    const root = await db.collection(nameCollections.messages).findOne({ id: req.params.id });
    if (!root) return res.status(404).json({ code: 'not_found' });

    const thread_id = root.thread_id || root.id;
    // Solo mensajes que el cliente puede ver: suyos (client_to_admin) o del admin dirigidos a él
    const messages = await db.collection(nameCollections.messages)
      .find({
        thread_id,
        $or: [
          { type: 'client_to_admin', from_id: uid },
          { type: 'admin_to_client', $or: [{ to: 'all' }, { to: uid }] },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();

    return res.status(200).json({ code: 'consultado', data: messages });
  } catch (err) {
    console.error('messagesController.clientGetThread:', err);
    return res.status(500).json({ code: 'error', message: err.message });
  }
}

module.exports = {
  adminSend,
  adminInbox,
  adminSent,
  adminUnreadCount,
  adminMarkRead,
  adminGetClients,
  adminPreview,
  adminGetThread,
  adminReceived,
  adminReceivedUnreadCount,
  clientSend,
  clientInbox,
  clientSent,
  clientUnreadCount,
  clientMarkRead,
  clientPreview,
  clientGetThread,
};
