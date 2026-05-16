const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const DevicesEntity = require("../models/deviceEntity");
const ActivitiesDeviceEntity = require("../models/activitiesDeviceEntity");

async function getGeoInfo(clientIp, ipinfoToken) {
  try {
    let geoUrl = `https://ipinfo.io/${clientIp}/json`;
    if (ipinfoToken) geoUrl += `?token=${ipinfoToken}`;

    const res = await fetch(geoUrl, { timeout: 3000 }); // 3s timeout
    const data = await res.json();

    const GEO_COUNTRY = data.country || '';
    const GEO_REGION = data.region || '';
    const GEO_CITY = data.city || '';

    let GEO_LAT = '';
    let GEO_LON = '';
    if (data.loc && data.loc.includes(',')) {
      [GEO_LAT, GEO_LON] = data.loc.split(',');
    }

    return { GEO_COUNTRY, GEO_REGION, GEO_CITY, GEO_LAT, GEO_LON };
  } catch (err) {
    console.error('Error fetching geo info:', err);
    return { GEO_COUNTRY: '', GEO_REGION: '', GEO_CITY: '', GEO_LAT: '', GEO_LON: '' };
  }
}
async function updateDeviceState(req, res) {
  try {
    const db = getDB();
    const activitiesDevice = new ActivitiesDeviceEntity();
    activitiesDevice.set(req.body)
    activitiesDevice.id = uuidv4();
    const geo = await getGeoInfo(activitiesDevice.client_ip, process.env.IPINFO_TOKEN);
    activitiesDevice.country = geo.GEO_COUNTRY;
    activitiesDevice.city = geo.GEO_CITY;
    activitiesDevice.region = geo.GEO_REGION;
    activitiesDevice.lat = geo.GEO_LAT;
    activitiesDevice.lon = geo.GEO_LON;
    const resultaSave = await db.collection(nameCollections.activitiesDevice).insertOne(activitiesDevice.get());
    res.status(200).send({code: "actualizado", status: 200, message: "✅ Registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar estado"});
  }
}
async function getDeviceState(req, res) {
  try {
    const {id} = req.user;
    if(!id) { return res.status(404).send({code: "No encontrado", status: 404, message: "El usuario ya no existe!!!"}); }
    const build_aggregate = [
      {
        "$match": { id }
      },
        {
    $lookup: {
      from: "admin",
      localField: "user_id",
      foreignField: "id",
      as: "obj_admin"
    }
  },
  { $unwind: "$obj_admin" },

  {
    $lookup: {
      from: "devices",
      localField: "device_id",
      foreignField: "id",
      as: "obj_device"
    }
  },
  { $unwind: "$obj_device" },

  {
    $lookup: {
      from: "servers",
      localField: "server_id",
      foreignField: "id",
      as: "obj_server"
    }
  },
  { $unwind: "$obj_server" },

  {
    $project: {
      _id: 1, 
      id: 1,
      user_id: 1,
      user_name: {
        $concat: [
          "$obj_admin.firstNames",
          " ",
          "$obj_admin.lastNames"
        ]
      },
      device_id: 1,
      device_name: "$obj_device.device",
      device_type: "$obj_device.typeDevice",
      device_state: "$obj_device.active",
      device_suspend: "$obj_device.suspend",
      device_revoked: "$obj_device.revoked",
      server_id: 1,
      server_name: "$obj_server.name",
      server_ip: "$obj_server.host",
      state: 1,
      createdAt: 1,
      client_ip : 1,
      country : 1,
      region : 1,
      city : 1,
      lat : 1,
      lon : 1
    }
  },
  { $sort: { _id: -1 } }
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.activitiesDevice).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}
module.exports = { updateDeviceState, getDeviceState };
