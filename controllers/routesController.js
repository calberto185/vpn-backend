/**
 * routesController.js — Catálogo dinámico de rutas del panel.
 * Monta en: /api/routes
 *
 * En la primera llamada a getAll(), si la colección está vacía,
 * se insertan las rutas por defecto (lazy seed).
 */
const { getDB, nameCollections } = require('../services/dbServices');
const RouteModel = require('../models/routeModel');
const { v4: uuidv4 } = require('uuid');

const col = () => getDB().collection(nameCollections.routes);

// ── Rutas por defecto (espejo del sistema de permisos) ────────────────────────
const DEFAULT_ROUTES = [
  { key: 'dashboard',               label: 'Dashboard',           group: 'Principal',      actions: ['view'],                           isSystem: true, order: 1 },
  { key: 'users',                   label: 'Usuarios',            group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 1 },
  { key: 'devices',                 label: 'Dispositivos',        group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 2 },
  { key: 'certificates',            label: 'Certificados',        group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 3 },
  { key: 'payments',                label: 'Pagos',               group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 4 },
  { key: 'activity',                label: 'Actividad',           group: 'Gestión',        actions: ['view'],                           isSystem: true, order: 5 },
  { key: 'crm',                     label: 'CRM',                 group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 6 },
  { key: 'messages',                label: 'Mensajes',            group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 7 },
  { key: 'systems',                 label: 'Sistemas',            group: 'Gestión',        actions: ['view','create','update','delete'], isSystem: true, order: 8 },
  { key: 'roles',                   label: 'Roles',               group: 'Administración', actions: ['view','create','update','delete'], isSystem: true, order: 1 },
  { key: 'suppliers',               label: 'Proveedores',         group: 'Administración', actions: ['view','create','update','delete'], isSystem: true, order: 2 },
  { key: 'supplier-payments',       label: 'Pagos proveedores',   group: 'Administración', actions: ['view','create','update','delete'], isSystem: true, order: 3 },
  { key: 'withdrawals',             label: 'Retiros de dinero',   group: 'Administración', actions: ['view','create','update','delete'], isSystem: true, order: 4 },
  { key: 'finance',                 label: 'Finanzas',            group: 'Administración', actions: ['view'],                           isSystem: true, order: 5 },
  { key: 'settings/servers',        label: 'Servidores',          group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 1 },
  { key: 'settings/plans',          label: 'Planes',              group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 2 },
  { key: 'settings/countries',      label: 'Países',              group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 3 },
  { key: 'settings/bank-account',   label: 'Cuentas bancarias',   group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 4 },
  { key: 'settings/services',       label: 'Servicios',           group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 5 },
  { key: 'settings/terms',          label: 'Términos',            group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 6 },
  { key: 'settings/apps',           label: 'Apps',                group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 7 },
  { key: 'settings/public-content', label: 'Contenido público',   group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 8 },
  { key: 'settings/routes',         label: 'Rutas del sistema',   group: 'Configuración',  actions: ['view','create','update','delete'], isSystem: true, order: 9 },
  { key: 'tutorial',                label: 'Tutorial de Uso',     group: 'Contenido',      actions: ['view','create','update','delete'], isSystem: true, order: 1 },
];

async function _seedIfEmpty() {
  const count = await col().countDocuments();
  if (count > 0) return;
  const now = new Date();
  const docs = DEFAULT_ROUTES.map(r => ({ ...r, id: uuidv4(), createdAt: now, updatedAt: now }));
  await col().insertMany(docs);
  console.log(`✅ [Routes] ${docs.length} rutas sembradas.`);
}

/* ─────────────────────────────────────────────────────── GET ALL */
async function list(req, res) {
  try {
    await _seedIfEmpty();
    const data = await col().find({}).sort({ group: 1, order: 1, key: 1 }).toArray();
    res.json({ status: 200, data });
  } catch (err) {
    console.error('[Routes] list:', err);
    res.status(500).json({ status: 500, message: 'Error al obtener rutas', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────── CREATE */
async function create(req, res) {
  try {
    const { key, label, group, actions = [], order = 0 } = req.body;
    if (!key || !label || !group) {
      return res.status(400).json({ status: 400, message: 'key, label y group son requeridos' });
    }

    const exists = await col().findOne({ key: key.trim().toLowerCase() });
    if (exists) {
      return res.status(409).json({ status: 409, message: `La clave '${key}' ya existe` });
    }

    const model = new RouteModel();
    model.set({ key: key.trim().toLowerCase(), label: label.trim(), group: group.trim(), actions, order: Number(order) || 0 });
    model.id        = uuidv4();
    model.isSystem  = false;
    model.createdAt = new Date();
    model.updatedAt = new Date();

    await col().insertOne(model);
    res.status(201).json({ status: 201, data: model });
  } catch (err) {
    console.error('[Routes] create:', err);
    res.status(500).json({ status: 500, message: 'Error al crear ruta', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────── UPDATE */
async function update(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Ruta no encontrada' });

    const { label, group, actions, order } = req.body;
    const patch = { updatedAt: new Date() };
    if (label   !== undefined) patch.label   = label.trim();
    if (group   !== undefined) patch.group   = group.trim();
    if (actions !== undefined) patch.actions = actions;
    if (order   !== undefined) patch.order   = Number(order) || 0;
    // key is immutable for system routes; custom routes can change key
    if (!existing.isSystem && req.body.key !== undefined) {
      patch.key = req.body.key.trim().toLowerCase();
    }

    await col().updateOne({ id: req.params.id }, { $set: patch });
    const updated = await col().findOne({ id: req.params.id });
    res.json({ status: 200, data: updated });
  } catch (err) {
    console.error('[Routes] update:', err);
    res.status(500).json({ status: 500, message: 'Error al actualizar ruta', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────── DELETE */
async function remove(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing)         return res.status(404).json({ status: 404, message: 'Ruta no encontrada' });
    if (existing.isSystem) return res.status(403).json({ status: 403, message: 'No se puede eliminar una ruta del sistema' });

    await col().deleteOne({ id: req.params.id });
    res.json({ status: 200, message: 'Ruta eliminada' });
  } catch (err) {
    console.error('[Routes] remove:', err);
    res.status(500).json({ status: 500, message: 'Error al eliminar ruta', error: err.message });
  }
}

module.exports = { list, create, update, remove };
