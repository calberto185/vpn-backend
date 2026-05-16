/**
 * financeController.js — Analytics financieros con conversión de moneda
 */
const { getDB, nameCollections } = require('../services/dbServices');

const payCol  = () => getDB().collection(nameCollections.payments);
const expCol  = () => getDB().collection(nameCollections.supplierPayments);
const wdrCol  = () => getDB().collection(nameCollections.withdrawals);
const settCol = () => getDB().collection(nameCollections.settings);

/* ─── Exchange rates ──────────────────────────────────────────────────────── */
const RATES_KEY = 'finance_exchange_rates';

const DEFAULT_RATES = {
  USD: 1, EUR: 0.92, PEN: 3.75, RUB: 90.50,
  USDT: 1, USDC: 1, BTC: 0.000016, ETH: 0.00034,
  BNB: 0.0017, TON: 0.19, TRX: 10.0,
};

async function fetchRates() {
  try {
    const doc = await settCol().findOne({ key: RATES_KEY });
    return doc?.rates ?? DEFAULT_RATES;
  } catch {
    return DEFAULT_RATES;
  }
}

/**
 * Genera expresión MongoDB que convierte $[currencyField] → targetCurrency.
 * Fórmula: (amount / rate_native) * rate_target
 * rates[X] = unidades de X por 1 USD.
 * @param {object} rates        - mapa {CURRENCY: rate}
 * @param {string} targetCurrency - moneda destino
 * @param {string} currencyField  - campo MongoDB que contiene el código de moneda del doc
 */
function amountInCurrency(rates, targetCurrency, currencyField = '$currency') {
  const targetRate = rates[targetCurrency] ?? 1;

  const nativeRateExpr = {
    $switch: {
      branches: Object.entries(rates).map(([c, r]) => ({
        case: { $eq: [currencyField, c] },
        then: r,
      })),
      default: 1, // sin campo de moneda → asumir USD (rate=1)
    },
  };

  // (amount / rate_native) * rate_target
  return {
    $multiply: [
      { $divide: [{ $toDouble: { $ifNull: ['$amount', 0] } }, nativeRateExpr] },
      targetRate,
    ],
  };
}

/* ─── Date range helpers ──────────────────────────────────────────────────── */
function yearRange(year) {
  const y = parseInt(year) || new Date().getFullYear();
  return { $gte: new Date(`${y}-01-01`), $lt: new Date(`${y + 1}-01-01`) };
}

function monthRange(year, month) {
  const from = new Date(year, month - 1, 1);
  const to   = new Date(year, month, 0, 23, 59, 59, 999);
  return { $gte: from, $lte: to };
}

/**
 * Match para pagos de cliente completados: estado Aceptado o Pagado.
 */
function revMatch(range) {
  return { state: { $in: ['Aceptado', 'Pagado'] }, createdAt: range };
}

/**
 * Match para pagos a proveedores completados con fallback de fecha.
 */
function paidMatch(range) {
  return {
    state: 'paid',
    $or: [
      { paidAt: range },
      { paidAt: { $in: [null, ''] }, createdAt: range },
    ],
  };
}

/**
 * Match para retiros completados con fallback de fecha.
 */
function completedMatch(range) {
  return {
    state: 'completed',
    $or: [
      { executedAt: range },
      { executedAt: { $in: [null, ''] }, createdAt: range },
    ],
  };
}

/* ─── Summary ────────────────────────────────────────────────────────────── */
async function summary(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const prevYear = year - 1;
    const range    = yearRange(year);
    const prev     = yearRange(prevYear);
    const rates    = await fetchRates();

    const payAmt = amountInCurrency(rates, currency, '$plan.currencyCode');
    const expAmt = amountInCurrency(rates, currency, '$currency');
    const wdrAmt = amountInCurrency(rates, currency, '$currency');

    const [rev, prevRev, exp, wdr, prevExp, prevWdr] = await Promise.all([
      payCol().aggregate([
        { $match: revMatch(range) },
        { $group: { _id: null, total: { $sum: payAmt } } },
      ]).toArray(),
      payCol().aggregate([
        { $match: revMatch(prev) },
        { $group: { _id: null, total: { $sum: payAmt } } },
      ]).toArray(),
      expCol().aggregate([
        { $match: paidMatch(range) },
        { $group: { _id: null, total: { $sum: expAmt } } },
      ]).toArray(),
      wdrCol().aggregate([
        { $match: completedMatch(range) },
        { $group: { _id: null, total: { $sum: wdrAmt } } },
      ]).toArray(),
      expCol().aggregate([
        { $match: paidMatch(prev) },
        { $group: { _id: null, total: { $sum: expAmt } } },
      ]).toArray(),
      wdrCol().aggregate([
        { $match: completedMatch(prev) },
        { $group: { _id: null, total: { $sum: wdrAmt } } },
      ]).toArray(),
    ]);

    const revenue          = +(rev[0]?.total   ?? 0).toFixed(2);
    const prevRevenue      = +(prevRev[0]?.total ?? 0).toFixed(2);
    const supplierExpenses = +(exp[0]?.total    ?? 0).toFixed(2);
    const withdrawalExpenses = +(wdr[0]?.total  ?? 0).toFixed(2);
    const expenses         = +(supplierExpenses + withdrawalExpenses).toFixed(2);
    const prevExpenses     = +((prevExp[0]?.total ?? 0) + (prevWdr[0]?.total ?? 0)).toFixed(2);
    const profit           = +(revenue - expenses).toFixed(2);

    const growth = (base, curr) =>
      base === 0 ? (curr > 0 ? 100 : 0) : +((( curr - base) / base) * 100).toFixed(1);

    const [pendingRev, pendingSupExp, pendingWdr] = await Promise.all([
      payCol().countDocuments({ state: 'Varificando' }),
      expCol().countDocuments({ state: 'pending' }),
      wdrCol().countDocuments({ state: 'pending' }),
    ]);

    res.json({
      status: 200,
      data: {
        year, currency,
        revenue,          revenueGrowth:  growth(prevRevenue, revenue),
        expenses,         expensesGrowth: growth(prevExpenses, expenses),
        supplierExpenses, withdrawalExpenses,
        profit,           profitGrowth:   growth(+(prevRevenue - prevExpenses).toFixed(2), profit),
        margin: revenue > 0 ? +((profit / revenue) * 100).toFixed(1) : 0,
        pendingPayments:   pendingRev,
        pendingExpenses:   pendingSupExp + pendingWdr,
        pendingSupplierExp: pendingSupExp,
        pendingWithdrawals: pendingWdr,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en resumen financiero', error: err.message });
  }
}

/* ─── Monthly Revenue ─────────────────────────────────────────────────────── */
async function revenueMonthly(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$plan.currencyCode');

    const raw = await payCol().aggregate([
      { $match: revMatch(range) },
      { $group: {
          _id:   { $month: '$createdAt' },
          total: { $sum: amtExpr },
          count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]).toArray();

    const months = Array.from({ length: 12 }, (_, i) => {
      const found = raw.find(r => r._id === i + 1);
      return {
        month: i + 1,
        total: +(found?.total ?? 0).toFixed(2),
        count: found?.count ?? 0,
      };
    });

    res.json({ status: 200, data: { year, currency, months } });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en ingresos mensuales', error: err.message });
  }
}

/* ─── Monthly Expenses ───────────────────────────────────────────────────── */
async function expensesMonthly(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const expAmt   = amountInCurrency(rates, currency, '$currency');
    const wdrAmt   = amountInCurrency(rates, currency, '$currency');

    const [rawSup, rawWdr] = await Promise.all([
      expCol().aggregate([
        { $match: paidMatch(range) },
        { $addFields: { _effDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
        { $group: {
            _id:   { $month: '$_effDate' },
            total: { $sum: expAmt },
            count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]).toArray(),
      wdrCol().aggregate([
        { $match: completedMatch(range) },
        { $addFields: { _effDate: { $ifNull: ['$executedAt', '$createdAt'] } } },
        { $group: {
            _id:   { $month: '$_effDate' },
            total: { $sum: wdrAmt },
            count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

    const months = Array.from({ length: 12 }, (_, i) => {
      const m   = i + 1;
      const sup = rawSup.find(r => r._id === m);
      const wdr = rawWdr.find(r => r._id === m);
      const supT = +(sup?.total ?? 0).toFixed(2);
      const wdrT = +(wdr?.total ?? 0).toFixed(2);
      return {
        month: m,
        total: +(supT + wdrT).toFixed(2),
        count: (sup?.count ?? 0) + (wdr?.count ?? 0),
        supplierTotal:   supT,
        withdrawalTotal: wdrT,
      };
    });

    res.json({ status: 200, data: { year, currency, months } });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en gastos mensuales', error: err.message });
  }
}

/* ─── Revenue by Service ─────────────────────────────────────────────────── */
async function revenueByService(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$plan.currencyCode');

    const data = await payCol().aggregate([
      { $match: revMatch(range) },
      { $group: {
          _id: {
            $switch: {
              branches: [
                {
                  case: { $and: [
                    { $ne: ['$plan.service_longName', null] },
                    { $ne: ['$plan.service_longName', ''] },
                  ]},
                  then: '$plan.service_longName',
                },
                {
                  case: { $and: [
                    { $ne: ['$plan.service_sortName', null] },
                    { $ne: ['$plan.service_sortName', ''] },
                  ]},
                  then: '$plan.service_sortName',
                },
              ],
              default: 'Sin servicio',
            },
          },
          total: { $sum: amtExpr },
          count: { $sum: 1 },
      }},
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]).toArray();

    res.json({ status: 200, data: data.map(d => ({ ...d, total: +d.total.toFixed(2) })) });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en ingresos por servicio', error: err.message });
  }
}

/* ─── Revenue by Payment Method ──────────────────────────────────────────── */
async function revenueByMethod(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$plan.currencyCode');

    const data = await payCol().aggregate([
      { $match: revMatch(range) },
      { $group: {
          _id:   { $ifNull: ['$method', 'unknow'] },
          total: { $sum: amtExpr },
          count: { $sum: 1 },
      }},
      { $sort: { total: -1 } },
    ]).toArray();

    res.json({ status: 200, data: data.map(d => ({ ...d, total: +d.total.toFixed(2) })) });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en métodos de pago', error: err.message });
  }
}

/* ─── Expenses by Supplier ───────────────────────────────────────────────── */
async function expensesBySupplier(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$currency');

    const data = await expCol().aggregate([
      { $match: paidMatch(range) },
      { $group: {
          _id:          '$supplierId',
          supplierName: { $first: { $ifNull: ['$supplierName', 'Sin nombre'] } },
          total:        { $sum: amtExpr },
          count:        { $sum: 1 },
      }},
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]).toArray();

    res.json({ status: 200, data: data.map(d => ({ ...d, total: +d.total.toFixed(2) })) });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en gastos por proveedor', error: err.message });
  }
}

/* ─── Expenses by Category ───────────────────────────────────────────────── */
async function expensesByCategory(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$currency');

    const SPECIFIC = ['infrastructure','hosting','bandwidth','software','marketing','telecom'];

    const data = await expCol().aggregate([
      { $match: paidMatch(yearRange(year)) },
      // Join suppliers catalog to recover category for legacy payments
      { $lookup: {
          from: nameCollections.suppliers,
          localField: 'supplierId',
          foreignField: 'id',
          as: '_sup',
      }},
      { $addFields: {
          _group: {
            $switch: {
              branches: [
                // 1. Payment has its own specific category (new payments)
                {
                  case: { $in: ['$category', SPECIFIC] },
                  then: '$category',
                },
                // 2. Linked supplier has a specific category (legacy payments)
                {
                  case: { $in: [{ $arrayElemAt: ['$_sup.category', 0] }, SPECIFIC] },
                  then: { $arrayElemAt: ['$_sup.category', 0] },
                },
                // 3. Fall back to supplier name — more informative than "Otro"
                {
                  case: { $and: [
                    { $ne: ['$supplierName', null] },
                    { $ne: ['$supplierName', ''] },
                  ]},
                  then: '$supplierName',
                },
              ],
              default: 'other',
            },
          },
      }},
      { $group: {
          _id:   '$_group',
          total: { $sum: amtExpr },
          count: { $sum: 1 },
      }},
      { $sort: { total: -1 } },
    ]).toArray();

    res.json({ status: 200, data: data.map(d => ({ ...d, total: +d.total.toFixed(2) })) });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en gastos por categoría', error: err.message });
  }
}

/* ─── Top Clients ────────────────────────────────────────────────────────── */
async function topClients(req, res) {
  try {
    const year     = parseInt(req.query.year)  || new Date().getFullYear();
    const limit    = parseInt(req.query.limit) || 10;
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$plan.currencyCode');

    const data = await payCol().aggregate([
      { $match: revMatch(range) },
      { $group: {
          _id:       '$user_id',
          userName:  { $first: '$user_name'  },
          userEmail: { $first: '$user_email' },
          total:     { $sum: amtExpr },
          count:     { $sum: 1 },
          lastPay:   { $max: '$createdAt'    },
      }},
      { $sort: { total: -1 } },
      { $limit: limit },
    ]).toArray();

    res.json({ status: 200, data: data.map(d => ({ ...d, total: +d.total.toFixed(2) })) });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en top clientes', error: err.message });
  }
}

/* ─── Cashflow (últimos N meses) ─────────────────────────────────────────── */
async function cashflow(req, res) {
  try {
    const months   = Math.min(parseInt(req.query.months) || 12, 24);
    const currency = req.query.currency || 'USD';
    const rates    = await fetchRates();
    const payAmt   = amountInCurrency(rates, currency, '$plan.currencyCode');
    const expAmt   = amountInCurrency(rates, currency, '$currency');
    const wdrAmt   = amountInCurrency(rates, currency, '$currency');

    const now    = new Date();
    const result = [];

    for (let i = months - 1; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from  = new Date(d.getFullYear(), d.getMonth(), 1);
      const to    = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const [rev, exp, wdr] = await Promise.all([
        payCol().aggregate([
          { $match: { state: { $in: ['Aceptado', 'Pagado'] }, createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: null, total: { $sum: payAmt } } },
        ]).toArray(),
        expCol().aggregate([
          { $match: { state: 'paid', $or: [
            { paidAt: { $gte: from, $lte: to } },
            { paidAt: { $in: [null, ''] }, createdAt: { $gte: from, $lte: to } },
          ]}},
          { $group: { _id: null, total: { $sum: expAmt } } },
        ]).toArray(),
        wdrCol().aggregate([
          { $match: { state: 'completed', $or: [
            { executedAt: { $gte: from, $lte: to } },
            { executedAt: { $in: [null, ''] }, createdAt: { $gte: from, $lte: to } },
          ]}},
          { $group: { _id: null, total: { $sum: wdrAmt } } },
        ]).toArray(),
      ]);

      const revTotal = +(rev[0]?.total ?? 0).toFixed(2);
      const expTotal = +((exp[0]?.total ?? 0) + (wdr[0]?.total ?? 0)).toFixed(2);
      result.push({
        label,
        revenue:  revTotal,
        expenses: expTotal,
        profit:   +(revTotal - expTotal).toFixed(2),
      });
    }

    res.json({ status: 200, data: result });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en flujo de caja', error: err.message });
  }
}

/* ─── Withdrawals by Recipient ───────────────────────────────────────────── */
async function withdrawalsByRecipient(req, res) {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const currency = req.query.currency || 'USD';
    const range    = yearRange(year);
    const rates    = await fetchRates();
    const amtExpr  = amountInCurrency(rates, currency, '$currency');

    const data = await wdrCol().aggregate([
      { $match: completedMatch(range) },
      { $addFields: { _effDate: { $ifNull: ['$executedAt', '$createdAt'] } } },
      { $group: {
          _id:           '$recipient',
          recipientId:   { $first: '$recipientId' },
          types:         { $addToSet: '$type' },
          total:         { $sum: amtExpr },
          count:         { $sum: 1 },
          lastWithdrawal:{ $max: '$_effDate' },
      }},
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]).toArray();

    res.json({ status: 200, data: data.map(d => ({ ...d, total: +d.total.toFixed(2) })) });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error en retiros por destinatario', error: err.message });
  }
}

/* ─── Exchange Rates ──────────────────────────────────────────────────────── */
async function getExchangeRates(req, res) {
  try {
    const doc = await settCol().findOne({ key: RATES_KEY });
    if (!doc) {
      return res.json({
        status: 200,
        data: { key: RATES_KEY, rates: DEFAULT_RATES, baseCurrency: 'USD', updatedAt: null, updatedBy: null },
      });
    }
    res.json({ status: 200, data: doc });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener tipos de cambio', error: err.message });
  }
}

async function updateExchangeRates(req, res) {
  try {
    const rates = req.body?.rates;
    if (!rates || typeof rates !== 'object')
      return res.status(400).json({ status: 400, message: 'Se requiere un objeto rates' });

    const merged = { ...DEFAULT_RATES, ...rates, USD: 1 };
    const update = {
      key: RATES_KEY, rates: merged, baseCurrency: 'USD',
      updatedAt: new Date().toISOString(), updatedBy: req.user?.id ?? null,
    };

    await settCol().updateOne({ key: RATES_KEY }, { $set: update }, { upsert: true });
    res.json({ status: 200, message: 'Tipos de cambio actualizados', data: update });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al actualizar tipos de cambio', error: err.message });
  }
}

module.exports = {
  summary, revenueMonthly, expensesMonthly,
  revenueByService, revenueByMethod,
  expensesBySupplier, expensesByCategory,
  topClients, cashflow,
  withdrawalsByRecipient,
  getExchangeRates, updateExchangeRates,
};
