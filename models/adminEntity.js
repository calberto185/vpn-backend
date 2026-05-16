const CountryEntity    = require("./countryEntity");
const AdminTelephoneDto = require("./adminTelephoneDto");

/**
 * AdminEntity — Representa tanto admins como clientes del sistema.
 *
 * Campos CRM (nuevos):
 *   notes[]         → historial de notas internas del admin
 *   tags[]          → etiquetas para segmentar ("vip", "rusia", "latam", "moroso")
 *   pipeline_stage  → estado en el embudo de ventas
 *   source          → cómo llegó el cliente ("telegram", "web", "referido", "directo")
 */
class AdminEntity {
  id            = "";
  firstNames    = "";
  lastNames     = "";
  telephone     = [];   // [AdminTelephoneDto]
  picture       = "";
  role          = "client";   // "admin" | "client"
  isAdmin       = false;
  email         = "";
  password      = "";
  country       = new CountryEntity();
  dni           = "";
  state         = "Pendiente"; // "Pendiente" | "Activo" | "Suspendido" | "Bloqueado"
  verified      = false;
  verifiedAt    = new Date(1);
  bloqued       = false;
  bloquedAt     = new Date(1);
  suspend       = false;
  suspendAt     = new Date(1);
  onService     = false;
  onServiceAt   = new Date(1);
  services      = [];          // [ServiceClientDto] — servicios contratados
  observations  = "";

  // ── CRM ────────────────────────────────────────────────────────────────────
  notes         = [];   // [{ text, createdAt, createdBy }] — notas internas del admin
  tags          = [];   // ["vip", "rusia", "latam", "moroso", ...] — etiquetas
  pipeline_stage = "lead"; // "lead" | "contactado" | "activo" | "riesgo" | "inactivo"
  source        = "";   // "telegram" | "web" | "referido" | "directo" | ...

  createdAt     = new Date();
  updatedAt     = new Date();

  constructor() {}

  set({
    id, firstNames, lastNames, telephone, picture, role, isAdmin,
    email, password, country, dni, state, verified, verifiedAt,
    bloqued, bloquedAt, suspend, suspendAt, onService, onServiceAt,
    services, observations,
    notes, tags, pipeline_stage, source,
    createdAt, updatedAt,
  }) {
    this.id             = id             ?? this.id;
    this.firstNames     = firstNames     ?? this.firstNames;
    this.lastNames      = lastNames      ?? this.lastNames;
    this.telephone      = telephone      ?? this.telephone;
    this.picture        = picture        ?? this.picture;
    this.role           = role           ?? this.role;
    this.isAdmin        = isAdmin        ?? this.isAdmin;
    this.email          = email          ?? this.email;
    this.password       = password       ?? this.password;
    this.country        = country        ?? this.country;
    this.dni            = dni            ?? this.dni;
    this.state          = state          ?? this.state;
    this.verified       = verified       ?? this.verified;
    this.verifiedAt     = verifiedAt     ? new Date(verifiedAt)  : this.verifiedAt;
    this.bloqued        = bloqued        ?? this.bloqued;
    this.bloquedAt      = bloquedAt      ? new Date(bloquedAt)   : this.bloquedAt;
    this.suspend        = suspend        ?? this.suspend;
    this.suspendAt      = suspendAt      ? new Date(suspendAt)   : this.suspendAt;
    this.onService      = onService      ?? this.onService;
    this.onServiceAt    = onServiceAt    ? new Date(onServiceAt) : this.onServiceAt;
    this.services       = services       ?? this.services;
    this.observations   = observations   ?? this.observations;
    this.notes          = notes          ?? this.notes;
    this.tags           = tags           ?? this.tags;
    this.pipeline_stage = pipeline_stage ?? this.pipeline_stage;
    this.source         = source         ?? this.source;
    this.createdAt      = createdAt      ? new Date(createdAt)   : this.createdAt;
    this.updatedAt      = updatedAt      ? new Date(updatedAt)   : this.updatedAt;
  }

  get() {
    if (!this.firstNames) throw new Error("firstNames es requerido");
    if (!this.lastNames)  throw new Error("lastNames es requerido");
    if (!this.telephone && this.telephone !== undefined)
      throw new Error("telephone es requerido");
    if (!this.email)      throw new Error("email es requerido");
    if (!this.password)   throw new Error("password es requerido");
    if (!this.country)    throw new Error("country es requerido");
    return this;
  }
}

module.exports = AdminEntity;
