const dotenv = require("dotenv");
dotenv.config({ path: ".env" });

const { connectMongo } = require("./services/dbServices");
const { initCluster } = require("./services/clusterService");
const { connectSSH2 } = require("./services/ssh2Service");
const { connectSSH } = require("./services/sshService");
const { init } = require("./_init");
const { initWS } = require("./services/wsService");
const { initUploadService } = require("./services/storageService");
const fs = require("fs");
const http = require("http");
const https = require("https");
const app = require("./app");

// 🔐 Cargar certificados SSL
const options = {
  key: fs.readFileSync("./ssl/key.pem"),   // clave privada
  cert: fs.readFileSync("./ssl/cert.pem"), // certificado
  ca: fs.readFileSync("./ssl/chain.pem"),  // cadena de confianza
};
// const httpServer = http.createServer(app);
const httpServer = https.createServer(options, app);

// WS debe inicializarse antes del listen para registrar el handler de upgrade
initWS(httpServer);

(async () => {
  await connectMongo();

  // Inicializar SUIManager con la conexión a MongoDB
  const { getSuiManager } = require('./services/sui/suiManager');
  const { getDB, nameCollections } = require('./services/dbServices');
  const suiMgr = getSuiManager();
  suiMgr.init(getDB(), nameCollections);
  suiMgr.refresh().catch(e => console.warn('[SUI Manager] refresh inicial:', e.message));

  // Inicializar binnacle (audit logger)
  const binnacle = require('./utils/binnacle');
  binnacle.init(getDB(), nameCollections);

  await initCluster(httpServer);
  await initUploadService();
  // await connectSSH2();
  // await connectSSH();
  const PORT = process.env.PORT || 443 || 3000;
  httpServer.listen(PORT, async () => {
    console.log(`🟢 Server VPN [HTTPS+WSS] escuchando en https://localhost:${PORT}`);
    await init();
    const { iniciarScheduler } = require("./workflows/cron.workflow");
    iniciarScheduler();
  });
})();
