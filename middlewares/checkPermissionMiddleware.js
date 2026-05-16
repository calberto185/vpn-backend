/**
 * checkPermissionMiddleware.js
 * Fine-grained per-route, per-action permission check based on role.routePermissions.
 *
 * Usage in a route file:
 *   const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
 *   router.get('/', verifyToken, checkPermission('users', 'view'), handler);
 *
 * Action mapping:
 *   GET  / list     → 'view'
 *   POST / create   → 'create'
 *   PUT  / update   → 'update'
 *   DELETE / remove → 'delete'
 */
const { getDB } = require('../services/dbServices');

// ── In-memory cache: roleName → { data, at } ─────────────────────────────────
const _cache   = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function _fetchPerms(roleName) {
  const hit = _cache.get(roleName);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const role = await getDB().collection('roles').findOne({ name: roleName });
  const data = {
    routePermissions: role?.routePermissions ?? null,
    allowedRoutes:    role?.allowedRoutes    ?? [],
  };
  _cache.set(roleName, { data, at: Date.now() });
  return data;
}

/** Bust the cache for a role after it is created, updated or deleted. */
function invalidateRoleCache(roleName) {
  if (roleName) _cache.delete(roleName);
}

/**
 * Express middleware factory.
 * @param {string} routeKey   — matches ADMIN_PANEL_ROUTES key (e.g. 'users', 'settings/servers')
 * @param {'view'|'create'|'update'|'delete'} action
 */
function checkPermission(routeKey, action) {
  return async (req, res, next) => {
    // Users with no role assigned are treated as 'client'
    const role = req.user?.role || 'client';

    // Must be an authenticated panel user (not client / standar / no-role)
    if (role === 'client' || role === 'standar') {
      return res.status(403).json({
        code: 'sin_permiso',
        status: 403,
        message: 'No tienes permisos para esta acción',
      });
    }

    // admin always has full access — skip DB lookup
    if (role === 'admin') return next();

    try {
      const { routePermissions, allowedRoutes } = await _fetchPerms(role);

      // Primary: role has fine-grained routePermissions — use them exclusively
      if (routePermissions && Object.keys(routePermissions).length > 0) {
        const p = routePermissions[routeKey];
        if (p && p[action] === true) return next();
        return res.status(403).json({
          code: 'sin_permiso',
          status: 403,
          message: 'No tienes permisos para esta acción',
        });
      }

      // Fallback: legacy roles that only have allowedRoutes (grant view access)
      if (action === 'view' && allowedRoutes.includes(routeKey)) return next();

      return res.status(403).json({
        code: 'sin_permiso',
        status: 403,
        message: 'No tienes permisos para esta acción',
      });
    } catch (err) {
      console.error('[checkPermission] error:', err);
      return res.status(500).json({ message: 'Error al verificar permisos' });
    }
  };
}

module.exports = { checkPermission, invalidateRoleCache };
