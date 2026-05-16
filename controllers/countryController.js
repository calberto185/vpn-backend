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

// Update Pais
async function editCountry(req, res) {
  try {
    const exist = await db.collection(nameCollections.countries).findOne({ id: dataToSave.id});
    if(exist) { return res.status(400).send({code: "No encontrado", status: 400, message: "El país fue eliminado o ya no existe"}); }
    const datEntity = new CountryEntity();
      datEntity.set(exist);
    if(!checkRole("admin")) {
    } else {
      datEntity.set(req.body);
    }
    const dataToSave = datEntity.get();
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.countries).updateOne( { id: id }, { $set: dataToSave } );
    res.status(200).send({code: "actualizado", status: 200, message: "✅ El país fue actualizado exitosamente!."});
  } catch (err) {
    res.status(500).send({ceode: "error", status: 500, message: "Error al actualizar el país"});
  }
}

module.exports = {  getCountries, createCountry, editCountry };
