const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
async function connectSSH() {
    if(!ssh.connection) {
        try {
            await ssh.connect({
                host: process.env.SSH_HOST,
                username: process.env.SSH_USER,
                port: 22,
                privateKey: process.env.SSH_KEY
            });
            console.log('🟢 [SSH] Conectado con node-ssh');
        } catch (err) {
            console.error('❌  SSH connection failed:', err);
            throw err;
        }
    }
}

function getSSH() {
    return ssh;
}

module.exports = {
    connectSSH,
    getSSH
}