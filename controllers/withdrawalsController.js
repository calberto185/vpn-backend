/**
 * withdrawalsController.js — CRUD + firma digital + notificaciones
 */
const crypto  = require('crypto');
const { getDB, nameCollections } = require('../services/dbServices');
const WithdrawalModel = require('../models/withdrawalModel');
const { v4: uuidv4 }  = require('uuid');
const { sendMail }    = require('../shared/mailer');
const { emitToAdmins } = require('../services/wsService');

const col     = () => getDB().collection(nameCollections.withdrawals);
const admCol  = () => getDB().collection(nameCollections.admin);
const supCol  = () => getDB().collection(nameCollections.suppliers);
const setCol  = () => getDB().collection(nameCollections.settings);

const VALID_TYPES   = ['employee_payment','client_refund','client_loan','office_expense','tax_payment','other'];
const VALID_STATES  = ['pending','completed','cancelled'];
const VALID_METHODS = ['bank_transfer','crypto','card','cash','other'];

const SIGN_KEY = process.env.WITHDRAWAL_SIGN_KEY || 'wd-sign-secret-v1';

/* ─── Digital Signature ──────────────────────────────────────────────────────── */
function signDoc(doc) {
  const ts = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt || '');
  const payload = `${doc.id}|${doc.amount}|${doc.currency}|${doc.recipient}|${doc.concept}|${ts}`;
  return crypto.createHmac('sha256', SIGN_KEY).update(payload).digest('hex').toUpperCase();
}

/* ─── Auto-increment reference (atomic via settings counter) ─────────────────── */
async function getNextRef() {
  const year = new Date().getFullYear();
  const key  = `wd_counter_${year}`;
  const res  = await setCol().findOneAndUpdate(
    { key },
    { $inc: { counter: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const num = res?.counter ?? 1;
  return `WD-${year}-${String(num).padStart(4, '0')}`;
}

/* ─── Type & method labels ───────────────────────────────────────────────────── */
const TYPE_LABELS   = { employee_payment:'Pago a empleado', client_refund:'Devolución a cliente', client_loan:'Préstamo a cliente', office_expense:'Gasto de oficina', tax_payment:'Pago de impuesto', other:'Otro' };
const METHOD_LABELS = { bank_transfer:'Transferencia bancaria', crypto:'Criptomoneda', card:'Tarjeta', cash:'Efectivo', other:'Otro' };
const STATE_LABELS  = { pending:'Pendiente', completed:'Completado', cancelled:'Cancelado' };

/* ─── LIST  POST /api/withdrawals/get ──────────────────────────────────────── */
async function list(req, res) {
  try {
    const { type, state, period, year, recipientId } = req.body || {};
    const filter = {};
    if (type)        filter.type        = type;
    if (state)       filter.state       = state;
    if (period)      filter.period      = period;
    if (year)        filter.period      = { $regex: `^${year}-` };
    if (recipientId) filter.recipientId = recipientId;
    const data = await col().find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ status: 200, data });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener retiros', error: err.message });
  }
}

/* ─── GET ONE  GET /api/withdrawals/:id ─────────────────────────────────────── */
async function getOne(req, res) {
  try {
    const doc = await col().findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ status: 404, message: 'Retiro no encontrado' });
    res.json({ status: 200, data: doc });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener retiro', error: err.message });
  }
}

/* ─── CREATE  POST /api/withdrawals ─────────────────────────────────────────── */
async function create(req, res) {
  try {
    const {
      type, recipient, recipientId, concept,
      amount, currency, method, reference,
      period, executedAt, state, attachmentUrl, notes,
    } = req.body;

    if (!recipient || !recipient.trim())
      return res.status(400).json({ status: 400, message: 'recipient es requerido' });
    if (!concept || !concept.trim())
      return res.status(400).json({ status: 400, message: 'concept es requerido' });
    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0)
      return res.status(400).json({ status: 400, message: 'amount debe ser mayor que 0' });

    // Auto-generate reference if not provided
    const finalRef = (reference || '').trim() || await getNextRef();

    const doc = new WithdrawalModel();
    doc.id            = uuidv4();
    doc.type          = VALID_TYPES.includes(type) ? type : 'other';
    doc.recipient     = recipient.trim();
    doc.recipientId   = recipientId || null;
    doc.concept       = concept.trim();
    doc.amount        = Number(amount);
    doc.currency      = currency || 'USD';
    doc.method        = VALID_METHODS.includes(method) ? method : 'cash';
    doc.reference     = finalRef;
    doc.period        = period || new Date().toISOString().slice(0, 7);
    doc.executedAt    = executedAt ? new Date(executedAt) : null;
    doc.state         = VALID_STATES.includes(state) ? state : 'pending';
    doc.attachmentUrl = (attachmentUrl || '').trim();
    doc.notes         = (notes || '').trim();
    doc.createdBy     = req.user?.id || '';
    doc.createdAt     = new Date();
    doc.updatedAt     = new Date();

    // Digital signature
    doc.signature  = signDoc(doc);
    doc.signedAt   = doc.createdAt.toISOString();

    await col().insertOne(doc);

    // Notificar admins en tiempo real
    try {
      emitToAdmins('withdrawal:new', {
        id:        doc.id,
        type:      doc.type,
        recipient: doc.recipient,
        amount:    doc.amount,
        currency:  doc.currency,
        state:     doc.state,
        createdAt: doc.createdAt,
      });
    } catch (_) {}

    res.status(201).json({ status: 201, data: doc });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al crear retiro', error: err.message });
  }
}

/* ─── UPDATE  PUT /api/withdrawals/:id ──────────────────────────────────────── */
async function update(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Retiro no encontrado' });

    const allowed = [
      'type','recipient','recipientId','concept',
      'amount','currency','method','reference',
      'period','executedAt','state','attachmentUrl','notes',
    ];

    const patch = { updatedAt: new Date() };
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'executedAt') {
          patch.executedAt = req.body.executedAt ? new Date(req.body.executedAt) : null;
        } else if (field === 'amount') {
          patch.amount = Number(req.body.amount) || 0;
        } else if (field === 'type') {
          patch.type = VALID_TYPES.includes(req.body.type) ? req.body.type : existing.type;
        } else if (field === 'state') {
          patch.state = VALID_STATES.includes(req.body.state) ? req.body.state : existing.state;
        } else if (field === 'method') {
          patch.method = VALID_METHODS.includes(req.body.method) ? req.body.method : existing.method;
        } else {
          patch[field] = req.body[field];
        }
      }
    }

    // Auto-set executedAt
    if (patch.state === 'completed' && !existing.executedAt && !patch.executedAt) {
      patch.executedAt = new Date();
    }

    // Re-sign if financial fields changed
    const merged = { ...existing, ...patch };
    patch.signature = signDoc({ ...merged, createdAt: existing.createdAt });
    patch.signedAt  = new Date().toISOString();

    await col().updateOne({ id: req.params.id }, { $set: patch });
    const updated = await col().findOne({ id: req.params.id });
    res.json({ status: 200, data: updated });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al actualizar retiro', error: err.message });
  }
}

/* ─── DELETE  DELETE /api/withdrawals/:id ──────────────────────────────────── */
async function remove(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Retiro no encontrado' });
    await col().deleteOne({ id: req.params.id });
    res.json({ status: 200, message: 'Retiro eliminado' });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al eliminar retiro', error: err.message });
  }
}

/* ─── NEXT REFERENCE  GET /api/withdrawals/next-reference ───────────────────── */
async function nextReference(req, res) {
  try {
    const ref = await getNextRef();
    res.json({ status: 200, data: { reference: ref } });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al generar referencia', error: err.message });
  }
}

/* ─── RECIPIENTS AUTOCOMPLETE  GET /api/withdrawals/recipients?q= ───────────── */
async function recipients(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const regex = q ? { $regex: q, $options: 'i' } : undefined;

    const [past, clients, suppliers] = await Promise.all([
      // Past withdrawal recipients
      col().aggregate([
        ...(regex ? [{ $match: { recipient: regex } }] : []),
        { $group: { _id: '$recipient', recipientId: { $first: '$recipientId' }, lastType: { $first: '$type' } } },
        { $sort: { _id: 1 } },
        { $limit: 6 },
      ]).toArray(),

      // Admin/clients
      admCol().aggregate([
        { $match: {
          isAdmin: false,
          ...(regex ? { $or: [{ firstNames: regex }, { lastNames: regex }, { email: regex }] } : {}),
        }},
        { $project: { id: 1, firstNames: 1, lastNames: 1, email: 1 } },
        { $limit: 5 },
      ]).toArray(),

      // Suppliers
      supCol().find(
        regex ? { name: regex } : {},
        { projection: { id: 1, name: 1 } }
      ).limit(5).toArray(),
    ]);

    const results = [];
    const seen = new Set();

    const add = (name, id, source, email) => {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name, id: id || null, source, email: email || null });
      }
    };

    for (const r of past)     add(r._id, r.recipientId, 'past', null);
    for (const c of clients)  add((`${c.firstNames || ''} ${c.lastNames || ''}`).trim() || c.email, c.id, 'client', c.email);
    for (const s of suppliers) add(s.name, s.id, 'supplier', null);

    res.json({ status: 200, data: results });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en autocompletado', error: err.message });
  }
}

/* ─── NOTIFY EMAIL  POST /api/withdrawals/:id/notify/email ──────────────────── */
async function notifyEmail(req, res) {
  try {
    const doc = await col().findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ status: 404, message: 'Retiro no encontrado' });

    const { to, customMessage } = req.body;
    if (!to) return res.status(400).json({ status: 400, message: 'to (email) es requerido' });

    const typeLabel   = TYPE_LABELS[doc.type]   || doc.type;
    const methodLabel = METHOD_LABELS[doc.method] || doc.method;
    const stateLabel  = STATE_LABELS[doc.state]  || doc.state;
    const date        = doc.executedAt
      ? new Date(doc.executedAt).toLocaleDateString('es-PE', { year:'numeric', month:'long', day:'numeric' })
      : new Date(doc.createdAt).toLocaleDateString('es-PE', { year:'numeric', month:'long', day:'numeric' });

    const subject = `Comprobante de retiro ${doc.reference} — ${doc.recipient}`;

    const text = `
Comprobante de Retiro de Dinero
================================
Referencia: ${doc.reference}
Fecha: ${date}
Estado: ${stateLabel}

Beneficiario: ${doc.recipient}
Tipo: ${typeLabel}
Concepto: ${doc.concept}
Monto: ${doc.currency} ${Number(doc.amount).toFixed(2)}
Método de pago: ${methodLabel}
Período: ${doc.period || '—'}
${doc.notes ? `Notas: ${doc.notes}` : ''}
${doc.reference ? `N.º Comprobante: ${doc.reference}` : ''}

— FIRMA DIGITAL —
Código de firma: ${doc.signature || 'N/A'}
Firmado: ${doc.signedAt || '—'}

${customMessage ? `\nMensaje adicional:\n${customMessage}` : ''}

Este comprobante fue generado automáticamente por el sistema.
    `.trim();

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:#1e293b;color:#fff;padding:20px 24px">
    <h2 style="margin:0;font-size:18px">Comprobante de Retiro de Dinero</h2>
    <p style="margin:4px 0 0;opacity:.7;font-size:13px">Ref: ${doc.reference}</p>
  </div>
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280;width:40%">Beneficiario</td><td style="padding:6px 0;font-weight:600">${doc.recipient}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Tipo</td><td style="padding:6px 0">${typeLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Concepto</td><td style="padding:6px 0">${doc.concept}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Monto</td><td style="padding:6px 0;font-weight:700;font-size:16px;color:#0f172a">${doc.currency} ${Number(doc.amount).toFixed(2)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Método</td><td style="padding:6px 0">${methodLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Estado</td><td style="padding:6px 0">${stateLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fecha</td><td style="padding:6px 0">${date}</td></tr>
      ${doc.notes ? `<tr><td style="padding:6px 0;color:#6b7280">Notas</td><td style="padding:6px 0">${doc.notes}</td></tr>` : ''}
    </table>
    ${customMessage ? `<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:6px;font-size:13px">${customMessage}</div>` : ''}
    <div style="margin-top:20px;padding:12px;background:#f1f5f9;border-radius:6px;font-size:11px;color:#64748b">
      <strong>Firma digital del sistema:</strong><br>
      <code style="word-break:break-all">${doc.signature || 'N/A'}</code>
    </div>
  </div>
  <div style="padding:12px 24px;background:#f8fafc;font-size:11px;color:#9ca3af;text-align:center">
    Generado automáticamente. No responder este correo.
  </div>
</div>`;

    await sendMail(to, subject, text, html);
    res.json({ status: 200, message: `Email enviado a ${to}` });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al enviar email', error: err.message });
  }
}

module.exports = { list, getOne, create, update, remove, nextReference, recipients, notifyEmail };
