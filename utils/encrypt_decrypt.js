const crypto = require("crypto");

// Usar dotenv si aún no lo tienes cargado
require("dotenv").config();

const algorithm = "aes-256-gcm";

// Convierte correctamente desde base64 a Buffer
const secretKeyRaw = process.env.SECRET_KEY;

if (!secretKeyRaw) {
  throw new Error("❌ SECRET_KEY no definida en .env");
}

const secretKey = Buffer.from(secretKeyRaw, "hex");

if (secretKey.length !== 32) {
  throw new Error(`❌ SECRET_KEY debe tener exactamente 32 bytes, pero tiene ${secretKey.length}`);
}

console.log("✅ Clave válida de 32 bytes cargada");

function encryptPassword(password) {
  const iv = crypto.randomBytes(12); // GCM recomienda 12 bytes

  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("hex"),
    content: encrypted.toString("hex"),
    tag: tag.toString("hex"),
  });
}

function decryptPassword(params) {
  const { iv, content, tag } = JSON.parse(params);

  const decipher = crypto.createDecipheriv(
    algorithm,
    secretKey,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(content, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptPassword,
  decryptPassword,
};
