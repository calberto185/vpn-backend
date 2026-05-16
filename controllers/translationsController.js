const { getDB, nameCollections } = require('../services/dbServices');

// ── GET /api/translations  (public) ──────────────────────────────────────────
// Returns a flat map per language: { es: { key: value }, en: { key: value }, ... }
// Used by LocaleService on every page load (cached by frontend)
async function getAll(req, res) {
  try {
    const db = getDB();
    const docs = await db.collection(nameCollections.translations)
      .find({}, { projection: { _id: 0, key: 1, values: 1 } })
      .toArray();

    // Build { lang: { key: value } } map
    const map = {};
    for (const doc of docs) {
      const { key, values = {} } = doc;
      for (const [lang, text] of Object.entries(values)) {
        if (!map[lang]) map[lang] = {};
        map[lang][key] = text;
      }
    }

    res.status(200).json({ code: 'translations', status: 200, data: map });
  } catch (err) {
    console.error('translationsController.getAll:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener traducciones' });
  }
}

// ── GET /api/translations/all  (admin) ───────────────────────────────────────
// Returns [{ key, values: { es, en, ru, ... } }] sorted by key — for the editor UI
async function getAllAdmin(req, res) {
  try {
    const db = getDB();
    const docs = await db.collection(nameCollections.translations)
      .find({}, { projection: { _id: 0, key: 1, values: 1, updatedAt: 1 } })
      .sort({ key: 1 })
      .toArray();

    res.status(200).json({ code: 'translations', status: 200, data: docs });
  } catch (err) {
    console.error('translationsController.getAllAdmin:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener traducciones' });
  }
}

// ── PUT /api/translations  (admin) ───────────────────────────────────────────
// Upsert one key: { key: string, values: { es: string, en: string, ... } }
async function upsertOne(req, res) {
  try {
    const { key, values } = req.body;
    if (!key || typeof key !== 'string' || !values || typeof values !== 'object') {
      return res.status(400).json({ code: 'error', status: 400, message: 'key y values son requeridos' });
    }

    const db = getDB();
    await db.collection(nameCollections.translations).updateOne(
      { key },
      { $set: { key, values, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    res.status(200).json({ code: 'updated', status: 200, message: '✅ Traducción guardada', data: { key, values } });
  } catch (err) {
    console.error('translationsController.upsertOne:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al guardar traducción' });
  }
}

// ── PUT /api/translations/bulk  (admin) ──────────────────────────────────────
// Upsert many: { items: [{ key, values }] }
// Used by "Import defaults" in admin UI
async function upsertBulk(req, res) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 'error', status: 400, message: 'items debe ser un array no vacío' });
    }

    const db = getDB();
    const now = new Date();
    const ops = items
      .filter(i => i?.key && i?.values)
      .map(({ key, values }) => ({
        updateOne: {
          filter: { key },
          update: { $set: { key, values, updatedAt: now }, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      }));

    if (ops.length === 0) {
      return res.status(400).json({ code: 'error', status: 400, message: 'No hay items válidos' });
    }

    const result = await db.collection(nameCollections.translations).bulkWrite(ops, { ordered: false });

    res.status(200).json({
      code: 'bulk_updated',
      status: 200,
      message: `✅ ${result.upsertedCount + result.modifiedCount} traducciones procesadas`,
      data: { upserted: result.upsertedCount, modified: result.modifiedCount },
    });
  } catch (err) {
    console.error('translationsController.upsertBulk:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error en importación masiva' });
  }
}

// ── DELETE /api/translations/:key  (admin) ───────────────────────────────────
async function remove(req, res) {
  try {
    const key = decodeURIComponent(req.params.key);
    if (!key) {
      return res.status(400).json({ code: 'error', status: 400, message: 'key es requerido' });
    }

    const db = getDB();
    const result = await db.collection(nameCollections.translations).deleteOne({ key });

    if (result.deletedCount === 0) {
      return res.status(404).json({ code: 'not_found', status: 404, message: 'Clave no encontrada' });
    }

    res.status(200).json({ code: 'deleted', status: 200, message: '✅ Clave eliminada' });
  } catch (err) {
    console.error('translationsController.remove:', err);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al eliminar clave' });
  }
}

module.exports = { getAll, getAllAdmin, upsertOne, upsertBulk, remove };
