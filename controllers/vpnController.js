const { getDB, nameCollections } = require("../services/dbServices");
const CertificateEntity = require("../models/certificateEntity");
const { v4: uuidv4 } = require("uuid");

const fs = require("fs");
const { checkRole } = require("../middlewares/verifyRoleMiddleware");
const { encryptPassword } = require("../utils/encrypt_decrypt");

const path = require("path");
const { runCommandAcross } = require("../services/sshPoolService");

async function get(req, res) {
  try {
    const aggregate = !!req?.body?.aggregate ? req?.body?.aggregate : [];
    const build_aggregate = [
      ...aggregate
    ]
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.certificates).aggregate(build_aggregate).toArray();
    res.status(200).send({code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: resultaSave})
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realizar la consulta!"});
  }
}

async function crear(req, res) {
  try {
    const datEntity = new CertificateEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    console.log("crear datEntity: ", datEntity)
    
    const db = getDB();
    const dataToSave = datEntity.get();

    const servers = await db.collection(nameCollections.servers)
      .find({ id: dataToSave.server_id })
      .toArray();
    if (!servers?.length) {
      return res.status(404).send({ code: "NoEncontrado", status: 404, message: "El servidor ha dejado de existir" });
    }

    const shArg = (v) => `'${String(v ?? "").replace(/'/g, `'\\''`)}'`; // shell-safe
    const toInt = (x) => Number.isFinite(Number(x)) ? Number(x) : null;
    const ceilDaysDiff = (fromISO, toISO) => {
      try {
        const a = new Date(fromISO), b = new Date(toISO);
        const ms = b - a;
        if (!isFinite(ms)) return null;
        return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
      } catch { return null; }
    };

    let validDays = toInt(dataToSave.valid_days);
    if (!validDays) {
      if (dataToSave.expires_at) {
        validDays = ceilDaysDiff(new Date().toISOString(), dataToSave.expires_at) || 365;
      } else {
        validDays = 365;
      }
    }

    const srv = servers[0] || {};
    const hostname =
      dataToSave.hostname ||
      srv.hostname ||
      srv.public_dns ||
      srv.public_ip ||
      dataToSave.server || // por compatibilidad con tu payload previo
      "host.local";

    let tagsArg = dataToSave.tags;
    if (Array.isArray(tagsArg)) {
      tagsArg = JSON.stringify(tagsArg);
    } else if (typeof tagsArg === "string") {
    } else if (!tagsArg) {
      tagsArg = "[]";
    }

    const cmd = [
      "docker exec ubuntu-openvpn bash /scripts/crear_usuario.sh",
      shArg(dataToSave.user),
      shArg(dataToSave.device),
      shArg(dataToSave.device_id),
      shArg(dataToSave.user_id),
      shArg(dataToSave.server_id),
      shArg(hostname),
      shArg(validDays),        // número, pero va como string safely quoted
      shArg(tagsArg),
      shArg(dataToSave.note ?? "")
    ].join(" ");

    const resultal = await runCommandAcross(
      servers,
      () => ({ privateKey: process.env.SSH_KEY  }),
      cmd,
      { timeoutMs: 60000 } // más margen por la generación del cert
    );

    const failed = Array.isArray(resultal) && resultal.find(r => r && r.ok === false);
    if (failed) {
      console.error("crear_usuario.sh error:", failed);
      return res.status(500).send({
        code: "script_error",
        status: 500,
        message: failed.stdout || failed.stderr || "Fallo al generar el certificado",
        detail: failed
      });
    }

    await db.collection(nameCollections.certificates).insertOne({
      ...dataToSave,
      valid_days: validDays,
      hostname,
      created_at: new Date().toISOString()
    });

    const [ result ] = await runCommandAcross(servers, (server) => {
        return { 
            privateKey: process.env.SSH_KEY, 
          };
        },
        `docker exec ubuntu-openvpn bash /scripts/descargar_ovpn.sh \
        "${dataToSave.user}"`,
        { timeoutMs: 15000 }
    )
    if (result?.stderr) {
      console.error("❌ Error remoto:", result.stderr);
      return res.status(500).send("Error generando archivo .ovpn");
    }
    const ovpnContent = result?.stdout;    
    if (!ovpnContent || !ovpnContent.includes("client") || !ovpnContent.includes("<ca>")) {
      return res.status(400).send("❌ Contenido inválido recibido del servidor");
    }
    const resultaSave = await db.collection(nameCollections.devices).updateOne( { id: dataToSave.device_id }, { $set: { certificate: ovpnContent } } );
    return res.status(200).send({
      code: "registrado",
      status: 200,
      message: "✅ El certificado fue generado y registrado exitosamente!."
    });

  } catch (err) {
    console.error("❌ Error general:", err);
    return res.status(500).send({ code: "error", status: 500, message: "Error al generar y registrar certificado." });
  }
}

async function revocar(req, res) {
  try {
    const db = getDB();
    const { user_id, device_id, server_id, revoked } = req.body;
    const certificate = await db.collection(nameCollections.certificates).findOne({user_id, device_id, server_id});
    if(!certificate) { return res.status(400).send({code: "NoEncontrado", status: 404, message: "El certificado ha dejado de existir"}); }

    const servers = await db.collection(nameCollections.servers)
      .find({ id: server_id })
      .toArray();
    if (!servers?.length) {
      return res.status(404).send({ code: "NoEncontrado", status: 404, message: "El servidor ha dejado de existir" });
    }

    const datEntity = new CertificateEntity();
    datEntity.set(certificate);
    datEntity.revoked = revoked;
    const dataToSave = datEntity.get();
    
    const resultal = await runCommandAcross(servers, (server) => {
        return { 
            privateKey: process.env.SSH_KEY, 
          };
        },
        `docker exec ubuntu-openvpn bash /scripts/revoke_usuario.sh \
        "${dataToSave.user}.ovpn"`,
        { timeoutMs: 15000 }
    )
    const exist = await db.collection(nameCollections.certificates).updateOne({
      user_id: dataToSave.user_id,
      device_id: dataToSave.device_id,
      server_id: dataToSave.server_id,
    }, {$set: { revoked: datEntity.revoked }});
    console.log("resultal: ", resultal)
    res.status(200).send({code: "registrado", status: 200, message: "✅ El certificado fue revokado exitosamente!."});
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).send("Error al revokar el certificado.");
  }
}

async function suspender(req, res) {
  try {
    const db = getDB();
    const { user_id, device_id, server_id, suspended } = req.body;
    const certificate = await db.collection(nameCollections.certificates).findOne({user_id, device_id, server_id});
    if(!certificate) { return res.status(400).send({code: "NoEncontrado", status: 404, message: "El certificado ha dejado de existir"}); }

    const servers = await db.collection(nameCollections.servers)
      .find({ id: server_id })
      .toArray();
    if (!servers?.length) {
      return res.status(404).send({ code: "NoEncontrado", status: 404, message: "El servidor ha dejado de existir" });
    }

    const datEntity = new CertificateEntity();
    datEntity.set(certificate);
    datEntity.suspended = suspended;
    const dataToSave = datEntity.get();
    
    const resultal = await runCommandAcross(servers, (server) => {
        return { 
            privateKey: process.env.SSH_KEY, 
          };
        },
        `docker exec ubuntu-openvpn bash /scripts/suspender_usuario.sh \
        "${dataToSave.user}.ovpn"`,
        { timeoutMs: 15000 }
    )
    const exist = await db.collection(nameCollections.certificates).updateOne({
      user_id: dataToSave.user_id,
      device_id: dataToSave.device_id,
      server_id: dataToSave.server_id,
    }, {$set: { suspended: datEntity.suspended }});
    console.log("resultal: ", resultal)
    res.status(200).send({code: "registrado", status: 200, message: "✅ El certificado fue suspendido exitosamente!."});
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).send("Error al sustender el certificado.");
  }
}

async function reactivar(req, res) {
  try {
    const db = getDB();
    const { user_id, device_id, server_id, suspended } = req.body;
    const certificate = await db.collection(nameCollections.certificates).findOne({user_id, device_id, server_id});
    if(!certificate) { return res.status(400).send({code: "NoEncontrado", status: 404, message: "El certificado ha dejado de existir"}); }

    const servers = await db.collection(nameCollections.servers)
      .find({ id: server_id })
      .toArray();
    if (!servers?.length) {
      return res.status(404).send({ code: "NoEncontrado", status: 404, message: "El servidor ha dejado de existir" });
    }

    const datEntity = new CertificateEntity();
    datEntity.set(certificate);
    datEntity.suspended = suspended;
    const dataToSave = datEntity.get();
    
    const resultal = await runCommandAcross(servers, (server) => {
        return { 
            privateKey: process.env.SSH_KEY, 
          };
        },
        `docker exec ubuntu-openvpn bash /scripts/reactivar_usuario.sh \
        "${dataToSave.user}.ovpn"`,
        { timeoutMs: 15000 }
    )
    const exist = await db.collection(nameCollections.certificates).updateOne({
      user_id: dataToSave.user_id,
      device_id: dataToSave.device_id,
      server_id: dataToSave.server_id,
    }, {$set: { suspended: datEntity.suspended }});
    res.status(200).send({code: "registrado", status: 200, message: "✅ El certificado fue suspendido exitosamente!."});
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).send("Error al sustender el certificado.");
  }
}

/**
 * eliminar — Elimina permanentemente un certificado de la DB y del servidor VPN
 * DELETE /api/vpn/certificates/:id  body: { user_id, device_id, server_id }
 */
async function eliminar(req, res) {
  try {
    const db = getDB();
    const { user_id, device_id, server_id } = req.body;

    if (!user_id || !device_id || !server_id) {
      return res.status(400).send({ code: "error", status: 400, message: "user_id, device_id y server_id son requeridos" });
    }

    const certificate = await db.collection(nameCollections.certificates).findOne({ user_id, device_id, server_id });
    if (!certificate) {
      return res.status(404).send({ code: "no_encontrado", status: 404, message: "El certificado no existe" });
    }

    const servers = await db.collection(nameCollections.servers).find({ id: server_id }).toArray();
    if (servers?.length) {
      try {
        await runCommandAcross(
          servers,
          () => ({ privateKey: process.env.SSH_KEY }),
          `docker exec ubuntu-openvpn bash /scripts/revoke_usuario.sh "${certificate.user}.ovpn"`,
          { timeoutMs: 15000 }
        );
      } catch (sshErr) {
        // SSH opcional — si el servidor ya no está disponible continuamos con la eliminación en DB
        console.warn("[vpn/eliminar] SSH falló, eliminando solo en DB:", sshErr.message);
      }
    }

    // Eliminar certificado de la colección
    await db.collection(nameCollections.certificates).deleteOne({ user_id, device_id, server_id });

    // Limpiar el campo certificate del device
    await db.collection(nameCollections.devices).updateOne(
      { id: device_id },
      { $set: { certificate: null, state: "revoked", updatedAt: new Date() } }
    );

    const { logFromReq } = require("../utils/binnacle");
    await logFromReq(req, "delete_certificate", device_id, "certificate", { user_id, server_id });

    return res.status(200).send({ code: "eliminado", status: 200, message: "✅ Certificado eliminado correctamente." });
  } catch (err) {
    console.error("vpnController.eliminar:", err);
    return res.status(500).send({ code: "error", status: 500, message: "Error al eliminar el certificado" });
  }
}

async function desconectar (req, res) {
  const { usuario } = req.body;
  exec(`bash ./desconectar_usuario.sh ${usuario}`, (error, stdout, stderr) => {
    if (error) return res.status(500).send(stderr);
    res.send(stdout);
  });
}

async function listar (req, res) {
    const ssh = await connectToServer({
    host: "209.50.62.21",
    username: "root",
    port: 22,
    privateKey: process.env.SSH_KEY.replace(/\\n/g, "\n"),
  });

  console.log("📦 Ejecutando script remoto para listar conexiones activas ....");

  const result = await ssh.execCommand(
    `docker exec ubuntu-openvpn bash /scripts/listar_conectados.sh"`
  );

  if (result.stderr) {
    console.error("❌ Error remoto:", result.stderr);
    return res.status(500).send(`Error al listar usurios`);
  }
  res.send(result.stdout);
}

async function logs (req, res) {
  const ssh = await connectToServer({
    host: "209.50.62.21",
    username: "root",
    port: 22,
    privateKey: process.env.SSH_KEY.replace(/\\n/g, "\n"),
  });

  console.log("📦 Ejecutando script remoto para leer logs ....");

  const result = await ssh.execCommand(
    `docker exec ubuntu-openvpn tail -n 50 /var/log/openvpn/conexiones.json`
  );

  if (result.stderr) {
    console.error("❌ Error remoto:", result.stderr);
    return res.status(500).send(`Error al logs`);
  }
  res.send(result.stdout);
}


async function descargar (req, res) {
  try {
      const db = getDB();
      const { user_id, device_id, server_id } = req.body;
      const certificate = await db.collection(nameCollections.certificates).findOne({user_id, device_id, server_id});
      if(!certificate) { return res.status(400).send({code: "NoEncontrado", status: 404, message: "El certificado ha dejado de existir"}); }

      const datEntity = new CertificateEntity();
      datEntity.set(certificate);
      const dataToSave = datEntity.get();

      const device = await db.collection(nameCollections.devices).findOne({user_id, id: device_id, server_id});
      if(!device) { return res.status(400).send({code: "NoEncontrado", status: 404, message: "El dispositivo ha dejado de existir"}); }

      const servers = await db.collection(nameCollections.servers)
        .find({ id: server_id })
        .toArray();
      if (!servers?.length) {
        return res.status(404).send({ code: "NoEncontrado", status: 404, message: "El servidor ha dejado de existir" });
      }

      let ovpnContent = "";
      if(!!device && !!device?.certificate) {
        ovpnContent = device?.certificate;
      } else {
        const [ result ] = await runCommandAcross(servers, (server) => {
            return { 
                privateKey: process.env.SSH_KEY, 
              };
            },
            `docker exec ubuntu-openvpn bash /scripts/descargar_ovpn.sh \
            "${dataToSave.user}"`,
            { timeoutMs: 15000 }
        )

        if (result?.stderr) {
          console.error("❌ Error remoto:", result.stderr);
          return res.status(500).send("Error generando archivo .ovpn");
        }
        ovpnContent = result?.stdout;
      }

      if (!ovpnContent || !ovpnContent.includes("client") || !ovpnContent.includes("<ca>")) {
        return res.status(400).send("❌ Contenido inválido recibido del servidor");
      }

      const tempPath = path.join(__dirname, `${dataToSave.user}.ovpn`);
      fs.writeFileSync(tempPath, ovpnContent, "utf8");

      res.download(tempPath, `${dataToSave.user}.ovpn`, (err) => {
        if (err) {
          console.error("Error al enviar el archivo:", err);
        }
        fs.unlinkSync(tempPath);
      });
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).send("Error al sustender el certificado.");
  }
}

async function conexiones (req, res) {
  const logPath = "/ruta/local/montada/a/logs/conexiones.log";
  if (fs.existsSync(logPath)) {
    const contenido = fs.readFileSync(logPath, "utf8");
    res.type("text/plain").send(contenido);
  } else {
    res.status(404).send("Log no encontrado.");
  }
}

async function usuarios (req, res) {
  try {
    const users = await VpnUser.find({}, "username createdAt role revoked");
    res.json(users);
  } catch (err) {
    res.status(500).send("Error al obtener usuarios");
  }
}

async function usuarios_dispositivos (req, res) {
  const { usuario } = req.params;
  try {
    const user = await VpnUser.findOne({ username: usuario });
    if (!user) return res.status(404).send("Usuario no encontrado");
    res.json(user.devices);
  } catch (err) {
    res.status(500).send("Error al obtener dispositivos");
  }
}

async function usuarios_certificado (req, res) {
  const { usuario, dispositivo } = req.params;
  const filename = `${usuario}.ovpn`; // en futuro: `${usuario}-${dispositivo}.ovpn`
  const filePath = path.join(__dirname, "..", `${filename}`);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("Archivo .ovpn no encontrado");
  }
}

async function usuarios_historial (req, res) {
  const { usuario } = req.params;
  try {
    const user = await VpnUser.findOne({ username: usuario });
    if (!user) return res.status(404).send("Usuario no encontrado");
    res.json(user.devices);
  } catch (err) {
    res.status(500).send("Error al obtener historial");
  }
}

module.exports = {
    get,
    crear,
    revocar,
    suspender,
    reactivar,
    eliminar,
    desconectar,
    listar,
    logs,
    descargar,
    conexiones,
    usuarios,
    usuarios_dispositivos,
    usuarios_certificado,
    usuarios_historial
};
