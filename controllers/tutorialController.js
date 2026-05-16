const { getDB, nameCollections } = require('../services/dbServices');
const { v4: uuidv4 } = require('uuid');
const TutorialNodeEntity = require('../models/tutorialNodeEntity');

const COL = () => getDB().collection(nameCollections.tutorialNodes);

// ── GET all (admin) ───────────────────────────────────────────────────────────
async function getAll(req, res) {
  try {
    const nodes = await COL()
      .find({})
      .sort({ order: 1, createdAt: 1 })
      .toArray();
    res.status(200).json({ code: 'ok', status: 200, data: nodes });
  } catch (e) {
    console.error('[tutorial] getAll:', e.message);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener nodos' });
  }
}

// ── GET public (visible only) ─────────────────────────────────────────────────
async function getPublic(req, res) {
  try {
    const nodes = await COL()
      .find({ isVisible: true })
      .sort({ order: 1, createdAt: 1 })
      .toArray();
    res.status(200).json({ code: 'ok', status: 200, data: nodes });
  } catch (e) {
    console.error('[tutorial] getPublic:', e.message);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al obtener tutorial' });
  }
}

// ── CREATE ────────────────────────────────────────────────────────────────────
async function create(req, res) {
  try {
    const node = new TutorialNodeEntity();
    node.set(req.body);
    node.id        = uuidv4();
    node.createdAt = new Date();
    node.updatedAt = new Date();

    if (!node.title) {
      return res.status(400).json({ code: 'validation', status: 400, message: 'El título es requerido' });
    }

    // Default order to count of siblings + 1
    if (node.order === 0) {
      const siblingCount = await COL().countDocuments({ parentId: node.parentId ?? null });
      node.order = siblingCount + 1;
    }

    await COL().insertOne(node);
    res.status(200).json({ code: 'created', status: 200, message: 'Nodo creado', data: node });
  } catch (e) {
    console.error('[tutorial] create:', e.message);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al crear nodo' });
  }
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
async function update(req, res) {
  try {
    const { id, ...rest } = req.body;
    if (!id) return res.status(400).json({ code: 'validation', status: 400, message: 'id requerido' });

    const existing = await COL().findOne({ id });
    if (!existing) return res.status(404).json({ code: 'not_found', status: 404, message: 'Nodo no encontrado' });

    const node = new TutorialNodeEntity();
    node.set({ ...existing, ...rest, id });
    node.updatedAt = new Date();

    await COL().updateOne({ id }, { $set: node });
    res.status(200).json({ code: 'updated', status: 200, message: 'Nodo actualizado', data: node });
  } catch (e) {
    console.error('[tutorial] update:', e.message);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al actualizar nodo' });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
async function remove(req, res) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ code: 'validation', status: 400, message: 'id requerido' });

    // Recursively delete children
    await deleteSubtree(id);

    res.status(200).json({ code: 'deleted', status: 200, message: 'Nodo eliminado' });
  } catch (e) {
    console.error('[tutorial] delete:', e.message);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al eliminar nodo' });
  }
}

async function deleteSubtree(nodeId) {
  const children = await COL().find({ parentId: nodeId }).toArray();
  for (const child of children) {
    await deleteSubtree(child.id);
  }
  await COL().deleteOne({ id: nodeId });
}

// ── REORDER (bulk update order field) ─────────────────────────────────────────
async function reorder(req, res) {
  try {
    const { items } = req.body; // [{ id, order }]
    if (!Array.isArray(items)) {
      return res.status(400).json({ code: 'validation', status: 400, message: 'items debe ser un array' });
    }
    const ops = items.map(({ id, order }) => ({
      updateOne: { filter: { id }, update: { $set: { order, updatedAt: new Date() } } },
    }));
    await COL().bulkWrite(ops);
    res.status(200).json({ code: 'ok', status: 200, message: 'Orden actualizado' });
  } catch (e) {
    console.error('[tutorial] reorder:', e.message);
    res.status(500).json({ code: 'error', status: 500, message: 'Error al reordenar' });
  }
}

module.exports = { getAll, getPublic, create, update, remove, reorder };
