const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const RoleEntity = require("../models/rolesEntity");

/** Recalculate allowedRoutes from routePermissions */
function deriveAllowedRoutes(routePermissions = {}) {
  return Object.entries(routePermissions)
    .filter(([, p]) => p?.view)
    .map(([k]) => k);
}

async function getAll(req, res) {
  try {
    const db   = getDB();
    const data = await db.collection(nameCollections.roles).find({}).sort({ createdAt: 1 }).toArray();
    res.status(200).json({ code: 'ok', status: 200, data });
  } catch (err) {
    console.error('[Roles] getAll:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener roles.' });
  }
}

async function getByName(req, res) {
  try {
    const { name } = req.params;
    const db   = getDB();
    const data = await db.collection(nameCollections.roles).findOne({ name });
    if (!data) return res.status(404).json({ code: 'not_found', status: 404, message: 'Rol no encontrado.' });
    res.status(200).json({ code: 'ok', status: 200, data });
  } catch (err) {
    console.error('[Roles] getByName:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener rol.' });
  }
}

async function create(req, res) {
  try {
    const db = getDB();
    const entity = new RoleEntity();
    entity.set(req.body);
    entity.id        = uuidv4();
    entity.isSystem  = false;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    entity.allowedRoutes = deriveAllowedRoutes(entity.routePermissions);
    const data = entity.get();

    const exists = await db.collection(nameCollections.roles).findOne({ name: data.name });
    if (exists) return res.status(409).json({ code: 'conflict', status: 409, message: `El rol '${data.name}' ya existe.` });

    await db.collection(nameCollections.roles).insertOne(data);
    res.status(201).json({ code: 'created', status: 201, message: '✅ Rol creado.', data });
  } catch (err) {
    console.error('[Roles] create:', err);
    res.status(500).json({ code: 'error', status: 500, message: err.message ?? 'Error al crear rol.' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();
    const existing = await db.collection(nameCollections.roles).findOne({ id });
    if (!existing) return res.status(404).json({ code: 'not_found', status: 404, message: 'Rol no encontrado.' });

    const entity = new RoleEntity();
    entity.set({
      ...existing,
      ...req.body,
      id:        existing.id,
      name:      existing.name,   // name is immutable after creation
      isSystem:  existing.isSystem,
      createdAt: existing.createdAt,
    });
    entity.updatedAt     = new Date();
    entity.allowedRoutes = deriveAllowedRoutes(entity.routePermissions);
    const data = entity.get();

    await db.collection(nameCollections.roles).updateOne({ id }, { $set: data });
    res.status(200).json({ code: 'updated', status: 200, message: '✅ Rol actualizado.', data });
  } catch (err) {
    console.error('[Roles] update:', err);
    res.status(500).json({ code: 'error', status: 500, message: err.message ?? 'Error al actualizar rol.' });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    const db = getDB();
    const existing = await db.collection(nameCollections.roles).findOne({ id });
    if (!existing)         return res.status(404).json({ code: 'not_found', status: 404, message: 'Rol no encontrado.' });
    if (existing.isSystem) return res.status(403).json({ code: 'forbidden', status: 403, message: 'No se puede eliminar un rol del sistema.' });

    await db.collection(nameCollections.roles).deleteOne({ id });
    res.status(200).json({ code: 'deleted', status: 200, message: '✅ Rol eliminado.' });
  } catch (err) {
    console.error('[Roles] remove:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al eliminar rol.' });
  }
}

/**
 * POST /api/roles/sync-routes
 * Merges all catalog routes into every role:
 *  - Routes already in a role's routePermissions are preserved as-is.
 *  - Missing route keys are added with emptyPermission (all false).
 *  - allowedRoutes is recalculated after the merge.
 */
async function syncRoutes(req, res) {
  try {
    const db = getDB();

    // 1. Load all catalog routes
    const catalogRoutes = await db.collection(nameCollections.routes)
      .find({}).project({ key: 1, _id: 0 }).toArray();
    if (catalogRoutes.length === 0) {
      return res.status(400).json({ code: 'error', status: 400, message: 'El catálogo de rutas está vacío. Reinicia el servidor para sembrar las rutas.' });
    }

    // 2. Load all roles
    const allRoles = await db.collection(nameCollections.roles).find({}).toArray();

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
        const allowedRoutes = deriveAllowedRoutes(merged);
        await db.collection(nameCollections.roles).updateOne(
          { id: role.id },
          { $set: { routePermissions: merged, allowedRoutes, updatedAt: new Date() } }
        );
        updated++;
      }
    }

    res.status(200).json({
      code: 'ok', status: 200,
      message: `✅ Sincronización completada. ${updated} rol(es) actualizado(s).`,
      data: { totalRoles: allRoles.length, updatedRoles: updated, totalRoutes: catalogRoutes.length },
    });
  } catch (err) {
    console.error('[Roles] syncRoutes:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al sincronizar rutas.' });
  }
}

module.exports = { getAll, getByName, create, update, remove, syncRoutes };
