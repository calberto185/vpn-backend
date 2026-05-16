const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const PlansEntity = require("../models/plansEntity");

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { active: true } : {};
    const build_aggregate = [
      {
        "$match": { ... isActive}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.plans).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

async function create(req, res) {
  try {
    const datEntity = new PlansEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    const db = getDB();
    const dataToSave = datEntity.get();
    const resultaSave = await db.collection(nameCollections.plans).insertOne(dataToSave);
    res.status(200).send({code: "registrado", status: 200, message: "✅ Plan registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar el Plan"});
  }
}

async function update(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.plans).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "El plan no existe o fue eliminado" });
    const datEntity = new PlansEntity();
    datEntity.set(exist);
    datEntity.set(req.body);
    const dataToSave = datEntity.get();
    await db.collection(nameCollections.plans).updateOne({ id }, { $set: dataToSave });
    res.status(200).send({ code: "actualizado", status: 200, message: "✅ Plan actualizado exitosamente." });
  } catch (err) {
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al actualizar el plan" });
  }
}

async function deletePlan(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.plans).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "El plan no existe o ya fue eliminado" });
    await db.collection(nameCollections.plans).deleteOne({ id });
    res.status(200).send({ code: "eliminado", status: 200, message: "✅ Plan eliminado exitosamente." });
  } catch (err) {
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al eliminar el plan" });
  }
}

module.exports = { get, create, update, deletePlan };
