// services/sshPool.js
const { Client } = require('ssh2');
const pLimit = require('p-limit');

const pool = new Map(); // serverId -> { conn, lastUsed }
const LIMIT = pLimit(5); // máx 5 conexiones activas en paralelo (ajusta a tu VPS)
const IDLE_MS = 120_000;  // cierra conexiones inactivas tras 120s

function getConn(server, creds) {
  const key = server.id;
  const pooled = pool.get(key);
  if (pooled?.conn?._sock && !pooled.conn._sock.destroyed) {
    pooled.lastUsed = Date.now();
    return Promise.resolve(pooled.conn);
  }
  return new Promise((resolve, reject) => {
    const c = new Client();
    const cfg = {
      host: server.host,
      port: server.port ?? 22,
      username: server.username,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 6,
      // auth:
      privateKey: creds.privateKey,         // trae desde tu secrets manager
      passphrase: creds.passphrase || undefined,
      // si usaras password: password: creds.password,
      // bastion (opcional): sock: tunnelSocket,
    };
    c.on('ready', () => {
      pool.set(key, { conn: c, lastUsed: Date.now() });
      resolve(c);
    });
    c.on('error', reject);
    c.on('close', () => {
      if (pool.get(key)?.conn === c) pool.delete(key);
    });
    c.connect(cfg);
  });
}

function execOn(conn, cmd, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms: ${cmd}`)), timeoutMs);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let stdout = '', stderr = '';
      stream.on('data', d => stdout += d.toString());
      stream.stderr.on('data', d => stderr += d.toString());
      stream.on('close', (code, signal) => {
        clearTimeout(timer);
        if (code === 0) resolve({ code, stdout, stderr });
        else {
          const e = new Error(`Exit ${code} (${signal})`);
          e.code = code; e.signal = signal; e.stdout = stdout; e.stderr = stderr;
          reject(e);
        }
      });
    });
  });
}

// Cierra conexiones inactivas
setInterval(() => {
  const now = Date.now();
  for (const [id, { conn, lastUsed }] of pool.entries()) {
    if (now - lastUsed > IDLE_MS) {
      try { conn.end(); } catch {}
      pool.delete(id);
    }
  }
}, 15_000);

async function runCommandAcross(servers, resolveCreds, cmd, opts = {}) {
  // resolveCreds(server) debe devolver { privateKey, passphrase? } o { password }
  const jobs = servers.map(server => LIMIT(async () => {
    const creds = await resolveCreds(server);
    const conn = await getConn(server, creds);
    try {
      const t0 = Date.now();
      const { stdout, stderr } = await execOn(conn, cmd, opts);
      return { serverId: server.id, ok: true, ms: Date.now() - t0, stdout, stderr };
    } catch (e) {
      return { serverId: server.id, ok: false, error: e.message, code: e.code, stderr: e.stderr, stdout: e.stdout };
    }
  }));
  return Promise.all(jobs);
}
function shutdownPool() {
  for (const { conn } of pool.values()) {
    try { conn.end(); } catch {}
  }
  pool.clear();
}

module.exports = { runCommandAcross, shutdownPool };


// const { runCommandAcross } = require('../services/sshPool');
// const resolveCreds = require('../utils/resolveCreds');

// async function dockerStatusEurope(req, res) {
//   const servers = await getServersBy({ region: 'EU', tags: ['openvpn'] }); // desde tu BD
//   const results = await runCommandAcross(
//     servers,
//     resolveCreds,
//     'docker ps --format "{{.Names}} {{.Status}}"',
//     { timeoutMs: 15000 }
//   );
//   res.json(results);
// }


// // utils/resolveCreds.js
// const fs = require('fs');

// async function resolveCreds(server) {
//   const keyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa';
//   const privateKey = fs.readFileSync(keyPath, 'utf8');
//   return {
//     privateKey,
//     passphrase: process.env.SSH_PASSPHRASE || undefined,
//   };
// }

// module.exports = resolveCreds;