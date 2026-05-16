const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const AppsEntity = require("../models/appsEntity");
const { generateTokenApp } = require("../utils/jwtService")

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.active ?? false) ? { active: true } : {};
    const build_aggregate = [
      {
        "$match": { ... isActive}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.apps).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({code: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}
// editar pago por usuario
async function create(req, res) {
  try {
    const db = getDB();
    const dataToSave = new AppsEntity();
    dataToSave.set(req.body);
    const exist = await db.collection(nameCollections.apps).findOne({ name: dataToSave.name});
    if(exist) { return res.status(400).send({code: "duplicado", status: 400, message: "El nombre de esta ya fue registrado"}); }
   
    dataToSave.id = uuidv4();
    dataToSave.access = generateTokenApp({id: dataToSave.id})
    const resultaSave = await db.collection(nameCollections.apps).insertOne(dataToSave);
    res.status(200).send({code: "created", status: 200, message: "✅ la app fue creado exitosamente!."});
  } catch (err) {
    console.log("apps create ",err)
    res.status(500).send({code: "error", status: 500, message: "Error al actualizar la app"});
  }
}

// editar pago por usuario
async function edit(req, res) {
  try {
    const exist = await db.collection(nameCollections.apps).findOne({ id: dataToSave.id});
    if(exist) { return res.status(400).send({code: "No encontrado", status: 400, message: "la app fue eliminado o ya no existe"}); }
    const datEntity = new AppsEntity();
      datEntity.set(exist);
    if(!checkRole("admin")) {
    } else {
      datEntity.set(req.body);
    }
    const dataToSave = datEntity.get();
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.apps).updateOne( { id: id }, { $set: dataToSave } );
    res.status(200).send({code: "actualizado", status: 200, message: "✅ la app fue actualizado exitosamente!."});
  } catch (err) {
    res.status(500).send({code: "error", status: 500, message: "Error al actualizar la app"});
  }
}

async function remove(req, res) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).send({ code: 'bad_request', status: 400, message: 'El id es requerido' });
    const db = getDB();
    const exist = await db.collection(nameCollections.apps).findOne({ id });
    if (!exist) return res.status(404).send({ code: 'not_found', status: 404, message: 'App no encontrada' });
    await db.collection(nameCollections.apps).deleteOne({ id });
    res.status(200).send({ code: 'deleted', status: 200, message: '✅ App eliminada exitosamente.' });
  } catch (err) {
    console.log('apps remove', err);
    res.status(500).send({ code: 'error', status: 500, message: 'Error al eliminar la app' });
  }
}

module.exports = { get, create, edit, remove };
