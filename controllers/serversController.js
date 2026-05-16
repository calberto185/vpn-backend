const { getDB, nameCollections } = require("../services/dbServices");
const serverEntity = require("../models/serversEntity");
const { v4: uuidv4 } = require("uuid");
const { encryptPassword } = require("../utils/encrypt_decrypt");

async function get(req, res) {
  try {
    const aggregate = req.body.aggregate ? [...req.body.aggregate] : [];
    const db = getDB();
    const data = await db.collection(nameCollections.servers).aggregate(aggregate).toArray();
    res.status(200).json({ code: "consultado", status: 200, data });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

async function create(req, res) {
  try {
    const db  = getDB();
    const ent = new serverEntity();
    ent.set(req.body);
    ent.id        = uuidv4();
    ent.updatedAt = new Date();
    // Encriptar contraseña S-UI antes de guardar
    if (ent.sui_password && !ent.sui_password.startsWith('{')) {
      ent.sui_password = encryptPassword(ent.sui_password);
    }
    const data = ent.get();
    const exist = await db.collection(nameCollections.servers).findOne({ host: data.host });
    if (exist) return res.status(400).json({ code: "duplicado", message: "Este servidor ya existe" });
    await db.collection(nameCollections.servers).insertOne(data);
    res.status(200).json({ code: "registrado", message: "✅ Servidor registrado" });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

async function update(req, res) {
  try {
    const db  = getDB();
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: "faltan_datos", message: "id es requerido" });
    const exist = await db.collection(nameCollections.servers).findOne({ id });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Servidor no encontrado" });
    const ent = new serverEntity();
    ent.set(exist);
    ent.set(req.body);
    ent.updatedAt = new Date();
    if (ent.sui_password && !ent.sui_password.startsWith('{')) {
      ent.sui_password = encryptPassword(ent.sui_password);
    }
    await db.collection(nameCollections.servers).updateOne({ id }, { $set: ent });
    res.status(200).json({ code: "actualizado", message: "✅ Servidor actualizado" });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

async function remove(req, res) {
  try {
    const db  = getDB();
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: "faltan_datos", message: "id es requerido" });
    const exist = await db.collection(nameCollections.servers).findOne({ id });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Servidor no encontrado" });
    // Soft delete: marcar como inactivo en lugar de eliminar
    await db.collection(nameCollections.servers).updateOne(
      { id },
      { $set: { active: false, visible: false, updatedAt: new Date() } }
    );
    res.status(200).json({ code: "eliminado", message: "✅ Servidor desactivado" });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

module.exports = { get, create, update, remove };
