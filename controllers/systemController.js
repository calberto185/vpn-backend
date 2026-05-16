const express = require("express");
const router = express.Router();
const { generateTokenApp } = require("../utils/jwtService")

// Obtener historial de conexiones por usuario
async function historial (req, res) {
  const { usuario } = req.params;
  try {
    const user = await VpnUser.findOne({ username: usuario });
    if (!user) return res.status(404).send("Usuario no encontrado");

    const historial = user.devices.map(d => ({
      ip: d.ip,
      conectado: d.connectedAt,
      desconectado: d.disconnectedAt
    }));

    res.json({ username: user.username, historial });
  } catch (err) {
    res.status(500).send("Error al obtener historial");
  }
}


/** Listar usuarios del panel **/
async function usuarios_panel (req, res) {
  try {
    const users = await fs.readJson("./users.json");
    const out = users.map(u => ({ username: u.username, role: u.role }));
    res.json(out);
  } catch (err) {
    res.status(500).send("Error al leer usuarios");
  }
}

/** Listar usuarios del panel **/
async function generateKeyApp (req, res) {
   try {
    // let aggregate = req.body.aggregate ? [...req?.body?.aggregate] : [];
    // aggregate = [{$match: {host: req.body.host, }}]
    // const db = getDB();
    // const [dataToResponse] = await db.collection(nameCollections.servers).aggregate(aggregate).toArray()
    // if(!dataToResponse) { return res.status(400).send({code: "No encontrado", status: 400, message: "No hay servidores registrados"}); }
    // if(!dataToResponse) { return res.status(400).send({code: "No encontrado", status: 400, message: "No hay servidores registrados"}); }
    const dataToResponse = req.body;
    if(!dataToResponse) { return res.status(400).send({code: "No encontrado", status: 400, message: "No hay servidores registrados"}); }
    const token = await generateTokenApp({
      // id : dataToResponse.id,
      // name : dataToResponse.name,
      "host" : dataToResponse.host,
      "port" : dataToResponse.port,
      "countryName" : dataToResponse.countryName,
      "countryCode" : dataToResponse.countryCode,
      // userName : dataToResponse.userName,
      // password : dataToResponse.password,
    })
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: {token}})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

module.exports = {  historial, usuarios_panel, generateKeyApp };
