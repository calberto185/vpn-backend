/**
 * devicesController.js
 *
 * Gestión de dispositivos/accesos VPN.
 * Soporta dos protocolos: "s-ui" (VLESS/Hysteria2) y "openvpn" (.ovpn cert)
 *
 * Rutas admin:   GET/POST/PUT /api/devices/*
 * Rutas cliente: GET/POST     /api/devices/client/*
 */

const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 }             = require("uuid");
const DevicesEntity              = require("../models/deviceEntity");
const ActivitiesDeviceEntity     = require("../models/activitiesDeviceEntity");
const CertificateEntity          = require("../models/certificateEntity");
const AdminEntity                = require("../models/adminEntity");
const ServersEntity              = require("../models/serversEntity");
const sui                        = require("../services/suiService");
const dayjs                      = require("dayjs");
const fs                         = require("fs");
const path                       = require("path");

// ─── Admin: listar dispositivos ───────────────────────────────────────────────
async function get(req, res) {
  try {
    const filter = req.body?.aggregate || [];
    const db     = getDB();
    const result = await db.collection(nameCollections.devices)
      .aggregate(filter).toArray();
    res.status(200).json({ code: "registros", status: 200, data: result });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Admin: crear dispositivo manualmente ─────────────────────────────────────
async function create(req, res) {
  try {
    const entity = new DevicesEntity();
    entity.set(req.body);
    entity.id        = uuidv4();
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    const db   = getDB();
    const data = entity.get();
    await db.collection(nameCollections.devices).insertOne(data);
    res.status(200).json({ code: "registrado", message: "✅ Dispositivo registrado" });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Admin: actualizar dispositivo (bug fix: db y dataToSave declarados correctamente) ──
async function update(req, res) {
  try {
    const db      = getDB();
    const { id }  = req.body;
    if (!id) return res.status(400).json({ code: "faltan_datos", message: "id requerido" });
    const exist = await db.collection(nameCollections.devices).findOne({ id });
    if (!exist) return res.status(404).json({ code: "no_encontrado", message: "Dispositivo no encontrado" });
    const entity = new DevicesEntity();
    entity.set(exist);
    entity.set(req.body);
    entity.updatedAt = new Date();
    await db.collection(nameCollections.devices).updateOne({ id }, { $set: entity });
    res.status(200).json({ code: "actualizado", message: "✅ Dispositivo actualizado" });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Cliente: listar sus dispositivos ────────────────────────────────────────
async function getDevicesClient(req, res) {
  try {
    const db      = getDB();
    const user_id = req.user.id;
    const active  = req.query.isActive === "true";
    const filter  = [
      { $match: { user_id, revoked: false, ...(active && { active: true }) } },
      { $project: { sui_config: 0, certificate: 0 } }, // no exponer credenciales completas
    ];
    const result = await db.collection(nameCollections.devices).aggregate(filter).toArray();
    res.status(200).json({ code: "registros", data: result });
  } catch (e) {
    res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Cliente: crear dispositivo (multi-protocolo) ─────────────────────────────
async function createDevicesClient(req, res, next) {
  try {
    const db      = getDB();
    const user    = req.user;
    const { device, service, typeDevice } = req.body;

    if (!device || !service || !typeDevice) {
      return res.status(400).json({ code: "campos_invalidos",
        message: "device, service y typeDevice son requeridos" });
    }

    // Verificar perfil y plan
    const raw = await db.collection(nameCollections.admin).findOne({ id: user.id });
    if (!raw) return res.status(404).json({ code: "no_encontrado", message: "Perfil no encontrado" });
    const profile = new AdminEntity();
    profile.set(raw);

    const plan = profile.services.find(s => s.plan_id === service);
    if (!plan)         return res.status(404).json({ code: "plan_no_encontrado", message: "Plan no encontrado" });
    if (!plan.active)  return res.status(403).json({ code: "plan_inactivo",   message: `Plan ${plan.plan_title_name} suspendido` });
    if (!plan.visible) return res.status(403).json({ code: "plan_no_disponible", message: `Plan ${plan.plan_title_name} no disponible` });

    // Verificar límite de dispositivos
    const deviceCount = await db.collection(nameCollections.devices).countDocuments({
      user_id: user.id, revoked: false,
    });
    if (plan.limitDevices > 0 && deviceCount >= plan.limitDevices) {
      return res.status(403).json({ code: "limite_dispositivos",
        message: `Tu plan permite máximo ${plan.limitDevices} dispositivos` });
    }

    // Resolver servidor
    const [serverRef] = plan?.servers || [];
    if (!serverRef) return res.status(404).json({ code: "servidor_no_asignado" });
    const rawServer = await db.collection(nameCollections.servers).findOne({ id: serverRef.server_id, active: true });
    if (!rawServer) return res.status(404).json({ code: "servidor_no_disponible" });
    const server = new ServersEntity();
    server.set(rawServer);

    // ── Crear dispositivo según protocolo ─────────────────────────────────────
    const deviceEntity = new DevicesEntity();
    deviceEntity.id         = uuidv4();
    deviceEntity.user_id    = user.id;
    deviceEntity.plan_id    = plan.plan_id;
    deviceEntity.service_id = plan.service_id;
    deviceEntity.server_id  = server.id;
    deviceEntity.device     = device;
    deviceEntity.typeDevice = typeDevice;
    deviceEntity.active     = true;
    deviceEntity.createdAt  = new Date();
    deviceEntity.updatedAt  = new Date();

    if (server.protocol === "s-ui" || server.protocol === "both") {
      // ── S-UI: crear cliente en el panel ────────────────────────────────────
      deviceEntity.protocol = "s-ui";

      const now      = dayjs();
      const email    = `${(plan.service_sortName || "VPN").toUpperCase()}-` +
                       `${String(now.date()).padStart(2,"0")}th-` +
                       `${(raw.firstNames || "").replace(/\s+/g,"")}-` +
                       `${user.id.slice(0,8)}`;

      const gbLimite = plan.details?.find(d => d.key === "gb")?.value     || 50;
      const dias     = plan.details?.find(d => d.key === "dias")?.value   || 30;

      const suiResult = await sui.agregarCliente(rawServer, {
        email,
        gbLimite: Number(gbLimite),
        dias:     Number(dias),
        desc:     `${raw.firstNames} ${raw.lastNames}`,
      });

      if (!suiResult.success) {
        return res.status(500).json({ code: "sui_error", message: suiResult.error });
      }

      deviceEntity.sui_uuid   = suiResult.sui_uuid;
      deviceEntity.sui_email  = suiResult.sui_email;
      deviceEntity.sui_sub_id = suiResult.sub_id;
      deviceEntity.sui_config = suiResult.sui_config;

      await db.collection(nameCollections.devices).insertOne(deviceEntity);

      // Actualizar services[] en el cliente
      const now2 = new Date();
      await db.collection(nameCollections.admin).updateOne(
        { id: user.id, "services.plan_id": plan.plan_id },
        { $set: { "services.$.device_id": deviceEntity.id, "services.$.updatedAt": now2 } }
      );

      return res.status(200).json({
        code:    "registrado",
        message: "✅ Dispositivo VPN creado (S-UI)",
        data: {
          device_id:  deviceEntity.id,
          sui_email:  suiResult.sui_email,
          sub_url:    suiResult.sub_url,
        },
      });

    } else {
      // ── OpenVPN: delegar al vpnController via next() ────────────────────────
      deviceEntity.protocol = "openvpn";
      await db.collection(nameCollections.devices).insertOne(deviceEntity);

      const now      = dayjs();
      const fechaNum = Number(`${now.year()}${String(now.month()+1).padStart(2,"0")}` +
                              `${String(now.date()).padStart(2,"0")}${String(now.hour()).padStart(2,"0")}` +
                              `${String(now.minute()).padStart(2,"0")}${String(now.second()).padStart(2,"0")}`);

      const userName   = `${server.country?.countryCode || "XX"}-${fechaNum}-${device}-${typeDevice}`;
      const serverName = `${server.name}-${server.country?.countryCode || "XX"}`;

      const cert      = new CertificateEntity();
      cert.user_id    = user.id;
      cert.user       = userName.replaceAll(" ", "-");
      cert.hostname   = serverName.replaceAll(" ", "-");
      cert.server_id  = server.id;
      cert.server     = serverName.replaceAll(" ", "-");
      cert.device_id  = deviceEntity.id;
      cert.device     = device;
      cert.ip         = server.host;
      cert.profile_type = user.role;
      cert.tags       = typeDevice;
      cert.valid_days = "365";
      cert.expires_at = new Date(Date.now() + 365 * 86400000).toISOString();
      cert.note       = "generado por cliente";
      cert.version    = "2";

      req.body = cert; // el vpnController.crear lee de req.body
      next();
    }
  } catch (e) {
    console.error("createDevicesClient:", e);
    res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Cliente: descargar certificado .ovpn ────────────────────────────────────
async function downloadCertificateClient(req, res) {
  try {
    const db = getDB();
    const { user_id, device_id, server_id } = req.body;

    const cert = await db.collection(nameCollections.certificates)
      .findOne({ user_id, device_id, server_id });
    if (!cert) return res.status(404).json({ code: "no_encontrado", message: "Certificado no encontrado" });

    const device = await db.collection(nameCollections.devices)
      .findOne({ user_id, id: device_id });
    if (!device) return res.status(404).json({ code: "no_encontrado", message: "Dispositivo no encontrado" });

    // Para S-UI: devolver sub_url en lugar de .ovpn
    if (device.protocol === "s-ui") {
      const rawServer = await db.collection(nameCollections.servers).findOne({ id: device.server_id });
      const sub_url   = rawServer
        ? `${(rawServer.sui_sub_url || "").replace(/\/+$/,"") }/${device.sui_sub_id}`
        : null;
      return res.status(200).json({
        code:     "s-ui",
        message:  "Dispositivo S-UI — usa el link de suscripción",
        data:     { sub_url, sui_email: device.sui_email },
      });
    }

    // Para OpenVPN: devolver archivo .ovpn
    let ovpnContent = device.certificate || "";

    if (!ovpnContent) {
      const servers = await db.collection(nameCollections.servers)
        .find({ id: server_id }).toArray();
      if (!servers.length) return res.status(404).json({ code: "servidor_no_encontrado" });
      const { runCommandAcross } = require("../services/sshPoolService");
      const [result] = await runCommandAcross(
        servers,
        () => ({ privateKey: process.env.SSH_KEY }),
        `docker exec ubuntu-openvpn bash /scripts/descargar_ovpn.sh "${cert.user}"`,
        { timeoutMs: 15000 }
      );
      if (result?.stderr) return res.status(500).json({ code: "error", message: result.stderr });
      ovpnContent = result?.stdout || "";
    }

    if (!ovpnContent.includes("client") || !ovpnContent.includes("<ca>")) {
      return res.status(400).json({ code: "contenido_invalido", message: "Archivo .ovpn inválido" });
    }

    const tempPath = path.join(__dirname, `${cert.user}.ovpn`);
    fs.writeFileSync(tempPath, ovpnContent, "utf8");
    res.download(tempPath, `${cert.user}.ovpn`, () => {
      try { fs.unlinkSync(tempPath); } catch {}
    });
  } catch (e) {
    console.error("downloadCertificateClient:", e);
    res.status(500).json({ code: "error", message: e.message });
  }
}

module.exports = { get, create, update, getDevicesClient, createDevicesClient, downloadCertificateClient };
