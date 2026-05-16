const VALID_ACTIONS = ['view', 'create', 'update', 'delete'];

class RouteEntity {
  id        = "";
  key       = "";     // "settings/plans", "users", etc.
  label     = "";     // display name
  group     = "";     // "Configuración", "Gestión", etc.
  actions   = ['view', 'create', 'update', 'delete'];
  isSystem  = false;
  order     = 0;
  createdAt = new Date();
  updatedAt = new Date();

  constructor() {}

  set({ id, key, label, group, actions, isSystem, order, createdAt, updatedAt }) {
    this.id        = id        ?? this.id;
    this.key       = key       ?? this.key;
    this.label     = label     ?? this.label;
    this.group     = group     ?? this.group;
    this.actions   = Array.isArray(actions) ? actions : this.actions;
    this.isSystem  = isSystem  ?? this.isSystem;
    this.order     = order     ?? this.order;
    this.createdAt = createdAt ?? this.createdAt;
    this.updatedAt = updatedAt ?? this.updatedAt;
  }

  get() {
    if (!this.key)   throw new Error('key es requerido.');
    if (!this.label) throw new Error('label es requerido.');
    if (!this.group) throw new Error('group es requerido.');
    const invalid = this.actions.filter(a => !VALID_ACTIONS.includes(a));
    if (invalid.length) throw new Error(`Acciones inválidas: ${invalid.join(', ')}`);
    return this;
  }
}

module.exports = RouteEntity;
