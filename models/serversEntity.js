const CountryEntity = require("./countryEntity");

/**
 * vpnServerEntity — Servidor VPN (multi-protocolo)
 *
 * Soporta dos tipos de servidor:
 *   "openvpn" → acceso vía SSH + scripts bash en Docker
 *   "s-ui"    → acceso vía HTTP API (S-UI / sing-box panel)
 *
 * Los campos SSH (userName, privateKeyPath) aplican a OpenVPN.
 * Los campos sui_* aplican a S-UI.
 * Un servidor puede tener ambos si corre los dos paneles.
 */
class vpnServerEntity {
  id            = "";
  name          = "";
  host          = "";
  port          = 22;          // puerto SSH (OpenVPN)
  country       = new CountryEntity();
  protocol      = "s-ui";      // "s-ui" | "openvpn" | "both"
  active        = false;
  visible       = false;

  // ── OpenVPN / SSH ─────────────────────────────────
  userName         = "root";
  password         = "";
  privateKeyPath   = "";

  // ── S-UI (sing-box panel) ─────────────────────────
  // URL completa del panel, ej: https://carlosvm.ru:41111/app/
  sui_url          = "";
  sui_username     = "";
  sui_password     = "";       // se almacena encriptado con AES-256-GCM
  sui_token        = "";       // token estático de la API /apiv2
  sui_sub_url      = "";       // URL base de suscripciones: https://host:2096/sub
  sui_inbound_id   = 1;        // inbound por defecto para nuevos clientes

  // ── Metadata ──────────────────────────────────────
  service_ids   = [];          // servicios que usan este servidor
  tags          = [];          // ["russia", "latam", "fast"] — para filtros
  note          = "";
  createdAt     = new Date();
  updatedAt     = new Date();

  constructor() {}

  set({
    id, name, host, port, country, protocol, active, visible,
    userName, password, privateKeyPath,
    sui_url, sui_username, sui_password, sui_token,
    sui_sub_url, sui_inbound_id,
    service_ids, tags, note,
    createdAt, updatedAt,
  }) {
    this.id             = id             ?? this.id;
    this.name           = name           ?? this.name;
    this.host           = host           ?? this.host;
    this.port           = port           ?? this.port;
    this.country        = country        ?? this.country;
    this.protocol       = protocol       ?? this.protocol;
    this.active         = active         ?? this.active;
    this.visible        = visible        ?? this.visible;
    this.userName       = userName       ?? this.userName;
    this.password       = password       ?? this.password;
    this.privateKeyPath = privateKeyPath ?? this.privateKeyPath;
    this.sui_url        = sui_url        ?? this.sui_url;
    this.sui_username   = sui_username   ?? this.sui_username;
    this.sui_password   = sui_password   ?? this.sui_password;
    this.sui_token      = sui_token      ?? this.sui_token;
    this.sui_sub_url    = sui_sub_url    ?? this.sui_sub_url;
    this.sui_inbound_id = sui_inbound_id ?? this.sui_inbound_id;
    this.service_ids    = service_ids    ?? this.service_ids;
    this.tags           = tags           ?? this.tags;
    this.note           = note           ?? this.note;
    this.createdAt      = createdAt      ?? this.createdAt;
    this.updatedAt      = updatedAt      ?? this.updatedAt;
  }

  get() {
    if (!this.name)     throw new Error("name es requerido");
    if (!this.host)     throw new Error("host es requerido");
    if (!this.protocol) throw new Error("protocol es requerido");
    if (!["s-ui", "openvpn", "both"].includes(this.protocol))
      throw new Error("protocol debe ser: s-ui | openvpn | both");

    if (["openvpn", "both"].includes(this.protocol)) {
      if (!this.privateKeyPath) throw new Error("privateKeyPath es requerido para OpenVPN");
    }
    if (["s-ui", "both"].includes(this.protocol)) {
      if (!this.sui_url)      throw new Error("sui_url es requerido para S-UI");
      if (!this.sui_username) throw new Error("sui_username es requerido para S-UI");
      if (!this.sui_password) throw new Error("sui_password es requerido para S-UI");
    }
    return this;
  }
}

module.exports = vpnServerEntity;
