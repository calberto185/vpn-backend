/**
 * RouteModel — Entrada del catálogo dinámico de rutas del panel.
 *
 * key:      segmento de ruta sin /panel/  → "users", "settings/plans"
 * actions:  acciones disponibles para esta ruta → ['view','create','update','delete']
 * isSystem: si true, no puede eliminarse ni cambiar su key
 */
class RouteModel {
  id        = '';
  key       = '';
  label     = '';
  group     = '';
  actions   = [];
  isSystem  = false;
  order     = 0;
  createdAt = new Date();
  updatedAt = new Date();

  set({ id, key, label, group, actions, isSystem, order, createdAt, updatedAt }) {
    this.id        = id        ?? this.id;
    this.key       = key       ?? this.key;
    this.label     = label     ?? this.label;
    this.group     = group     ?? this.group;
    this.actions   = actions   ?? this.actions;
    this.isSystem  = isSystem  ?? this.isSystem;
    this.order     = order     ?? this.order;
    this.createdAt = createdAt ? new Date(createdAt) : this.createdAt;
    this.updatedAt = updatedAt ? new Date(updatedAt) : this.updatedAt;
  }
}

module.exports = RouteModel;
