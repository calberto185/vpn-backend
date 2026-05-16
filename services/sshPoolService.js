// services/nodeSshPool.js
const { NodeSSH } = require('node-ssh');
const pLimit = require('p-limit');

const pool = new Map(); // serverId -> { ssh: NodeSSH, lastUsed }
const LIMIT = pLimit(5); // máx 5 trabajos en paralelo (ajústalo)
const IDLE_MS = 120_000;  // cierra conexiones inactivas tras 60s

async function getConn(server, creds) {
  const key = server.id || `${server.host}:${server.port || 22}`;
  const pooled = pool.get(key);

  // Reutiliza si está conectada
  if (pooled?.ssh && pooled.ssh.isConnected()) {
    pooled.lastUsed = Date.now();
    return pooled.ssh;
  }

  // Crear nueva conexión
  const ssh = new NodeSSH();
  const config = {
    host: server.host,
    port: server.port ?? 22,
    username: server.userName,
    // Auth
    privateKey: creds?.privateKey,     // string PEM
    // passphrase: creds?.passphrase,     // opcional
    // password: creds?.password,         // si no usas claves
    // Opciones extra (opcionales)
    tryKeyboard: false,
    readyTimeout: 15_000,
  };

  await ssh.connect(config);
  pool.set(key, { ssh, lastUsed: Date.now() });
  return ssh;
}

/**
 * Ejecuta un comando y devuelve { code, stdout, stderr, ms }
 * Usa execCommand de node-ssh y aplica timeout manual.
 */
async function execOn(ssh, cmd, { timeoutMs = 20_000, cwd } = {}) {
  const t0 = Date.now();
  let timeout;
  const kill = new Promise((_, reject) =>
    (timeout = setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms: ${cmd}`)), timeoutMs))
  );
  try {
    const result = await Promise.race([
      ssh.execCommand(cmd, { cwd }),
      kill
    ]);
    clearTimeout(timeout);
    // node-ssh: result = { stdout, stderr, code, signal? }
    const code = typeof result.code === 'number' ? result.code : (result.stderr ? 1 : 0);
    if (code !== 0) {
      const e = new Error(`Exit ${code}`);
      e.code = code;
      e.stdout = result.stdout;
      e.stderr = result.stderr;
      throw e;
    }
    return { code, stdout: result.stdout, stderr: result.stderr, ms: Date.now() - t0 };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/**
 * Variante con streaming (útil para tail -f / largos)
 * Retorna una promesa que resuelve al cerrar el stream.
 * Puedes pasar onStdout/onStderr para procesar chunks en vivo.
 */
async function execStreamOn(ssh, cmd, {
  cwd,
  onStdout,
  onStderr,
  timeoutMs = 0 // 0 = sin timeout
} = {}) {
  let timer;
  return new Promise((resolve, reject) => {
    if (timeoutMs > 0) {
      timer = setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms: ${cmd}`)), timeoutMs);
    }
    ssh.exec(cmd, [], {
      cwd,
      onStdout: (chunk) => onStdout?.(chunk.toString()),
      onStderr: (chunk) => onStderr?.(chunk.toString()),
    }).then(() => {
      if (timer) clearTimeout(timer);
      resolve();
    }).catch((err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

// Cierre de conexiones inactivas
setInterval(() => {
  const now = Date.now();
  for (const [key, { ssh, lastUsed }] of pool.entries()) {
    if (!ssh.isConnected() || (now - lastUsed > IDLE_MS)) {
      try { ssh.dispose(); } catch {}
      pool.delete(key);
    }
  }
}, 15_000);

/**
 * Ejecuta el mismo comando en múltiples servidores con límite de concurrencia.
 * servers: [{ id, host, port, userName, ... }]
 * resolveCreds(server) -> { privateKey, passphrase? } | { password }
 */
async function runCommandAcross(servers, resolveCreds, cmd, opts = {}) {
  const jobs = servers.map(server => LIMIT(async () => {
    try {
      const creds = await resolveCreds(server);
      const ssh = await getConn(server, creds);
      const res = await execOn(ssh, cmd, opts);
      return { serverId: server.id, ok: true, ...res };
    } catch (e) {
      return {
        serverId: server.id,
        ok: false,
        error: e.message,
        code: e.code,
        stdout: e.stdout,
        stderr: e.stderr
      };
    }
  }));
  return Promise.all(jobs);
}

/**
 * Ejecuta en paralelo con streaming (por ejemplo, tail -f)
 * Devuelve un array de promesas (una por servidor).
 * Puedes manejar los eventos de salida en tiempo real por servidor.
 */
async function runStreamAcross(servers, resolveCreds, cmd, {
  onStdoutByServer, // fn(server, chunk)
  onStderrByServer, // fn(server, chunk)
  ...opts
} = {}) {
  const jobs = servers.map(server => LIMIT(async () => {
    const creds = await resolveCreds(server);
    const ssh = await getConn(server, creds);
    return execStreamOn(ssh, cmd, {
      ...opts,
      onStdout: (chunk) => onStdoutByServer?.(server, chunk),
      onStderr: (chunk) => onStderrByServer?.(server, chunk),
    });
  }));
  return Promise.allSettled(jobs);
}

/** Cierra todo el pool manualmente (útil en shutdown) */
function shutdownPool() {
  for (const { ssh } of pool.values()) {
    try { ssh.dispose(); } catch {}
  }
  pool.clear();
}
async function resolveCreds(server) {
  const keyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa';
  const privateKey = fs.readFileSync(keyPath, 'utf8');
  return { privateKey, passphrase: process.env.SSH_PASSPHRASE || undefined };
}

module.exports = {
  runCommandAcross,
  runStreamAcross,
  shutdownPool,
  // Exportar helpers si quieres usarlos de forma individual:
  getConn,
  execOn,
  execStreamOn,
};


// // utils/resolveCreds.js
// const fs = require('fs');

// async function resolveCreds(server) {
//   const keyPath = process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa';
//   const privateKey = fs.readFileSync(keyPath, 'utf8');
//   return { privateKey, passphrase: process.env.SSH_PASSPHRASE || undefined };
// }

// module.exports = resolveCreds;



// // controllers/opsController.js
// const { runCommandAcross, runStreamAcross } = require('../services/nodeSshPool');
// const resolveCreds = require('../utils/resolveCreds');

// // Ejecución "rápida" con salida completa
// async function dockerPsAll(req, res) {
//   const servers = await getServersFromDB({ tags: ['openvpn'] }); // tu query
//   const results = await runCommandAcross(
//     servers,
//     resolveCreds,
//     'docker ps --format "{{.Names}} {{.Status}}"',
//     { timeoutMs: 15000 }
//   );
//   res.json(results);
// }

// // Streaming (por ejemplo, logs en vivo)
// async function tailOpenVPN(req, res) {
//   const servers = await getServersFromDB({ tags: ['openvpn'] });
//   await runStreamAcross(servers, resolveCreds, 'tail -n 50 -f /var/log/openvpn.log', {
//     onStdoutByServer: (server, chunk) => {
//       // emitir a websockets por server.id
//       wsEmit(`logs:${server.id}`, { type: 'stdout', data: chunk });
//     },
//     onStderrByServer: (server, chunk) => {
//       wsEmit(`logs:${server.id}`, { type: 'stderr', data: chunk });
//     },
//     // timeoutMs: 0 // sin timeout para -f
//   });
//   res.json({ ok: true });
// }
