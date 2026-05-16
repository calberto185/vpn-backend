const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const ContinentEntity = require("../models/continentsEntity");

async function get(req, res) {
  try {
    const isActive = !!JSON.parse(req?.query?.isActive ?? false) ? { isActive: true } : {};
    const build_aggregate = [
      { "$match": { ...isActive } }
    ];
    const db = getDB();
    const results = await db.collection(nameCollections.continents).aggregate(build_aggregate).toArray();
    res.status(200).send({ code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: results });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).send({ code: "error", status: 500, message: "Error al realizar la consulta!" });
  }
}

async function edit(req, res) {
  try {
    const db = getDB();
    const { id } = req.body;
    if (!id) return res.status(400).send({ code: "error", status: 400, message: "El campo id es requerido" });

    const exist = await db.collection(nameCollections.continents).findOne({ id });
    if (!exist) return res.status(404).send({ code: "No encontrado", status: 404, message: "El continente fue eliminado o ya no existe" });

    const datEntity = new ContinentEntity();
    datEntity.set(exist);    // cargar datos actuales
    datEntity.set(req.body); // sobrescribir con cambios enviados
    const dataToSave = datEntity.get();

    await db.collection(nameCollections.continents).updateOne(
      { id },
      { $set: { ...dataToSave, updatedAt: new Date() } }
    );
    res.status(200).send({ code: "actualizado", status: 200, message: "✅ El continente fue actualizado exitosamente!." });
  } catch (err) {
    console.log("error edit continent:", err);
    res.status(500).send({ code: "error", status: 500, message: err.message || "Error al actualizar el continente" });
  }
}

module.exports = { get, edit };
