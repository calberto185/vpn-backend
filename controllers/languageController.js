const { getDB, nameCollections } = require('../services/dbServices');
const { v4: uuidv4 } = require('uuid');
const LanguageEntity = require('../models/languageEntity');

const COL = () => getDB().collection(nameCollections.languages);

// ── Seed defaults (called once from app startup) ──────────────────────────────
const DEFAULT_LANGUAGES = [
  { code: 'es', name: 'Spanish',  nativeName: 'Español',  flag: '🇪🇸', isDefault: true,  order: 1 },
  { code: 'en', name: 'English',  nativeName: 'English',  flag: '🇺🇸', isDefault: false, order: 2 },
  { code: 'ru', name: 'Russian',  nativeName: 'Русский',  flag: '🇷🇺', isDefault: false, order: 3 },
];

async function seedDefaultLanguages() {
  try {
    const col = COL();
    for (const def of DEFAULT_LANGUAGES) {
      const exists = await col.findOne({ code: def.code });
      if (!exists) {
        const entity = new LanguageEntity();
        entity.set({ ...def, id: uuidv4(), isActive: true });
        await col.insertOne(entity.get());
        console.log(`[languages] seeded: ${def.code}`);
      }
    }
  } catch (err) {
    console.error('[languages] seed error:', err);
  }
}

// ── GET /languages  (public — active only) ────────────────────────────────────
async function getLanguages(req, res) {
  try {
    const all = req.query.all === 'true';   // ?all=true → admin gets inactive too
    const filter = all ? {} : { isActive: true };
    const list = await COL().find(filter).sort({ order: 1 }).toArray();
    res.status(200).json({ code: 'ok', status: 200, data: list });
  } catch (err) {
    console.error('getLanguages error:', err);
    res.status(500).json({ status: 500, message: 'Error al obtener idiomas' });
  }
}

// ── POST /languages  (admin) ──────────────────────────────────────────────────
async function createLanguage(req, res) {
  try {
    const col = COL();
    const { code } = req.body;
    if (!code) return res.status(400).json({ status: 400, message: 'El código de idioma es obligatorio' });

    const exists = await col.findOne({ code });
    if (exists) return res.status(400).json({ status: 400, message: `El idioma '${code}' ya existe` });

    const entity = new LanguageEntity();
    entity.set({ ...req.body, id: uuidv4(), isActive: true, createdAt: new Date(), updatedAt: new Date() });
    await col.insertOne(entity.get());
    res.status(200).json({ status: 200, message: '✅ Idioma creado exitosamente' });
  } catch (err) {
    console.error('createLanguage error:', err);
    res.status(500).json({ status: 500, message: 'Error al crear idioma' });
  }
}

// ── PUT /languages  (admin) ───────────────────────────────────────────────────
async function updateLanguage(req, res) {
  try {
    const col = COL();
    const { id, ...fields } = req.body;
    if (!id) return res.status(400).json({ status: 400, message: 'ID requerido' });

    const existing = await col.findOne({ id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Idioma no encontrado' });

    // If setting this one as default, unset others
    if (fields.isDefault === true) {
      await col.updateMany({ id: { $ne: id } }, { $set: { isDefault: false } });
    }

    await col.updateOne({ id }, { $set: { ...fields, updatedAt: new Date() } });
    res.status(200).json({ status: 200, message: '✅ Idioma actualizado' });
  } catch (err) {
    console.error('updateLanguage error:', err);
    res.status(500).json({ status: 500, message: 'Error al actualizar idioma' });
  }
}

// ── DELETE /languages/:id  (admin) ────────────────────────────────────────────
async function deleteLanguage(req, res) {
  try {
    const col = COL();
    const { id } = req.params;
    const existing = await col.findOne({ id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Idioma no encontrado' });
    if (existing.isDefault) return res.status(400).json({ status: 400, message: 'No se puede eliminar el idioma por defecto' });

    await col.deleteOne({ id });
    res.status(200).json({ status: 200, message: '✅ Idioma eliminado' });
  } catch (err) {
    console.error('deleteLanguage error:', err);
    res.status(500).json({ status: 500, message: 'Error al eliminar idioma' });
  }
}

module.exports = { getLanguages, createLanguage, updateLanguage, deleteLanguage, seedDefaultLanguages };
