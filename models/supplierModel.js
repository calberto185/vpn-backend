/**
 * SupplierModel — Empresa/proveedor de servicios.
 * category: "infrastructure" | "hosting" | "bandwidth" | "software" | "marketing" | "telecom" | "other"
 */
class SupplierModel {
  id                 = '';
  name               = '';          // Nombre comercial
  legalName          = '';          // Razón social
  taxId              = '';          // RUC / NIT / VAT / INN
  email              = '';
  phone              = '';
  country            = {};          // { countryName, countryCode, flag }
  address            = '';
  category           = 'other';
  serviceId          = null;        // FK → services collection (nullable)
  serviceName        = '';          // Nombre del servicio (catálogo o libre)
  serviceDescription = '';          // Descripción libre del servicio
  contactName        = '';          // Nombre del contacto
  website            = '';
  notes              = '';
  active             = true;
  createdAt          = new Date();
  updatedAt          = new Date();

  set({ id, name, legalName, taxId, email, phone, country, address, category,
        serviceId, serviceName, serviceDescription, contactName, website,
        notes, active, createdAt, updatedAt }) {
    this.id                 = id                 ?? this.id;
    this.name               = name               ?? this.name;
    this.legalName          = legalName          ?? this.legalName;
    this.taxId              = taxId              ?? this.taxId;
    this.email              = email              ?? this.email;
    this.phone              = phone              ?? this.phone;
    this.country            = country            ?? this.country;
    this.address            = address            ?? this.address;
    this.category           = category           ?? this.category;
    this.serviceId          = serviceId          !== undefined ? serviceId : this.serviceId;
    this.serviceName        = serviceName        ?? this.serviceName;
    this.serviceDescription = serviceDescription ?? this.serviceDescription;
    this.contactName        = contactName        ?? this.contactName;
    this.website            = website            ?? this.website;
    this.notes              = notes              ?? this.notes;
    this.active             = active             ?? this.active;
    this.createdAt          = createdAt ? new Date(createdAt) : this.createdAt;
    this.updatedAt          = updatedAt ? new Date(updatedAt) : this.updatedAt;
  }
}

module.exports = SupplierModel;
