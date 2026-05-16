// const { sendMail } = require("../shared/mailer");
const { nameCollections } = require("../config/db.config");
const AdminEntity = require('../models/adminEntity');
const { decryptPassword } = require("../utils/encrypt_decrypt");

async function UpdatePassword(db, change) {
    if (change.operationType !== "update") return;
    const updated = change.updateDescription.updatedFields;
    if (!updated["password"] ) return;
    if (Object.values(updated).length ==! 1) return;
    const fullDocument = change.fullDocument;
    const admin = new AdminEntity();
    admin.set(fullDocument);
    const exist_updatedUser = await db.collection(nameCollections.admin).findOne({ id: admin.id});
    if(!exist_updatedUser) return;
    const tmpPassowrd = decryptPassword(exist_updatedUser.password);
      // Enviar correo con la nueva contraseña
    // await sendMail(
    //   admin.email,
    //   `Security - ${process.env.NAME_APP}`,
    //   `Hola ${admin.firstNames},\n\nTu nueva contraseña temporal es:\n\n${tmpPassowrd}\n\nPor seguridad, te recomendamos cambiarla una vez inicies sesión.\n\nSaludos,\nEquipo VPN Carlosvm`
    // );
}

async function AuthStream(db, change) {
    UpdatePassword(db, change);
}

module.exports = {
    AuthStream
}