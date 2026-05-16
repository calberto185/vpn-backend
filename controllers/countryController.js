const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
// const CountryEntity = require("../models/paymentsEntity");
const CountryEntity = require("../models/countryEntity");

async function getCountries(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { isActive: true } : {};
    const build_aggregate = [
      {
        "$match": { ... isActive}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.countries).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

// Crear pais
async function createCountry(req, res) {
    const db = getDB();
  try {
    const data = req.body;
    const exist = await db.collection(nameCollections.countries).findOne({ countryName: data?.countryName, countryCode: data?.countryCode});
    if(exist) { return res.status(400).send({code: "No encontrado", status: 400, message: "El país ya existe"}); }
    const datEntity = new CountryEntity();
    datEntity.set(data);
    datEntity.id = uuidv4();
    const dataToSave = datEntity.get();
    const resultaSave = await db.collection(nameCollections.countries).insertOne(dataToSave);
    res.status(200).send({code: "actualizado", status: 200, message: "✅ El país fue registradp exitosamente!."});
  } catch (err) {
    console.log("createCountry - error: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al actualizar el país"});
  }
}

async function editCountry(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.countries).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "El país no existe o fue eliminado" });
    const datEntity = new CountryEntity();
    datEntity.set(exist);
    datEntity.set(req.body);
    const dataToSave = datEntity.get();
    await db.collection(nameCollections.countries).updateOne({ id }, { $set: dataToSave });
    res.status(200).send({ code: "actualizado", status: 200, message: "✅ País actualizado exitosamente." });
  } catch (err) {
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al actualizar el país" });
  }
}

async function deleteCountry(req, res) {
  try {
    const id = req.body.id;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });
    const db = getDB();
    const exist = await db.collection(nameCollections.countries).findOne({ id });
    if (!exist) return res.status(404).send({ code: "no_encontrado", status: 404, message: "El país no existe o ya fue eliminado" });
    await db.collection(nameCollections.countries).deleteOne({ id });
    res.status(200).send({ code: "eliminado", status: 200, message: "✅ País eliminado exitosamente." });
  } catch (err) {
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al eliminar el país" });
  }
}

module.exports = { getCountries, createCountry, editCountry, deleteCountry };
