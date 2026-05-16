/**
 * rolesController.js — CRUD de roles de panel con permisos por acción
 *
 * routePermissions: { [routeKey]: { view, create, update, delete } }
 * allowedRoutes:    derivado automáticamente — rutas con view === true
 */
const { getDB, nameCollections } = require('../services/dbServices');
const RoleModel = require('../models/roleModel');
const { v4: uuidv4 } = require('uuid');
const { invalidateRoleCache } = require('../middlewares/checkPermissionMiddleware');

const col = () => getDB().collection(nameCollections.roles);

/** Calcula allowedRoutes a partir de routePermissions */
function computeAllowedRoutes(routePermissions = {}) {
  return Object.entries(routePermissions)
    .filter(([, perms]) => perms && perms.view === true)
    .map(([route]) => route);
}

/** Sanitiza routePermissions: asegura que todos los valores sean booleanos */
function sanitizePermissions(raw = {}) {
  const result = {};
  for (const [route, perms] of Object.entries(raw)) {
    if (typeof route !== 'string' || !route.trim()) continue;
    result[route] = {
      view:   Boolean(perms?.view),
      create: Boolean(perms?.create),
      update: Boolean(perms?.update),
      delete: Boolean(perms?.delete),
    };
  }
  return result;
}

/* ─────────────────────────────────────────────────────────── GET ALL */
/** GET /api/roles — lista todos los roles (solo admin) */
async function list(req, res) {
  try {
    const roles = await col().find({}).sort({ isSystem: -1, name: 1 }).toArray();
    res.json({ status: 200, data: roles });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener roles', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────── GET BY NAME */
/** GET /api/roles/:name — obtiene un rol por name (cualquier usuario autenticado) */
async function getByName(req, res) {
  try {
    const role = await col().findOne({ name: req.params.name.toLowerCase() });
    if (!role) return res.status(404).json({ status: 404, message: 'Rol no encontrado' });
    res.json({ status: 200, data: role });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener rol', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────── CREATE */
/** POST /api/roles — crear nuevo rol (solo admin) */
async function create(req, res) {
  try {
    const {
      name, label,
      description    = '',
      color          = 'primary',
      routePermissions = {},
    } = req.body;

    if (!name || !label) {
      return res.status(400).json({ status: 400, message: 'name y label son requeridos' });
    }

    const safeName = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!safeName) return res.status(400).json({ status: 400, message: 'Nombre de rol inválido' });

    const exists = await col().findOne({ name: safeName });
    if (exists) {
      return res.status(409).json({ status: 409, message: `Ya existe un rol con el nombre "${safeName}"` });
    }

    const cleanPerms = sanitizePermissions(routePermissions);

    const role = new RoleModel();
    role.id               = uuidv4();
    role.name             = safeName;
    role.label            = label.trim();
    role.description      = description.trim();
    role.color            = color;
    role.routePermissions = cleanPerms;
    role.allowedRoutes    = computeAllowedRoutes(cleanPerms);
    role.isSystem         = false;
    role.createdAt        = new Date();
    role.updatedAt        = new Date();

    await col().insertOne(role);
    invalidateRoleCache(safeName);
    res.status(201).json({ status: 201, data: role });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al crear rol', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────── UPDATE */
/** PUT /api/roles/:id — actualizar rol (solo admin) */
async function update(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Rol no encontrado' });

    const { label, description, color, routePermissions } = req.body;

    const patch = { updatedAt: new Date() };
    if (label            !== undefined) patch.label       = label.trim();
    if (description      !== undefined) patch.description = description.trim();
    if (color            !== undefined) patch.color       = color;

    if (routePermissions !== undefined) {
      const cleanPerms = sanitizePermissions(routePermissions);
      patch.routePermissions = cleanPerms;
      patch.allowedRoutes    = computeAllowedRoutes(cleanPerms);
    }

    // name e isSystem son inmutables
    await col().updateOne({ id: req.params.id }, { $set: patch });
    const updated = await col().findOne({ id: req.params.id });
    invalidateRoleCache(existing.name);
    res.json({ status: 200, data: updated });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al actualizar rol', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────── DELETE */
/** DELETE /api/roles/:id — eliminar rol (solo admin, no system roles) */
async function remove(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Rol no encontrado' });
    if (existing.isSystem) {
      return res.status(403).json({ status: 403, message: 'No se puede eliminar un rol del sistema' });
    }
    await col().deleteOne({ id: req.params.id });
    invalidateRoleCache(existing.name);
    res.json({ status: 200, message: 'Rol eliminado' });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al eliminar rol', error: err.message });
  }
}

/* ─────────────────────────────────────────────────────── SYNC ROUTES */
/**
 * POST /api/roles/sync-routes
 * Adds to every role's routePermissions any catalog route key that is missing.
 * Existing permissions are preserved. New keys get all-false permissions.
 * allowedRoutes is recalculated after the merge.
 */
async function syncRoutes(req, res) {
  try {
    const db = getDB();

    const catalogRoutes = await db.collection(nameCollections.routes)
      .find({}).project({ key: 1, _id: 0 }).toArray();

    if (catalogRoutes.length === 0) {
      return res.status(400).json({ status: 400, message: 'El catálogo de rutas está vacío. Reinicia el servidor para sembrarlo.' });
    }

    const allRoles = await col().find({}).toArray();
    let updated = 0;

    for (const role of allRoles) {
      const existing = role.routePermissions ?? {};
      const merged   = { ...existing };
      let changed = false;

      for (const { key } of catalogRoutes) {
        if (!(key in merged)) {
          merged[key] = { view: false, create: false, update: false, delete: false };
          changed = true;
        }
      }

      if (changed) {
        const allowedRoutes = computeAllowedRoutes(merged);
        await col().updateOne(
          { id: role.id },
          { $set: { routePermissions: merged, allowedRoutes, updatedAt: new Date() } }
        );
        invalidateRoleCache(role.name);
        updated++;
      }
    }

    res.json({
      status: 200,
      message: `✅ Sincronización completada. ${updated} rol(es) actualizado(s).`,
      data: { totalRoles: allRoles.length, updatedRoles: updated, totalRoutes: catalogRoutes.length },
    });
  } catch (err) {
    console.error('[Roles] syncRoutes:', err);
    res.status(500).json({ status: 500, message: 'Error al sincronizar rutas', error: err.message });
  }
}

module.exports = { list, getByName, create, update, remove, syncRoutes };
