/**
 * wsService.js — WebSocket en tiempo real para el panel (usa la librería `ws` existente)
 *
 * Ruta: /ws?token=<jwt>
 *
 * Rooms (Map<string, Set<WebSocket>>):
 *   room:admin          → todos los administradores conectados
 *   room:user:<id>      → usuario específico
 *
 * Protocolo de mensajes (JSON):
 *   Server → Client:  { event: string, data: object }
 *   Client → Server:  { event: "ping" }  (keepalive)
 */

const WebSocket = require("ws");
const url       = require("url");
const { verifyAccessToken } = require("../utils/jwtService");

let wss = null;

// Map<roomName, Set<WebSocket>>
const rooms = new Map();

// Map<WebSocket, { id, email, role, rooms: string[] }>
const clients = new Map();

// ── Gestión de rooms ──────────────────────────────────────────────────────────

function joinRoom(ws, room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
  const meta = clients.get(ws);
  if (meta && !meta.rooms.includes(room)) meta.rooms.push(room);
}

function leaveAllRooms(ws) {
  const meta = clients.get(ws);
  if (!meta) return;
  for (const room of meta.rooms) {
    rooms.get(room)?.delete(ws);
    if (rooms.get(room)?.size === 0) rooms.delete(room);
  }
}

// ── Emisión ───────────────────────────────────────────────────────────────────

function emitToRoom(room, event, data) {
  const set = rooms.get(room);
  if (!set) return;
  const msg = JSON.stringify({ event, data });
  set.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

/** Emitir a todos los administradores conectados */
function emitToAdmins(event, data) {
  emitToRoom("room:admin", event, data);
}

/** Emitir a un usuario específico por su ID */
function emitToUser(userId, event, data) {
  emitToRoom(`room:user:${userId}`, event, data);
}

/** Emitir a varios usuarios */
function emitToUsers(userIds, event, data) {
  userIds.forEach(uid => emitToUser(uid, event, data));
}

// ── Inicialización ────────────────────────────────────────────────────────────

function initWS(httpServer) {
  wss = new WebSocket.Server({ noServer: true });

  // Interceptar upgrades solo para /ws
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = url.parse(req.url).pathname;
    if (pathname !== "/ws") return;

    // Autenticar JWT desde query param ?token=
    const { query } = url.parse(req.url, true);
    const token = query.token;

    let user;
    try {
      user = verifyAccessToken(token);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user);
    });
  });

  wss.on("connection", (ws, _req, user) => {
    // Registrar cliente
    clients.set(ws, { id: user.id, email: user.email, role: user.role, rooms: [] });

    // Unir a rooms según rol
    joinRoom(ws, `room:user:${user.id}`);
    if (user.role === "admin") joinRoom(ws, "room:admin");

    console.log(`🔌 [WS] ${user.email} (${user.role}) conectado — ${clients.size} activos`);

    // Notificar a los admins que este usuario se conectó
    if (user.role !== "admin") {
      emitToAdmins("user:online", { user_id: user.id, connectedAt: new Date() });
    }

    // Mensajes del cliente
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // ── Ping / keepalive ──────────────────────────────────────────────
        if (msg.event === "ping") {
          ws.send(JSON.stringify({ event: "pong" }));
          return;
        }

        // ── Envío de mensaje en tiempo real ───────────────────────────────
        if (msg.event === "messages:send") {
          const correlationId = msg.data?.correlationId || null;
          try {
            const { adminSendMessage, clientSendMessage } = require('./messageSendService');
            let result;
            // Treat null/empty role as 'client' (matches verifyRoleMiddleware behavior)
            const effectiveRole = user.role || 'client';
            const clientRoles   = ['client', 'standar'];
            if (clientRoles.includes(effectiveRole)) {
              // Cliente (o rol heredado 'standar') solo puede enviar al admin
              result = await clientSendMessage(user.id, msg.data || {});
            } else {
              // Admin / superadmin / cualquier otro rol de panel
              result = await adminSendMessage(user.id, msg.data || {});
            }
            ws.send(JSON.stringify({
              event: 'messages:send:ack',
              data: {
                correlationId,
                ok:         true,
                message_id: result.id,
                message:    result.msg,
              },
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              event: 'messages:send:ack',
              data: {
                correlationId,
                ok:    false,
                error: err.code || err.message,
              },
            }));
          }
          return;
        }

      } catch (err) {
        console.warn(`[WS] Error procesando mensaje de ${user.email}:`, err.message);
      }
    });

    ws.on("close", () => {
      // Notificar a los admins que este usuario se desconectó
      if (user.role !== "admin") {
        emitToAdmins("user:offline", { user_id: user.id, disconnectedAt: new Date() });
      }
      leaveAllRooms(ws);
      clients.delete(ws);
      console.log(`🔌 [WS] ${user.email} desconectado — ${clients.size} activos`);
    });

    ws.on("error", (err) => {
      console.warn(`[WS] Error en ${user.email}:`, err.message);
    });

    // Confirmar conexión exitosa
    ws.send(JSON.stringify({ event: "connected", data: { userId: user.id, role: user.role } }));
  });

  console.log("🟢 [WS] WebSocket tiempo real iniciado en /ws");
  return wss;
}

function getWss() { return wss; }

/** Devuelve true si el usuario con ese ID tiene al menos una conexión WS activa */
function isUserOnline(userId) {
  const room = rooms.get(`room:user:${userId}`);
  return !!(room && room.size > 0);
}

/** Retorna el conjunto de user_ids de clientes (no admins) actualmente conectados */
function getOnlineClientIds() {
  const ids = new Set();
  clients.forEach((meta) => {
    if (meta.role !== "admin") ids.add(meta.id);
  });
  return ids;
}

module.exports = { initWS, getWss, emitToAdmins, emitToUser, emitToUsers, isUserOnline, getOnlineClientIds };
