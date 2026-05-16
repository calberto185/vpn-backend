const AdminEntity = require("../models/adminEntity");
const { getDB, nameCollections } = require("../services/dbServices");
const checkPlan = async(req, res, next) => {
  const userSession = req.user;
  if (!req.user) {
    return res.status(401).json({
      code: "no_autenticado",
      status: 401,
      message: "No autenticado",
    });
  }
   const db = getDB();
    const [ currentUser ] = await db.collection(nameCollections.admin).aggregate([ { "$match": { id: userSession.id } }]).toArray()
     if (!currentUser) {
    return res.status(401).json({
      code: "no_autenticado",
      status: 401,
      message: "No autenticado",
    });
  }
  const user = new AdminEntity();
  user.set(currentUser)
  if (user.services.length == 0) {
    return res.status(403).json({
      code: "sin_plan",
      status: 403,
      message: "Debe Seleccionar un Plan para realizar esta accion!.",
    });
  }
  // const dataDevices = await db.collection(nameCollections.devices).aggregate([ { "$match": { user_id: user.id,  revoked: false } }]).toArray()
  // if (user.plan.devicesLimit == dataDevices.length ) {
  //   return res.status(403).json({
  //     code: "maximo_plan",
  //     status: 403,
  //     message: "Su plan "+user.plan.name+" le permite solo "+user.plan.devicesLimit+" Dispositivos. Considere Actualizar su Plan!."
  //   });
  // }
  next();
};
module.exports = { checkPlan }