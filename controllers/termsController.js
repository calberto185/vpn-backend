const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const TermsEntity = require("../models/termsEntity");

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { active: true } : {};
    const build_aggregate = [
      {
        "$match": { ... isActive}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.terms).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

async function create(req, res) {
  try {
    const datEntity = new TermsEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    const db = getDB();
    const dataToSave = datEntity.get();
    const resultaSave = await db.collection(nameCollections.terms).insertOne(dataToSave);
    res.status(200).send({code: "registrado", status: 200, message: "✅ terminos registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar el terminos"});
  }
}

// editar pago por usuario
async function update(req, res) {
  try {
    const exist = await db.collection(nameCollections.terms).findOne({ id: dataToSave.id});
    if(exist) { return res.status(400).send({code: "No encontrado", status: 400, message: "El termino fue eliminado o ya no existe"}); }
    const datEntity = new TermsEntity();
      datEntity.set(exist);
    if(!checkRole("admin")) {
    } else {
      datEntity.set(req.body);
    }
    const dataToSave = datEntity.get();
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.terms).updateOne( { id: id }, { $set: dataToSave } );
    res.status(200).send({code: "actualizado", status: 200, message: "✅ El termino fue actualizado exitosamente!."});
  } catch (err) {
    res.status(500).send({ceode: "error", status: 500, message: "Error al actualizar el termino"});
  }
}

module.exports = {  get, create, update };
