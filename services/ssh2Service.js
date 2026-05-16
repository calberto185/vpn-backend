// services/ssh2.js
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

let ssh2Instance = null;

function loadPrivateKey(val) {
  if (!val) throw new Error('SSH_KEY no definido');
  // Si viene la PEM completa en la variable de entorno
  if (val.includes('-----BEGIN')) return val;
  // Si es ruta, leer archivo
  const p = path.resolve(val);
  return fs.readFileSync(p, 'utf8');
}

function connectSSH2() {
  if (ssh2Instance) return ssh2Instance;

  ssh2Instance = new Client();

  // Logs básicos y limpieza
  ssh2Instance.on('error', (err) => {
    console.error('[SSH2] Error:', err.message || err);
  });

  ssh2Instance.on('end', () => {
    console.warn('[SSH2] Conexión finalizada por el servidor.');
  });

  ssh2Instance.on('close', (hadError) => {
    console.warn('[SSH2] Conexión cerrada', hadError ? '(por error)' : '');
    // permite reconectar en el futuro
    ssh2Instance = null;
  });

  ssh2Instance.on('ready', () => {
    console.log('🟢 [SSH2] Conexión lista');
    // keepalive “real” vía opciones, pero podemos disparar un echo inicial
    ssh2Instance.exec('uptime -p || uptime', (err, stream) => {
      if (err) return console.error('[SSH2] exec error:', err.message || err);
      stream.on('data', (data) => console.log('[SSH2][uptime]', data.toString().trim()));
      stream.stderr.on('data', (data) => console.error('[SSH2][stderr]', data.toString().trim()));
    });
  });

  // Config de conexión
  const config = {
    host: process.env.SSH_HOST,
    port: process.env.SSH_PORT ? Number(process.env.SSH_PORT) : 22,
    username: process.env.SSH_USER,
    privateKey: process.env.SSH_KEY,  //loadPrivateKey(process.env.SSH_KEY),
    passphrase: process.env.SSH_PASSPHRASE || undefined,
    readyTimeout: 15000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 6,
    tryKeyboard: false,
  };

  console.log('⏳ [SSH2] Iniciando conexión SSH…');
  ssh2Instance.connect(config);

  return ssh2Instance;
}

function getSSH2() {
  return ssh2Instance;
}

module.exports = {
  connectSSH2,
  getSSH2
};
