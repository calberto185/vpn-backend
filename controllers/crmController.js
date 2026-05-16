/**
 * crmController.js — CRM básico propio
 *
 * Endpoints montados en /api/admin/crm
 * Todos requieren role="admin"
 *
 * POST   /:id/notes          → agregar nota interna
 * DELETE /:id/notes/:noteId  → eliminar nota
 * PUT    /:id/tags            → reemplazar tags
 * POST   /:id/tags            → agregar tag
 * DELETE /:id/tags/:tag       → quitar tag
 * PUT    /:id/pipeline        → cambiar stage del pipeline
 * GET    /pipeline/board      → vista kanban — clientes agrupados por stage
 * GET    /tags/list           → todos los tags usados en el sistema
 */

const { v4: uuidv4 }          = require("uuid");
const { getDB, nameCollections } = require("../services/dbServices");

const PIPELINE_STAGES = ["lead", "contactado", "activo", "riesgo", "inactivo"];

// ─── Notas ────────────────────────────────────────────────────────────────────

async function addNote(req, res) {
  try {
    const { id }  = req.params;
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ code: "faltan_datos", message: "text es requerido" });
    }
    const nota = {
      id:         uuidv4(),
      text:       text.trim(),
      createdAt:  new Date(),
      createdBy:  req.user?.id || "admin",
      createdByName: req.user?.firstNames || "Admin",
    };
    const db = getDB();
    const result = await db.collection(nameCollections.admin).updateOne(
      { id, isAdmin: false },
      { $push: { notes: nota }, $set: { updatedAt: new Date() } }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ code: "no_encontrado" });
    }
    return res.status(201).json({ code: "nota_agregada", data: nota });
  } catch (e) {
    console.error("crm.addNote:", e);
    return res.status(500).json({ code: "error", message: e.message });
  }
}

async function deleteNote(req, res) {
  try {
    const { id, noteId } = req.params;
    const db = getDB();
    await db.collection(nameCollections.admin).updateOne(
      { id, isAdmin: false },
      { $pull: { notes: { id: noteId } }, $set: { updatedAt: new Date() } }
    );
    return res.status(200).json({ code: "nota_eliminada" });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

async function addTag(req, res) {
  try {
    const { id }  = req.params;
    const { tag } = req.body;
    if (!tag?.trim()) {
      return res.status(400).json({ code: "faltan_datos", message: "tag es requerido" });
    }
    const db = getDB();
    const result = await db.collection(nameCollections.admin).updateOne(
      { id, isAdmin: false },
      { $addToSet: { tags: tag.toLowerCase().trim() }, $set: { updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ code: "no_encontrado" });
    return res.status(200).json({ code: "tag_agregado" });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

async function removeTag(req, res) {
  try {
    const { id, tag } = req.params;
    const db = getDB();
    await db.collection(nameCollections.admin).updateOne(
      { id, isAdmin: false },
      { $pull: { tags: tag }, $set: { updatedAt: new Date() } }
    );
    return res.status(200).json({ code: "tag_eliminado" });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

async function setTags(req, res) {
  try {
    const { id }   = req.params;
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({ code: "faltan_datos", message: "tags debe ser un array" });
    }
    const clean = tags.map(t => t.toLowerCase().trim()).filter(Boolean);
    const db = getDB();
    await db.collection(nameCollections.admin).updateOne(
      { id, isAdmin: false },
      { $set: { tags: clean, updatedAt: new Date() } }
    );
    return res.status(200).json({ code: "tags_actualizados", data: clean });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function setPipelineStage(req, res) {
  try {
    const { id }    = req.params;
    const { stage } = req.body;
    if (!PIPELINE_STAGES.includes(stage)) {
      return res.status(400).json({
        code: "stage_invalido",
        message: `stage debe ser uno de: ${PIPELINE_STAGES.join(", ")}`,
      });
    }
    const db = getDB();
    const result = await db.collection(nameCollections.admin).updateOne(
      { id, isAdmin: false },
      { $set: { pipeline_stage: stage, updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ code: "no_encontrado" });
    return res.status(200).json({ code: "pipeline_actualizado", data: { stage } });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Board / Kanban ───────────────────────────────────────────────────────────

async function getPipelineBoard(req, res) {
  try {
    const db      = getDB();
    const clientes = await db.collection(nameCollections.admin)
      .find({ isAdmin: false })
      .project({ password: 0, notes: 0 })
      .sort({ updatedAt: -1 })
      .toArray();

    // Agrupar por stage
    const board = {};
    for (const stage of PIPELINE_STAGES) {
      board[stage] = [];
    }
    for (const c of clientes) {
      const stage = c.pipeline_stage || "lead";
      if (!board[stage]) board[stage] = [];
      board[stage].push(c);
    }

    return res.status(200).json({
      code: "consultado",
      data: { board, stages: PIPELINE_STAGES, total: clientes.length },
    });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Tags disponibles ─────────────────────────────────────────────────────────

async function getTagsList(req, res) {
  try {
    const db = getDB();
    const result = await db.collection(nameCollections.admin).aggregate([
      { $match: { isAdmin: false, tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();
    return res.status(200).json({
      code: "consultado",
      data: result.map(r => ({ tag: r._id, count: r.count })),
    });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

// ─── Búsqueda por tag ─────────────────────────────────────────────────────────

async function getClientsByTag(req, res) {
  try {
    const { tag } = req.params;
    const db      = getDB();
    const clientes = await db.collection(nameCollections.admin)
      .find({ isAdmin: false, tags: tag.toLowerCase() })
      .project({ password: 0 })
      .sort({ createdAt: -1 })
      .toArray();
    return res.status(200).json({ code: "consultado", data: clientes });
  } catch (e) {
    return res.status(500).json({ code: "error", message: e.message });
  }
}

module.exports = {
  addNote, deleteNote,
  addTag, removeTag, setTags,
  setPipelineStage,
  getPipelineBoard,
  getTagsList,
  getClientsByTag,
};
