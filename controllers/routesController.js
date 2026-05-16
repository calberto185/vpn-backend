const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const RouteEntity = require("../models/routesEntity");

// ── Seed data (mirrors the previous ADMIN_PANEL_ROUTES constant) ─────────────
const DEFAULT_ROUTES = [
  { key: 'dashboard',               label: 'Dashboard',           group: 'Principal',      actions: ['view'],                                   isSystem: true,  order: 1 },
  { key: 'users',                   label: 'Usuarios',            group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 1 },
  { key: 'devices',                 label: 'Dispositivos',        group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 2 },
  { key: 'certificates',            label: 'Certificados',        group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 3 },
  { key: 'payments',                label: 'Pagos',               group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 4 },
  { key: 'activity',                label: 'Actividad',           group: 'Gestión',        actions: ['view'],                                   isSystem: true,  order: 5 },
  { key: 'crm',                     label: 'CRM',                 group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 6 },
  { key: 'messages',                label: 'Mensajes',            group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 7 },
  { key: 'systems',                 label: 'Sistemas',            group: 'Gestión',        actions: ['view','create','update','delete'],         isSystem: true,  order: 8 },
  { key: 'roles',                   label: 'Roles',               group: 'Administración', actions: ['view','create','update','delete'],         isSystem: true,  order: 1 },
  { key: 'suppliers',               label: 'Proveedores',         group: 'Administración', actions: ['view','create','update','delete'],         isSystem: true,  order: 2 },
  { key: 'supplier-payments',       label: 'Pagos proveedores',   group: 'Administración', actions: ['view','create','update','delete'],         isSystem: true,  order: 3 },
  { key: 'withdrawals',             label: 'Retiros de dinero',   group: 'Administración', actions: ['view','create','update','delete'],         isSystem: true,  order: 4 },
  { key: 'finance',                 label: 'Finanzas',            group: 'Administración', actions: ['view'],                                   isSystem: true,  order: 5 },
  { key: 'settings/servers',        label: 'Servidores',          group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 1 },
  { key: 'settings/plans',          label: 'Planes',              group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 2 },
  { key: 'settings/countries',      label: 'Países',              group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 3 },
  { key: 'settings/bank-account',   label: 'Cuentas bancarias',   group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 4 },
  { key: 'settings/services',       label: 'Servicios',           group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 5 },
  { key: 'settings/terms',          label: 'Términos',            group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 6 },
  { key: 'settings/apps',           label: 'Apps',                group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 7 },
  { key: 'settings/public-content', label: 'Contenido público',   group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 8 },
  { key: 'settings/routes',         label: 'Rutas',               group: 'Configuración',  actions: ['view','create','update','delete'],         isSystem: true,  order: 9 },
  { key: 'tutorial',                label: 'Tutorial de Uso',     group: 'Contenido',      actions: ['view','create','update','delete'],         isSystem: true,  order: 1 },
];

async function _upsertSystemRoutes(db) {
  const col = db.collection(nameCollections.routes);
  let inserted = 0;
  for (const r of DEFAULT_ROUTES) {
    const exists = await col.findOne({ key: r.key });
    if (!exists) {
      await col.insertOne({ ...r, id: uuidv4(), createdAt: new Date(), updatedAt: new Date() });
      inserted++;
    }
  }
  if (inserted > 0) console.log(`✅ [Routes] ${inserted} ruta(s) de sistema añadida(s).`);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function getAll(req, res) {
  try {
    const db = getDB();
    await _upsertSystemRoutes(db);
    const data = await db.collection(nameCollections.routes)
      .find({}).sort({ group: 1, order: 1, key: 1 }).toArray();
    res.status(200).json({ code: 'ok', status: 200, data });
  } catch (err) {
    console.error('[Routes] getAll:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener rutas.' });
  }
}

async function create(req, res) {
  try {
    const db = getDB();
    const entity = new RouteEntity();
    entity.set(req.body);
    entity.id        = uuidv4();
    entity.isSystem  = false;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    const data = entity.get();

    const exists = await db.collection(nameCollections.routes).findOne({ key: data.key });
    if (exists) return res.status(409).json({ code: 'conflict', status: 409, message: `La clave '${data.key}' ya existe.` });

    await db.collection(nameCollections.routes).insertOne(data);
    res.status(201).json({ code: 'created', status: 201, message: '✅ Ruta creada.', data });
  } catch (err) {
    console.error('[Routes] create:', err);
    res.status(500).json({ code: 'error', status: 500, message: err.message ?? 'Error al crear ruta.' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();
    const existing = await db.collection(nameCollections.routes).findOne({ id });
    if (!existing) return res.status(404).json({ code: 'not_found', status: 404, message: 'Ruta no encontrada.' });

    const entity = new RouteEntity();
    entity.set({
      ...existing,
      ...req.body,
      id:        existing.id,
      key:       existing.isSystem ? existing.key : (req.body.key ?? existing.key),
      isSystem:  existing.isSystem,
      createdAt: existing.createdAt,
    });
    entity.updatedAt = new Date();
    const data = entity.get();

    await db.collection(nameCollections.routes).updateOne({ id }, { $set: data });
    res.status(200).json({ code: 'updated', status: 200, message: '✅ Ruta actualizada.', data });
  } catch (err) {
    console.error('[Routes] update:', err);
    res.status(500).json({ code: 'error', status: 500, message: err.message ?? 'Error al actualizar ruta.' });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();
    const existing = await db.collection(nameCollections.routes).findOne({ id });
    if (!existing)        return res.status(404).json({ code: 'not_found', status: 404, message: 'Ruta no encontrada.' });
    if (existing.isSystem) return res.status(403).json({ code: 'forbidden', status: 403, message: 'No se puede eliminar una ruta del sistema.' });

    await db.collection(nameCollections.routes).deleteOne({ id });
    res.status(200).json({ code: 'deleted', status: 200, message: '✅ Ruta eliminada.' });
  } catch (err) {
    console.error('[Routes] remove:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al eliminar ruta.' });
  }
}

module.exports = { getAll, create, update, remove };
