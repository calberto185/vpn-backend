const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const { decryptPassword, encryptPassword } = require("../utils/encrypt_decrypt");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwtService");
const SessionsEntity = require("../models/sessionsEntity");
const AdminEntity = require("../models/adminEntity");
const { sendMail } = require("../shared/mailer");
const { checkRole } = require("../middlewares/verifyRoleMiddleware");
const { OAuth2Client } = require("google-auth-library");

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({
        code: "faltan_datos",
        status: 400,
        message: "Debe proporcionar email y contraseña",
      });
    }

    const db = getDB();
    const dataUser = await db.collection(nameCollections.admin).findOne({ email });
    if (!dataUser) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Credenciales inválidas",
      });
    }
    const user = new AdminEntity();
    user.set(dataUser)

    // Desencriptar contraseña guardada
    const decryptedStoredPassword = decryptPassword(user.password);

    // Comparar contraseñas
    if (password !== decryptedStoredPassword) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Credenciales inválidas",
      });
    }
    if (user.bloqued) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta fue bloqueada!. Contactar con el administrador!.",
      });
    }
    if (user.suspend) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta fue suspendida!. Contactar con el administrador!.",
      });
    }
    if (!user.verified) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta aun no ha sido verificada!. En breve seré veridicada!.",
      });
    }
    const payload = {
      id: user.id,
      email: user.email,
      firstNames: user.firstNames,
      role: user.role,
      picture: user.picture,
      // services: user.services,
      bloqued: user.bloqued,
      suspend: user.suspend,
      verified: user.verified,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const dataSession = new SessionsEntity();
    dataSession.id = uuidv4();
    dataSession.user_id = user.id;
    dataSession.token = refreshToken;
    dataSession.createdAt = new Date();
    dataSession.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    dataSession.ip = req.ip;
    dataSession.userAgent = req.headers['user-agent'];
    console.log("dataSession: ", dataSession)
    await db.collection(nameCollections.sessions).insertOne(dataSession);

      // 🧠 Guardar el refresh_token como cookie segura
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProd, // ❗ Solo funciona sobre HTTPS (en producción)
    sameSite: isProd ? "None" : "Lax",
    // path: "/api/auth/refresh",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días en milisegundos
  });

    return res.status(200).send({
      code: "autenticado",
      status: 200,
      message: "Se ha autenticado exitosamente.",
      data: {
        user: payload,
        access_token: accessToken,
        // refresh_token: refreshToken,
      },
    });
  } catch (error) {
    console.error("🔴 Error en login:", error);
    return res.status(500).send({
      code: "error_servidor",
      status: 500,
      message: "Error interno al autenticar usuario",
    });
  }
}
async function loginGoogle(req, res) {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_AUTH_CLIENT_ID);
    const { jwt } = req.body;

    if (!jwt) {
      return res.status(400).send({
        code: "faltan_datos",
        status: 400,
        message: "La authenticacion con google ha fallado, intentar mas tarde!",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: jwt,
      audience: process.env.GOOGLE_AUTH_CLIENT_ID,
    });
    const { sub, email, name, picture } = ticket.getPayload();

    if (!email) {
      return res.status(400).send({
        code: "invalid_auth_google",
        status: 400,
        message: "La authenticacion con google ha fallado, intentar mas tarde!",
      });
    }
    const db = getDB();
    const dataUser = await db.collection(nameCollections.admin).findOne({ email });

    if (!dataUser) {
      return res.status(400).send({
        code: "invalid_auth_google",
        status: 400,
        message: "Tu cuenta google no esta asociada a ningun email, registrate primero!",
      });
    }
    const user = new AdminEntity();
    user.set(dataUser)
    if (!dataUser) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Cuenta de usuario no registrado!.",
      });
    }
    if (user.bloqued) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta fue bloqueada!. Contactar con el administrador!.",
      });
    }
    if (user.suspend) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta fue suspendida!. Contactar con el administrador!.",
      });
    }
    if (!user.verified) {
      return res.status(401).send({
        code: "no_autorizado",
        status: 401,
        message: "Su cuenta aun no ha sido verificada!. En breve seré veridicada!.",
      });
    }


  
    const payload = {
      id: user.id,
      email: user.email,
      firstNames: user.firstNames,
      role: user.role,
      picture: picture,
      // services: user.services
      bloqued: user.bloqued,
      suspend: user.suspend,
      verified: user.verified,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const dataSession = new SessionsEntity();
    dataSession.id = uuidv4();
    dataSession.user_id = user.id;
    dataSession.token = refreshToken;
    dataSession.createdAt = new Date();
    dataSession.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    dataSession.ip = req.ip;
    dataSession.userAgent = req.headers['user-agent'];
    await db.collection(nameCollections.sessions).insertOne(dataSession);

      // 🧠 Guardar el refresh_token como cookie segura
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProd, // ❗ Solo funciona sobre HTTPS (en producción)
    sameSite: isProd ? "None" : "Lax",
    // path: "/api/auth/refresh",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días en milisegundos
  });

    return res.status(200).send({
      code: "autenticado",
      status: 200,
      message: "Se ha autenticado exitosamente.",
      data: {
        user: payload,
        access_token: accessToken,
        // refresh_token: refreshToken,
      },
    });
  } catch (error) {
    console.error("🔴 Error en login:", error);
    return res.status(500).send({
      code: "error_servidor",
      status: 500,
      message: "Error interno al autenticar usuario",
    });
  }
}

async function refreshToken(req, res) {
  try {
    const refresh_token = req.cookies.refresh_token;
    if (!refresh_token) {
      return res.status(400).send({
        code: "token_faltante",
        status: 400,
        message: "No se proporcionó el refresh_token",
      });
    }

    const db = getDB();
    const storedToken = await db.collection(nameCollections.sessions).findOne({ token: refresh_token });
    if (!storedToken) {
      return res.status(403).send({
        code: "token_invalido",
        status: 403,
        message: "Refresh token inválido" });
    }

    // Verificamos refresh_token
    const payload = verifyRefreshToken(refresh_token); // lanza error si es inválido
    const exist_user = await db.collection(nameCollections.admin).findOne({ email: payload.email, id: payload.id });
    if (!exist_user) {
      return res.status(403).send({
        code: "token_invalido",
        status: 403,
        message: "Refresh token inválido" });
    }
    const user = new AdminEntity();
    user.set(exist_user)

    // Crear nuevo access_token con el mismo payload
    const newAccessToken = generateAccessToken({
      id: payload.id,
      email: payload.email,
      firstNames: payload.firstNames,
      role: user.role,
      picture: user.picture,
      // services: payload.services,
      bloqued: user.bloqued,
      suspend: user.suspend,
      verified: user.verified,
    });

    return res.status(200).send({
      code: "token_actualizado",
      status: 200,
      message: "Access token renovado correctamente",
      data: {
        user: payload,
        access_token: newAccessToken,
      },
    });
  } catch (err) {
    console.error("❌ Error al refrescar token:", err.message);
    return res.status(403).send({
      code: "token_invalido",
      status: 403,
      message: "Refresh token inválido o expirado",
    });
  }


// En el frontend (ej. fetch o axios):
// js
// Copy
// Edit
// // Axios ejemplo
// axios.post("/auth/refresh", {}, {
//   withCredentials: true // 🔑 permite enviar cookies HttpOnly
// });

}

async function logout(req, res) {
  try {

    const refresh_token = req.cookies.refresh_token;
    if (!refresh_token) {
      return res.status(400).send({
        code: "token_faltante",
        status: 400,
        message: "No se proporcionó refresh_token",
      });
    }

    const db = getDB();
    const result = await db.collection(nameCollections.sessions).deleteOne({ token: refresh_token });
    res.clearCookie("refresh_token", {
      httpOnly: true,
      // secure: true,
      sameSite: "Strict",
      path: "/api/auth/refresh"
    });
    
    return res.status(200).send({
      code: "logout_ok",
      status: 200,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("❌ Error en logout:", error.message);
    return res.status(500).send({
      code: "error_logout",
      status: 500,
      message: "No se pudo cerrar sesión",
    });
  }
}

async function recoverPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({
        code: "email_faltante",
        status: 400,
        message: "Debe proporcionar un correo",
      });
    }

    const db = getDB();
    const dataUser = await db.collection(nameCollections.admin).findOne({ email });

    if (!dataUser) {
      return res.status(404).send({
        code: "usuario_no_encontrado",
        status: 404,
        message: "No se encontró ningún usuario con ese correo",
      });
    }

    // Generar nueva contraseña temporal segura
    const newPassword = Math.random().toString(36).slice(-10); // Ej: "83ghsd2hga"

    // Encriptar la nueva contraseña
    const encryptedPassword = encryptPassword(newPassword.toString());

    // Actualizar contraseña en la base de datos
    await db.collection(nameCollections.admin).updateOne(
      { email },
      { $set: { password: encryptedPassword } }
    );

    // Enviar email con nueva contraseña
    try {
      await sendMail(
        email,
        "Recuperación de contraseña",
        `Tu nueva contraseña temporal es: ${newPassword}\n\nCámbiala después de iniciar sesión.`
      );
    } catch (mailErr) {
      console.warn("recoverPassword: email no enviado:", mailErr.message);
    }

    return res.status(200).send({
      code: "correo_enviado",
      status: 200,
      message: "Se ha enviado una nueva contraseña a tu correo",
    });
  } catch (error) {
    console.error("❌ Error en recoverPassword:", error);
    return res.status(500).send({
      code: "error_recover",
      status: 500,
      message: "No se pudo recuperar la contraseña",
    });
  }
}

async function signup(req, res) {
  try {
    const datEntity = new AdminEntity();
    // El signup público SIEMPRE crea un cliente (role: "client")
    // Los campos sensibles se ignoran del body sin importar lo que envíe
    const { firstNames, lastNames, email, password, country, dni, telephone } = req.body;
    datEntity.set({ firstNames, lastNames, email, password, country, dni, telephone });
    datEntity.password  = encryptPassword(datEntity.password);
    datEntity.id        = uuidv4();
    datEntity.role      = "client";   // siempre client en signup público
    datEntity.isAdmin   = false;
    datEntity.verified  = false;      // requiere verificación manual del admin
    datEntity.state     = "Pendiente";
    datEntity.services  = [];
    datEntity.createdAt = new Date();

    const db   = getDB();
    const data = datEntity.get();
    const exist = await db.collection(nameCollections.admin).findOne({ email: data.email });
    if (exist) {
      return res.status(400).send({ code: "duplicado", status: 400, message: "Usuario ya existe" });
    }
    await db.collection(nameCollections.admin).insertOne(data);
    res.status(200).send({ code: "registrado", status: 200, message: "✅ Registrado exitosamente." });
  } catch (err) {
    console.log("signup err:", err);
    res.status(500).send({ code: "error", status: 500, message: "Error al registrar usuario" });
  }
}

async function signupGoogle(req, res) {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_AUTH_CLIENT_ID);
    const { jwt } = req.body;

    if (!jwt) {
      return res.status(400).send({
        code: "faltan_datos",
        status: 400,
        message: "El registro con google ha fallado, intentar mas tarde!",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: jwt,
      audience: process.env.GOOGLE_AUTH_CLIENT_ID,
    });
    const { sub, email, name, picture, given_name, family_name } = ticket.getPayload();
    const datEntity = new AdminEntity();
    datEntity.email      = email;
    datEntity.firstNames = given_name || name?.split(" ")[0] || "Cliente";
    datEntity.lastNames  = family_name || name?.split(" ").slice(1).join(" ") || "";
    datEntity.picture    = picture || "";
    datEntity.password   = encryptPassword(uuidv4()); // Google users no usan password
    datEntity.id         = uuidv4();
    datEntity.role       = "client";
    datEntity.isAdmin    = false;
    datEntity.verified   = true;   // Google = auto-verificado
    datEntity.verifiedAt = new Date();
    datEntity.state      = "Activo";
    datEntity.services   = [];
    datEntity.createdAt  = new Date();
    const db = getDB();
    const dataToSave = datEntity;
    const exist = await db.collection(nameCollections.admin).findOne({ email: dataToSave.email });
    if (exist) { return res.status(400).send({ code: "duplicado", status: 400, message: "Usuario ya existe" }); }
    await db.collection(nameCollections.admin).insertOne(dataToSave);

     // Enviar correo con la nueva contraseña
    // await sendMail(
    //   email,
    //   "Registro - VPN Access",
    //   `Hola,\n\nTu cuenta ha sido registrado con Google exitosamente.\n\nLe agradecemos su preferencia.\n\nSaludos,\nEquipo VPN Access`
    // );
    res.status(200).send({code: "registrado", status: 200, message: "✅ Registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar usuario"});
  }
}
async function meProfile(req, res) {
  try {
    const { 
      id,
      email,
      role,
      firstNames,
      picture
    } = req.user;

    if (!id || !email) {
      return res.status(401).send({
        code: "faltan_datos",
        status: 401,
        message: "Datos insuficientes para consumir este recurso",
      });
    }

    const db = getDB();
    const [dataUser] = await db.collection(nameCollections.admin).aggregate([
      {
        "$match": {
          "id": id,
          "email": email
        }
      },
      {
        "$addFields": {
          "password": "",
        }
      }
    ]).toArray();
    if (!dataUser) {
      return res.status(404).send({
        code: "no_encontrado",
        status: 404,
        message: "No se encontro al usuario con estas credenciales!.",
      });
    }
    const user = new AdminEntity();
    user.set(dataUser)

    return res.status(200).send({
      code: "Consultado",
      status: 200,
      message: "Consulta exitosa.",
      data: user,
    });
  } catch (error) {
    console.error("🔴 Error en login:", error);
    return res.status(500).send({
      code: "error_servidor",
      status: 500,
      message: "Error interno al autenticar usuario",
    });
  }
}
module.exports = {
  login,
  loginGoogle,
  refreshToken,
  logout,
  recoverPassword,
  signup,
  signupGoogle,
  meProfile
};