const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { standardLimit, botApiLimit, webhookLimit, adminLimit } = require('./middlewares/rateLimitMiddleware');
const swaggerUi   = require('swagger-ui-express');
const { docsAuth } = require('./middlewares/docsAuthMiddleware');
const swaggerSpec = require('./config/swagger');
const cookieParser = require('cookie-parser');

// ---------------------------
// 📦 Importación de rutas
// ---------------------------
const vpnUserRoutes = require('./routes/vpnRoutes');
const adminRoutes = require('./routes/adminRoutes');
const systemRoutes = require('./routes/systemRoutes');
const authRoutes = require('./routes/authRoutes');
const countriesRoutes = require('./routes/countriesRoutes');
const serversRoutes = require('./routes/serversRoutes');
const devicesRoutes = require('./routes/devicesRoutes');
const plansRoutes = require('./routes/plansRoutes');
const paymentsRoutes = require('./routes/paymentRoutes');
const servicesRoutes = require('./routes/servicesRoutes');
const termsRoutes = require('./routes/termsRoutes');
const continentRoutes = require('./routes/continentsRoutes');
const workflowsRoutes = require('./routes/workflowsRoutes');
const appsRoutes = require('./routes/appsRoutes');
const publicRoutes = require('./routes/publicRoutes');
const botRoutes    = require('./routes/botRoutes');
const suiRoutes    = require('./routes/sui/suiRoutes');
const crmRoutes    = require('./routes/crmRoutes');
const webhookRoutes  = require('./routes/webhookRoutes');
const cryptoRoutes   = require('./routes/cryptoRoutes');
const clientRoutes   = require('./routes/clientRoutes');
const messagesRoutes = require('./routes/messagesRoutes');
const rolesRoutes          = require('./routes/rolesRoutes');
const settingsRoutes       = require('./routes/settingsRoutes');
const suppliersRoutes      = require('./routes/suppliersRoutes');
const supplierPaymentsRoutes = require('./routes/supplierPaymentsRoutes');
const financeRoutes        = require('./routes/financeRoutes');
const tutorialRoutes       = require('./routes/tutorialRoutes');
const languagesRoutes      = require('./routes/languagesRoutes');
const translationsRoutes   = require('./routes/translationsRoutes');
const routesRoutes         = require('./routes/routesRoutes');
const brandingRoutes       = require('./routes/brandingRoutes');
const withdrawalsRoutes    = require('./routes/withdrawalsRoutes');

const app = express();

// ---------------------------
// 🧠 Seguridad base
// ---------------------------
app.use(helmet({ crossOriginResourcePolicy: false }));

const limiter = rateLimit({
  windowMs: 300 * 1000, // 5 minuto
  max: 500,
  message: { message: 'Too many requests, slow down.' }
});
app.use(limiter);

// ---------------------------
// 🔒 CORS y cookies
// ---------------------------
app.use(cors({
  origin: ['https://carlosvm.ru','https://www.carlosvm.ru', 'https://vpn.carlosvm.ru', 'https://vpn.carlosvm.pe', 'http://localhost:4200'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // permite cookies
}));
app.use(cookieParser());
app.set('trust proxy', 1);

// ---------------------------
// 🧾 Logs y parseo
// ---------------------------
app.use(bodyParser.json({ limit: '5mb' }));
// app.use(express.static(path.join(__dirname, "public")));
app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use(morgan("dev"))

// ---------------------------
// 🚫 Bloqueo de rutas sospechosas
// ---------------------------
const blockedPaths = [
  '/.env', '/.git', '/phpunit', '/vendor', '/sitemap.xml', '/robots.txt',
  '/wiki', '/pdown', '/security.txt', '/.well-known/security.txt'
];
const blockedPatterns = /\.(env|git|bak|old|save|config|php|sql)$/i;

app.use((req, res, next) => {
  const url = req.url.toLowerCase();
  if (blockedPaths.some(p => url.includes(p)) || blockedPatterns.test(url)) {
    console.warn(`🚫 Intento bloqueado: ${req.url}`);
    return res.status(404).json({ message: 'Not found' });
  }
  next();
});

// ---------------------------
// 🧱 Cabeceras extra
// ---------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ---------------------------
// 📡 API REST externas
// ---------------------------
// ── Documentación API ─────────────────────────────────────────────────────────
app.use('/api/docs', docsAuth, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'SVION VPN — API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1a1a2e; } .swagger-ui .topbar-wrapper img { content: url(""); } .swagger-ui .topbar-wrapper::after { content: "SVION VPN API"; color: white; font-size: 20px; font-weight: bold; }',
  swaggerOptions: {
    persistAuthorization: true,   // mantiene el token entre recargas
    displayRequestDuration: true,
    filter: true,
    tagsSorter: 'alpha',
  },
}));
// Spec JSON raw
app.get('/api/docs.json', docsAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use("/api/vpn", vpnUserRoutes);
app.use("/api/admin", adminLimit, adminRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/countries", countriesRoutes);
app.use("/api/servers", serversRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/payments", standardLimit, paymentsRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/terms", termsRoutes);
app.use("/api/continents", continentRoutes);
app.use("/api/workflows", workflowsRoutes);
app.use("/api/apps", appsRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/bot",    botApiLimit, botRoutes);
app.use("/api/sui",       suiRoutes);
app.use("/api/admin/crm", crmRoutes);
app.use("/api/webhooks",  webhookLimit, webhookRoutes);
app.use("/api/crypto",    cryptoRoutes);
app.use("/api/client",         standardLimit, clientRoutes);
app.use("/api/messages",      standardLimit, messagesRoutes);
app.use("/api/roles",             standardLimit, rolesRoutes);
app.use("/api/suppliers",         standardLimit, suppliersRoutes);
app.use("/api/supplier-payments", standardLimit, supplierPaymentsRoutes);
app.use("/api/finance",           standardLimit, financeRoutes);
app.use("/api/settings",          standardLimit, settingsRoutes);
app.use("/api/tutorial",          standardLimit, tutorialRoutes);
app.use("/api/languages",         standardLimit, languagesRoutes);
app.use("/api/translations",      standardLimit, translationsRoutes);
app.use("/api/routes",            standardLimit, routesRoutes);
app.use("/api/branding",          standardLimit, brandingRoutes);
app.use("/api/withdrawals",       standardLimit, withdrawalsRoutes);

// ---------------------------
// 🕳️ Fallback 404
// ---------------------------
app.use('*', (req, res) => res.status(404).json({ message: 'Not found' }));


module.exports = app;

