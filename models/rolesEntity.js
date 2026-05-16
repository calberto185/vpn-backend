class RoleEntity {
  id               = "";
  name             = "";        // "manager" | "support" | custom (slug)
  label            = "";        // display name
  description      = "";
  color            = "primary"; // DaisyUI badge color
  routePermissions = {};        // { "users": { view, create, update, delete }, ... }
  allowedRoutes    = [];        // derived: keys where view === true
  isSystem         = false;
  createdAt        = new Date();
  updatedAt        = new Date();

  constructor() {}

  set({ id, name, label, description, color, routePermissions, allowedRoutes, isSystem, createdAt, updatedAt }) {
    this.id               = id               ?? this.id;
    this.name             = name             ?? this.name;
    this.label            = label            ?? this.label;
    this.description      = description      ?? this.description;
    this.color            = color            ?? this.color;
    this.routePermissions = routePermissions ?? this.routePermissions;
    this.allowedRoutes    = allowedRoutes    ?? this.allowedRoutes;
    this.isSystem         = isSystem         ?? this.isSystem;
    this.createdAt        = createdAt        ?? this.createdAt;
    this.updatedAt        = updatedAt        ?? this.updatedAt;
  }

  get() {
    if (!this.name)  throw new Error('name es requerido.');
    if (!this.label) throw new Error('label es requerido.');
    return this;
  }
}

module.exports = RoleEntity;
