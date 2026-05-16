const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const BankAccountEntity = require("../models/bankAccountEntity");

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { active: true } : {};
    const build_aggregate = [
      {
        "$match": { ... isActive}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.bankAccount).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

async function create(req, res) {
  try {
    const datEntity = new BankAccountEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    const db = getDB();
    const dataToSave = datEntity.get();
    const resultaSave = await db.collection(nameCollections.bankAccount).insertOne(dataToSave);
    res.status(200).send({code: "registrado", status: 200, message: "✅ Dispositivo registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar el Dispositivo"});
  }
}

// editar
async function update(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.bankAccount).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "La cuenta bancaria no existe o fue eliminada" });
    const datEntity = new BankAccountEntity();
    datEntity.set(exist);
    datEntity.set(req.body);
    const dataToSave = datEntity.get();
    await db.collection(nameCollections.bankAccount).updateOne({ id }, { $set: dataToSave });
    res.status(200).send({ code: "actualizado", status: 200, message: "✅ Cuenta bancaria actualizada exitosamente." });
  } catch (err) {
    console.log("err update bankAccount:", err);
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al actualizar la cuenta bancaria" });
  }
}


module.exports = {  get, create, update };
