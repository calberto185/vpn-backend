/**
 * RoleModel — Define un rol de panel de administración.
 *
 * routePermissions: mapa de ruta → acciones permitidas.
 *   Cada clave es un segmento de ruta (sin /panel/) y su valor es un objeto
 *   con las acciones booleanas { view, create, update, delete }.
 *   Ejemplo:
 *     {
 *       "dashboard": { view: true,  create: false, update: false, delete: false },
 *       "users":     { view: true,  create: true,  update: true,  delete: false },
 *       "payments":  { view: true,  create: false, update: false, delete: false }
 *     }
 *
 * allowedRoutes: array derivado de routePermissions (rutas con view === true).
 *   Se mantiene por compatibilidad con RoutePermissionGuard.
 *   El backend lo recalcula automáticamente al guardar.
 *
 * isSystem: si true, el rol no puede eliminarse ni renombrarse.
 */
class RoleModel {
  id               = '';
  name             = '';          // identificador único: "admin", "manager", "support"
  label            = '';          // nombre legible: "Administrador", "Gerente"
  description      = '';
  color            = 'primary';   // badge color: primary | secondary | success | warning | error | info | ghost
  routePermissions = {};          // { [routeKey]: { view, create, update, delete } }
  allowedRoutes    = [];          // derivado: rutas con view === true
  isSystem         = false;
  createdAt        = new Date();
  updatedAt        = new Date();

  set({ id, name, label, description, color, routePermissions, allowedRoutes, isSystem, createdAt, updatedAt }) {
    this.id               = id               ?? this.id;
    this.name             = name             ?? this.name;
    this.label            = label            ?? this.label;
    this.description      = description      ?? this.description;
    this.color            = color            ?? this.color;
    this.routePermissions = routePermissions ?? this.routePermissions;
    this.allowedRoutes    = allowedRoutes    ?? this.allowedRoutes;
    this.isSystem         = isSystem         ?? this.isSystem;
    this.createdAt        = createdAt ? new Date(createdAt) : this.createdAt;
    this.updatedAt        = updatedAt ? new Date(updatedAt) : this.updatedAt;
  }
}

module.exports = RoleModel;
