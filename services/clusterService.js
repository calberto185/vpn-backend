const WebSocket = require("ws");
const url = require("url");

let wss;

function initCluster(httpServer) {
  wss = new WebSocket.Server({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { query } = url.parse(req.url, true);
    const clientKey = query.authKey;
    const serverKey = process.env.CLUSTER_AUTH_KEY;

    if (clientKey !== serverKey) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      console.log("❌ Conexión WebSocket rechazada por clave inválida");
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    console.log("🧩 Cliente WebSocket autenticado");

    ws.on("message", (message) => {
      console.log("📩 Mensaje recibido:", message.toString());
      ws.send("🧾 Servidor: mensaje recibido");
    });
  });

  console.log("🟢 [WS] WebSocket iniciado con autenticación por clave");
  return wss;
}

function getCluster() {
  return wss;
}

module.exports = {
  initCluster,
  getCluster,
};
