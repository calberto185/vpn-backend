const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const TermsEntity = require("../models/termsEntity");

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { active: true } : {};
    const build_aggregate = [{ "$match": { ...isActive } }];
    const db = getDB();
    const results = await db.collection(nameCollections.terms).aggregate(build_aggregate).toArray();
    res.status(200).send({ code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: results });
  } catch (error) {
    console.log("terms get error:", error);
    res.status(500).send({ code: "error", status: 500, message: "Error al realizar la consulta" });
  }
}

async function create(req, res) {
  try {
    const datEntity = new TermsEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    datEntity.createdAt = new Date();
    datEntity.updatedAt = new Date();
    const db = getDB();
    const dataToSave = datEntity.get();
    await db.collection(nameCollections.terms).insertOne(dataToSave);
    res.status(200).send({ code: "registrado", status: 200, message: "✅ Términos registrados exitosamente." });
  } catch (err) {
    console.log("terms create error:", err);
    res.status(500).send({ code: "error", status: 500, message: err.message ?? "Error al registrar los términos" });
  }
}

async function update(req, res) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).send({ code: "bad_request", status: 400, message: "El id es requerido" });

    const db = getDB();
    const exist = await db.collection(nameCollections.terms).findOne({ id });
    if (!exist) return res.status(404).send({ code: "not_found", status: 404, message: "El término no existe o fue eliminado" });

    const datEntity = new TermsEntity();
    datEntity.set(exist);
    datEntity.set(req.body);
    datEntity.updatedAt = new Date();

    const dataToSave = datEntity.get();
    await db.collection(nameCollections.terms).updateOne({ id }, { $set: dataToSave });
    res.status(200).send({ code: "actualizado", status: 200, message: "✅ Términos actualizados exitosamente.", data: dataToSave });
  } catch (err) {
    console.log("terms update error:", err);
    res.status(500).send({ code: "error", status: 500, message: err.message ?? "Error al actualizar los términos" });
  }
}

module.exports = { get, create, update };
