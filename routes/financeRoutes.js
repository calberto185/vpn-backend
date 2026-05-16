/**
 * financeRoutes.js — Analytics financieros (ingresos + gastos)
 * Montadas en: /api/finance
 */
const router = require('express').Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const ctrl = require('../controllers/financeController');

const view  = [verifyToken, checkPermission('finance', 'view')];
const admin = [verifyToken, checkPermission('finance', 'update')];

router.get('/exchange-rates',               ...view,  ctrl.getExchangeRates);
router.put('/exchange-rates',               ...admin, ctrl.updateExchangeRates);

router.get('/summary',              ...view, ctrl.summary);
router.get('/revenue/monthly',      ...view, ctrl.revenueMonthly);
router.get('/expenses/monthly',     ...view, ctrl.expensesMonthly);
router.get('/revenue/by-service',   ...view, ctrl.revenueByService);
router.get('/revenue/by-method',    ...view, ctrl.revenueByMethod);
router.get('/expenses/by-supplier', ...view, ctrl.expensesBySupplier);
router.get('/expenses/by-category', ...view, ctrl.expensesByCategory);
router.get('/top-clients',                  ...view, ctrl.topClients);
router.get('/cashflow',                     ...view, ctrl.cashflow);
router.get('/withdrawals/by-recipient',     ...view, ctrl.withdrawalsByRecipient);

module.exports = router;
