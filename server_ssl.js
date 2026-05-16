const dotenv = require("dotenv");
dotenv.config({ path: ".env" });

const { connectMongo } = require("./services/dbServices");
const { initCluster } = require("./services/clusterService");
const { connectSSH2 } = require("./services/ssh2Service");
const { connectSSH } = require("./services/sshService");
const { init } = require("./_init");
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

(async () => {
  await connectMongo();
  await initCluster(httpServer);
  // await connectSSH2();
  // await connectSSH();
  const PORT = process.env.PORT || 443 || 3000;
  httpServer.listen(PORT, async () => {
    console.log(`🟢 Server VPN [HTTP+WS] escuchando en http://localhost:${PORT}`);
    await init();
  });
})();
