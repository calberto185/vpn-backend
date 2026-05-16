const dotenv = require("dotenv");
dotenv.config({ path: ".env" });
const { connectMongo } = require("./services/dbServices");
const { initCluster } = require("./services/clusterService");
const { connectSSH2 } = require("./services/ssh2Service");
const { connectSSH } = require("./services/sshService");
const { initUploadService } = require("./services/storageService");
const { init } = require("./_init");
const http = require("http");
const app = require("./app");

const httpServer = http.createServer(app);

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
  // await connectSSH2();
  // await connectSSH();
  await initUploadService();
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, async () => {
    console.log(`🟢 Server VPN [HTTP+WS] escuchando en http://localhost:${PORT}`);
    await init();
    const { iniciarScheduler } = require("./workflows/cron.workflow");
    iniciarScheduler();
  });
})();
