/**
 * DeviceEntity — Dispositivo/acceso de un cliente a un servicio
 *
 * Vincula: admin.id (user_id) + service_id + server_id
 *
 * Las credenciales técnicas van aquí según el protocolo:
 *   OpenVPN → certificate (texto .ovpn)
 *   S-UI    → sui_uuid, sui_email, sui_sub_id, sui_config
 *
 * Un cliente puede tener múltiples DeviceEntity:
 *   - uno por dispositivo (OpenVPN, ya que cada dispositivo tiene su .ovpn)
 *   - uno por suscripción S-UI (el sub_id cubre todos los dispositivos del plan)
 */
class DeviceEntity {
  id          = "";
  user_id     = "";           // admin.id del cliente
  plan_id     = "";
  service_id  = "";
  server_id   = "";
  protocol    = "s-ui";      // "s-ui" | "openvpn"

  // ── Identidad del dispositivo (OpenVPN / genérico) ─
  device      = "";           // nombre: "Mi laptop", "iPhone", etc.
  typeDevice  = "";           // "android" | "iphone" | "windows" | "macos" | "linux" | "router"
  active      = false;

  // ── Credenciales OpenVPN ───────────────────────────
  certificate = "";           // contenido del archivo .ovpn

  // ── Credenciales S-UI ─────────────────────────────
  sui_uuid    = "";           // ID numérico del cliente en S-UI
  sui_email   = "";           // nombre del cliente en S-UI (SVION-01th-Nombre-ID)
  sui_sub_id  = "";           // subId para el link /sub/<sui_sub_id>
  sui_config  = null;         // payload completo del cliente (para edits futuros)

  // ── Estado y control ──────────────────────────────
  revoked     = false;
  revokedAt   = new Date(1);
  suspend     = false;
  suspendAt   = new Date(1);

  createdAt   = new Date();
  updatedAt   = new Date();

  constructor() {}

  set({
    id, user_id, plan_id, service_id, server_id, protocol,
    device, typeDevice, active, certificate,
    sui_uuid, sui_email, sui_sub_id, sui_config,
    revoked, revokedAt, suspend, suspendAt,
    createdAt, updatedAt,
  }) {
    this.id          = id          ?? this.id;
    this.user_id     = user_id     ?? this.user_id;
    this.plan_id     = plan_id     ?? this.plan_id;
    this.service_id  = service_id  ?? this.service_id;
    this.server_id   = server_id   ?? this.server_id;
    this.protocol    = protocol    ?? this.protocol;
    this.device      = device      ?? this.device;
    this.typeDevice  = typeDevice  ?? this.typeDevice;
    this.active      = active      ?? this.active;
    this.certificate = certificate ?? this.certificate;
    this.sui_uuid    = sui_uuid    ?? this.sui_uuid;
    this.sui_email   = sui_email   ?? this.sui_email;
    this.sui_sub_id  = sui_sub_id  ?? this.sui_sub_id;
    this.sui_config  = sui_config  ?? this.sui_config;
    this.revoked     = revoked     ?? this.revoked;
    this.revokedAt   = revokedAt   ?? this.revokedAt;
    this.suspend     = suspend     ?? this.suspend;
    this.suspendAt   = suspendAt   ?? this.suspendAt;
    this.createdAt   = createdAt   ?? this.createdAt;
    this.updatedAt   = updatedAt   ?? this.updatedAt;
  }

  get() {
    if (!this.user_id)    throw new Error("user_id es requerido");
    if (!this.plan_id)    throw new Error("plan_id es requerido");
    if (!this.service_id) throw new Error("service_id es requerido");
    if (!this.server_id)  throw new Error("server_id es requerido");
    if (!this.protocol)   throw new Error("protocol es requerido");

    if (this.protocol === "openvpn") {
      if (!this.device)     throw new Error("device es requerido para OpenVPN");
      if (!this.typeDevice) throw new Error("typeDevice es requerido para OpenVPN");
    }
    if (this.protocol === "s-ui") {
      if (!this.sui_email) throw new Error("sui_email es requerido para S-UI");
    }
    return this;
  }
}

module.exports = DeviceEntity;
