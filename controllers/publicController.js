const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const PlansEntity = require("../models/plansEntity");

async function get(req, res) {
  try {
    const build_aggregate = [
      {
        "$match": { 
          "global": true,
          "active": true,
          "visible": true
        }
      },
      {
        "$project": {
          "_id": 0,
          "id": 1,
          "title_prefix": 1,
          "title_name": 1,
          "title_suffix": 1,
          "price": 1,
          "description": 1,
          "features": 1,
          "button_name": 1,
          "kind": 1,
          "global": 1,
          "main": 1,
          "language": 1,
          "active": 1,
          "visible": 1,
          "currencyName": 1,
          "currencyCode": 1,
          "currencySymbol": 1,
          "currencyFormat": 1,
          "limitDevices": 1,
          "service.sortName": 1,
          "service.longName": 1,
          "service.Description": 1,
          "service.picture": 1,
          "service.state": 1,
        }
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
module.exports = {  get };