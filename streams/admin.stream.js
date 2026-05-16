// const { sendMail } = require("../shared/mailer");
const { nameCollections } = require("../config/db.config");
const AdminEntity = require('../models/adminEntity');

async function RegisterNewClient(db, change) {
    if (change.operationType !== "insert") return;
    const inserted = change.documentKey;
    const fullDocument = change.fullDocument;
    const admin = new AdminEntity();
    admin.set(fullDocument);
    // await sendMail(
    //     admin.email,
    //     `Registro - ${process.env.NAME_APP}`,
    //     `Hola ${admin.firstNames} bienvenido a tu plataforma Carlosvm VPN, espera un poco hasta que tu cuenta sea verificada!.!.`
    // );
}

async function 
AdminStream(db, change) {
    RegisterNewClient(db, change);
}

module.exports = {
    AdminStream
}