/**
 * supplierPaymentsController.js — CRUD + firma digital + notificaciones
 */
const crypto  = require('crypto');
const { getDB, nameCollections } = require('../services/dbServices');
const SupplierPaymentModel = require('../models/supplierPaymentModel');
const { v4: uuidv4 } = require('uuid');
const { sendMail }   = require('../shared/mailer');

const col     = () => getDB().collection(nameCollections.supplierPayments);
const supCol  = () => getDB().collection(nameCollections.suppliers);
const admCol  = () => getDB().collection(nameCollections.admin);
const setCol  = () => getDB().collection(nameCollections.settings);

const VALID_STATES   = ['pending', 'paid', 'overdue', 'cancelled'];
const VALID_METHODS  = ['bank_transfer', 'crypto', 'card', 'cash', 'other'];

const SIGN_KEY = process.env.SP_SIGN_KEY || 'sp-sign-secret-v1';

/* ─── Digital Signature ────────────────────────────────────────────────────── */
function signDoc(doc) {
  const ts = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt || '');
  const payload = `${doc.id}|${doc.amount}|${doc.currency}|${doc.supplierName}|${doc.concept}|${ts}`;
  return crypto.createHmac('sha256', SIGN_KEY).update(payload).digest('hex').toUpperCase();
}

/* ─── Auto-increment reference (atomic) ───────────────────────────────────── */
async function getNextRef() {
  const year = new Date().getFullYear();
  const key  = `sp_counter_${year}`;
  const res  = await setCol().findOneAndUpdate(
    { key },
    { $inc: { counter: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const num = res?.counter ?? 1;
  return `SP-${year}-${String(num).padStart(4, '0')}`;
}

/* ─── Labels ────────────────────────────────────────────────────────────────── */
const METHOD_LABELS = { bank_transfer: 'Transferencia bancaria', crypto: 'Criptomoneda', card: 'Tarjeta', cash: 'Efectivo', other: 'Otro' };
const STATE_LABELS  = { pending: 'Pendiente', paid: 'Pagado', overdue: 'Vencido', cancelled: 'Cancelado' };

/* ─── LIST  POST /api/supplier-payments/get ─────────────────────────────── */
async function list(req, res) {
  try {
    const { supplierId, state, period, year } = req.body || {};
    const filter = {};
    if (supplierId) filter.supplierId = supplierId;
    if (state)      filter.state = state;
    if (period)     filter.period = period;
    if (year)       filter.period = { $regex: `^${year}-` };

    const payments = await col().find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ status: 200, data: payments });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener pagos', error: err.message });
  }
}

/* ─── GET ONE  GET /api/supplier-payments/:id ───────────────────────────── */
async function getOne(req, res) {
  try {
    const payment = await col().findOne({ id: req.params.id });
    if (!payment) return res.status(404).json({ status: 404, message: 'Pago no encontrado' });
    res.json({ status: 200, data: payment });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener pago', error: err.message });
  }
}

/* ─── CREATE  POST /api/supplier-payments ───────────────────────────────── */
async function create(req, res) {
  try {
    const {
      supplierId, supplierName: rawSupplierName, recipientId,
      concept, category: rawCategory, serviceId, serviceName,
      amount, currency, method, reference,
      period, dueDate, paidAt, state, notes,
    } = req.body;

    if (!concept) return res.status(400).json({ status: 400, message: 'concept es requerido' });
    if (!amount)  return res.status(400).json({ status: 400, message: 'amount es requerido' });

    const VALID_CATEGORIES = ['infrastructure','hosting','bandwidth','software','marketing','telecom','other'];

    // Resolve beneficiary name and category
    let resolvedSupplierName = (rawSupplierName || '').trim();
    let resolvedSupplierId   = supplierId || null;
    let resolvedRecipientId  = recipientId || null;
    let resolvedCategory     = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'other';

    if (supplierId) {
      const supplier = await supCol().findOne({ id: supplierId });
      if (supplier) {
        resolvedSupplierName = supplier.name;
        resolvedSupplierId   = supplier.id;
        // Auto-inherit supplier category unless the body explicitly sent one
        if (!rawCategory && VALID_CATEGORIES.includes(supplier.category)) {
          resolvedCategory = supplier.category;
        }
      }
    }

    if (!resolvedSupplierName)
      return res.status(400).json({ status: 400, message: 'Nombre del beneficiario es requerido' });

    const finalRef = (reference || '').trim() || await getNextRef();

    const payment = new SupplierPaymentModel();
    payment.id           = uuidv4();
    payment.supplierId   = resolvedSupplierId;
    payment.supplierName = resolvedSupplierName;
    payment.recipientId  = resolvedRecipientId;
    payment.concept      = concept.trim();
    payment.category     = resolvedCategory;
    payment.serviceId    = serviceId || null;
    payment.serviceName  = (serviceName || '').trim();
    payment.amount       = Number(amount) || 0;
    payment.currency     = currency || 'USD';
    payment.method       = VALID_METHODS.includes(method) ? method : 'bank_transfer';
    payment.reference    = finalRef;
    payment.period       = period || new Date().toISOString().slice(0, 7);
    payment.dueDate      = dueDate ? new Date(dueDate) : null;
    payment.paidAt       = paidAt  ? new Date(paidAt)  : null;
    payment.state        = VALID_STATES.includes(state) ? state : 'pending';
    payment.notes        = (notes || '').trim();
    payment.createdAt    = new Date();
    payment.updatedAt    = new Date();

    // Digital signature
    payment.signature = signDoc(payment);
    payment.signedAt  = payment.createdAt.toISOString();

    await col().insertOne(payment);
    res.status(201).json({ status: 201, data: payment });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al crear pago', error: err.message });
  }
}

/* ─── UPDATE  PUT /api/supplier-payments/:id ────────────────────────────── */
async function update(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Pago no encontrado' });

    const VALID_CATEGORIES = ['infrastructure','hosting','bandwidth','software','marketing','telecom','other'];
    const allowed = [
      'concept', 'category', 'serviceId', 'serviceName', 'amount', 'currency', 'method',
      'reference', 'period', 'dueDate', 'paidAt', 'state', 'picture', 'notes',
      'supplierName', 'supplierId', 'recipientId',
    ];
    const patch = { updatedAt: new Date() };
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'dueDate' || field === 'paidAt') {
          patch[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === 'amount') {
          patch.amount = Number(req.body.amount) || 0;
        } else if (field === 'state') {
          patch.state = VALID_STATES.includes(req.body.state) ? req.body.state : existing.state;
        } else if (field === 'category') {
          patch.category = VALID_CATEGORIES.includes(req.body.category) ? req.body.category : (existing.category || 'other');
        } else if (field === 'method') {
          patch.method = VALID_METHODS.includes(req.body.method) ? req.body.method : existing.method;
        } else {
          patch[field] = req.body[field];
        }
      }
    }

    // Auto-set paidAt when transitioning to 'paid'
    if (patch.state === 'paid' && !existing.paidAt && !patch.paidAt) {
      patch.paidAt = new Date();
    }

    // Re-sign on every update
    const merged = { ...existing, ...patch };
    patch.signature = signDoc({ ...merged, createdAt: existing.createdAt });
    patch.signedAt  = new Date().toISOString();

    await col().updateOne({ id: req.params.id }, { $set: patch });
    const updated = await col().findOne({ id: req.params.id });
    res.json({ status: 200, data: updated });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al actualizar pago', error: err.message });
  }
}

/* ─── DELETE  DELETE /api/supplier-payments/:id ─────────────────────────── */
async function remove(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Pago no encontrado' });
    await col().deleteOne({ id: req.params.id });
    res.json({ status: 200, message: 'Pago eliminado' });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al eliminar pago', error: err.message });
  }
}

/* ─── NEXT REFERENCE  GET /api/supplier-payments/next-reference ─────────── */
async function nextReference(req, res) {
  try {
    const ref = await getNextRef();
    res.json({ status: 200, data: { reference: ref } });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al generar referencia', error: err.message });
  }
}

/* ─── RECIPIENTS AUTOCOMPLETE  GET /api/supplier-payments/recipients?q= ── */
async function recipients(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const regex = q ? { $regex: q, $options: 'i' } : undefined;

    const [past, suppliers, clients] = await Promise.all([
      // Past payment beneficiaries
      col().aggregate([
        ...(regex ? [{ $match: { supplierName: regex } }] : []),
        { $group: { _id: '$supplierName', supplierId: { $first: '$supplierId' }, recipientId: { $first: '$recipientId' } } },
        { $sort: { _id: 1 } },
        { $limit: 6 },
      ]).toArray(),

      // Suppliers catalog
      supCol().find(
        regex ? { name: regex } : {},
        { projection: { id: 1, name: 1, email: 1 } }
      ).limit(6).toArray(),

      // Admin / clients
      admCol().aggregate([
        { $match: {
          isAdmin: false,
          ...(regex ? { $or: [{ firstNames: regex }, { lastNames: regex }, { email: regex }] } : {}),
        }},
        { $project: { id: 1, firstNames: 1, lastNames: 1, email: 1 } },
        { $limit: 5 },
      ]).toArray(),
    ]);

    const results = [];
    const seen = new Set();

    const add = (name, supplierId, recipientId, source, email) => {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name, supplierId: supplierId || null, recipientId: recipientId || null, source, email: email || null });
      }
    };

    for (const r of past)      add(r._id, r.supplierId, r.recipientId, 'past', null);
    for (const s of suppliers) add(s.name, s.id, null, 'supplier', s.email || null);
    for (const c of clients) {
      const name = (`${c.firstNames || ''} ${c.lastNames || ''}`).trim() || c.email;
      add(name, null, c.id, 'client', c.email);
    }

    res.json({ status: 200, data: results });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en autocompletado', error: err.message });
  }
}

/* ─── NOTIFY EMAIL  POST /api/supplier-payments/:id/notify/email ─────────── */
async function notifyEmail(req, res) {
  try {
    const doc = await col().findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ status: 404, message: 'Pago no encontrado' });

    const { to, customMessage } = req.body;
    if (!to) return res.status(400).json({ status: 400, message: 'to (email) es requerido' });

    const methodLabel = METHOD_LABELS[doc.method] || doc.method;
    const stateLabel  = STATE_LABELS[doc.state]   || doc.state;
    const date        = doc.paidAt
      ? new Date(doc.paidAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date(doc.createdAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

    const subject = `Comprobante de pago ${doc.reference} — ${doc.supplierName}`;

    const text = `
Comprobante de Pago a Proveedor
================================
Referencia: ${doc.reference}
Fecha: ${date}
Estado: ${stateLabel}

Beneficiario: ${doc.supplierName}
Concepto: ${doc.concept}
Monto: ${doc.currency} ${Number(doc.amount).toFixed(2)}
Método de pago: ${methodLabel}
Período: ${doc.period || '—'}
${doc.notes ? `Notas: ${doc.notes}` : ''}

— FIRMA DIGITAL —
Código de firma: ${doc.signature || 'N/A'}
Firmado: ${doc.signedAt || '—'}

${customMessage ? `\nMensaje adicional:\n${customMessage}` : ''}

Este comprobante fue generado automáticamente por el sistema.
    `.trim();

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:#1e293b;color:#fff;padding:20px 24px">
    <h2 style="margin:0;font-size:18px">Comprobante de Pago a Proveedor</h2>
    <p style="margin:4px 0 0;opacity:.7;font-size:13px">Ref: ${doc.reference}</p>
  </div>
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280;width:40%">Beneficiario</td><td style="padding:6px 0;font-weight:600">${doc.supplierName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Concepto</td><td style="padding:6px 0">${doc.concept}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Monto</td><td style="padding:6px 0;font-weight:700;font-size:16px;color:#0f172a">${doc.currency} ${Number(doc.amount).toFixed(2)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Método</td><td style="padding:6px 0">${methodLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Estado</td><td style="padding:6px 0">${stateLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fecha</td><td style="padding:6px 0">${date}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Período</td><td style="padding:6px 0">${doc.period || '—'}</td></tr>
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

/* ─── Stats: count + amount grouped by supplierId ─────────────────────────── */
async function statsBySupplier(req, res) {
  try {
    const pipeline = [
      {
        $group: {
          _id:    '$supplierId',
          count:  { $sum: 1 },
          total:  { $sum: '$amount' },
          paid:   { $sum: { $cond: [{ $eq: ['$state', 'paid'] }, '$amount', 0] } },
          pending:{ $sum: { $cond: [{ $in: ['$state', ['pending', 'overdue']] }, 1, 0] } },
        },
      },
    ];
    const results = await col().aggregate(pipeline).toArray();
    // Build a map { supplierId: { count, total, paid, pending } }
    const map = {};
    for (const r of results) {
      if (r._id) map[r._id] = { count: r.count, total: r.total, paid: r.paid, pending: r.pending };
    }
    res.json({ status: 200, data: map });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al calcular estadísticas', error: err.message });
  }
}

module.exports = { list, getOne, create, update, remove, nextReference, recipients, notifyEmail, statsBySupplier };
