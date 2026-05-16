const CountryEntity = require("./countryEntity");

class TermsEntity {
  id = "";
  country = new CountryEntity();
  details = [];

  // ── i18n text fields ───────────────────────────────────────────────────────
  title            = "";          // legacy plain string
  title_i18n       = {};          // { es: "", en: "", ru: "" }
  description      = "";
  description_i18n = {};

  // ── operational fields ─────────────────────────────────────────────────────
  effectiveDate = null;   // ISO date string or null — when these terms take effect
  active    = true;
  createdAt = new Date();
  updatedAt = new Date();

  constructor() {}

  set({
    id, country, details,
    title,       title_i18n,
    description, description_i18n,
    effectiveDate,
    active, createdAt, updatedAt,
  }) {
    this.id               = id               ?? this.id;
    this.country          = country          ?? this.country;
    this.details          = details          ?? this.details;
    this.title            = title            ?? this.title;
    this.title_i18n       = title_i18n       ?? this.title_i18n;
    this.description      = description      ?? this.description;
    this.description_i18n = description_i18n ?? this.description_i18n;
    this.effectiveDate    = effectiveDate    !== undefined ? effectiveDate : this.effectiveDate;
    this.active           = active           ?? this.active;
    this.createdAt        = createdAt        ?? this.createdAt;
    this.updatedAt        = updatedAt        ?? this.updatedAt;
  }

  get() {
    if (!this.country) throw new Error('country es requerido.');
    const hasTitle = this.title || Object.values(this.title_i18n ?? {}).some(v => !!v);
    if (!hasTitle) throw new Error('title o title_i18n es requerido.');
    return this;
  }
}

module.exports = TermsEntity;
