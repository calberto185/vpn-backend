/**
 * settingsService.js
 * Acceso a la colección "settings" en MongoDB.
 * Módulo base — sin dependencias de notifyService (evita circulares).
 */
const { getDB, nameCollections } = require('./dbServices');

const NOTIF_KEY = 'notifications';

/** Lee la configuración raw (con secretos sin enmascarar) */
async function getNotificationsConfigRaw() {
  try {
    const db = getDB();
    return await db.collection(nameCollections.settings).findOne({ key: NOTIF_KEY });
  } catch {
    return null;
  }
}

/** Persiste la configuración completa (ya mergeada) */
async function upsertNotificationsConfig(data) {
  const db = getDB();
  return db.collection(nameCollections.settings).replaceOne(
    { key: NOTIF_KEY },
    { key: NOTIF_KEY, ...data, updatedAt: new Date() },
    { upsert: true }
  );
}

module.exports = { getNotificationsConfigRaw, upsertNotificationsConfig };
