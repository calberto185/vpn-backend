const fs = require('fs/promises');
const path = require('path');


async function ensureDir(dir) {
await fs.mkdir(dir, { recursive: true });
}


async function rmIfExists(file) {
try { await fs.rm(file, { force: true }); } catch {}
}


function withExt(filePath, newExt) {
const dir = path.dirname(filePath);
const base = path.basename(filePath, path.extname(filePath));
return path.join(dir, `${base}${newExt}`);
}

module.exports = { withExt, rmIfExists, ensureDir }