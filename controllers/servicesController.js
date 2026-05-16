const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const ServicesEntity = require("../models/servicesEntity");

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { active: true } : {};
    const build_aggregate = [
      {
        "$match": { ... isActive}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.services).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

async function create(req, res) {
  try {
    const datEntity = new ServicesEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    const db = getDB();
    const dataToSave = datEntity.get();
    const resultaSave = await db.collection(nameCollections.services).insertOne(dataToSave);
    res.status(200).send({code: "registrado", status: 200, message: "✅ Servicio registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar el Servicio"});
  }
}

async function update(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.services).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "El servicio no existe o fue eliminado" });
    const datEntity = new ServicesEntity();
    datEntity.set(exist);
    datEntity.set(req.body);
    const dataToSave = datEntity.get();
    await db.collection(nameCollections.services).updateOne({ id }, { $set: dataToSave });
    res.status(200).send({ code: "actualizado", status: 200, message: "✅ Servicio actualizado exitosamente." });
  } catch (err) {
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al actualizar el servicio" });
  }
}

async function deleteService(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.services).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "El servicio no existe o ya fue eliminado" });
    await db.collection(nameCollections.services).deleteOne({ id });
    res.status(200).send({ code: "eliminado", status: 200, message: "✅ Servicio eliminado exitosamente." });
  } catch (err) {
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al eliminar el servicio" });
  }
}

module.exports = { get, create, update, deleteService };
