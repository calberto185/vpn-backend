const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const ServicesEntity = require("../models/servicesEntity");

async function getSessionByClient(req, res) {
  try {
    const id = req.user.id;
    const build_aggregate = [
      {
        "$match": { user_id: id}
      }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.sessions).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

module.exports = {  getSessionByClient };
