const { getDB, nameCollections } = require("../services/dbServices");
const path = require("path");
const fs   = require("fs");
const multer = require("multer");

// ── Multer: store logos in storage/branding/ ──────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../storage/branding")),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = file.fieldname + "_" + Date.now() + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Formato no permitido. Use PNG, JPG, SVG, WebP o ICO."));
  },
});

/** Fields accepted for logo upload */
const uploadFields = upload.fields([
  { name: "logo",      maxCount: 1 },
  { name: "logo_dark", maxCount: 1 },
  { name: "favicon",   maxCount: 1 },
]);

// ── Singleton key ─────────────────────────────────────────────────────────
const SINGLETON = "main";

// ── Default branding document ─────────────────────────────────────────────
function defaultBranding() {
  return {
    singleton: SINGLETON,
    // Identidad
    name:       "CarlosVM",
    shortName:  "CVM",
    tagline:    "Tu conexión segura",
    legalName:  "",
    // Logos (relative URLs served via /storage/branding/)
    logo:       null,
    logo_dark:  null,
    favicon:    null,
    // Tipografía
    fontPrimary:   "Inter",
    fontSecondary: "Inter",
    // Colores de marca (CSS HSL values compatible con DaisyUI)
    colorPrimary:   "262 80% 50%",
    colorSecondary: "316 70% 50%",
    colorAccent:    "175 60% 40%",
    // Social / contacto
    website:   "",
    email:     "",
    phone:     "",
    instagram: "",
    twitter:   "",
    facebook:  "",
    youtube:   "",
    // Meta SEO
    metaTitle:       "",
    metaDescription: "",
    // Sistema
    updatedAt: new Date(),
  };
}

// ── GET /api/branding ─────────────────────────────────────────────────────
async function getBranding(req, res) {
  try {
    const db   = getDB();
    const doc  = await db.collection(nameCollections.branding).findOne({ singleton: SINGLETON });
    const data = doc ?? defaultBranding();
    res.status(200).json({ code: "ok", data });
  } catch (err) {
    console.error("getBranding error:", err);
    res.status(500).json({ code: "error", message: "Error al obtener la configuración de marca" });
  }
}

// ── PUT /api/branding ─────────────────────────────────────────────────────
async function saveBranding(req, res) {
  // Multer has already run via middleware; files are in req.files, text in req.body
  try {
    const db  = getDB();
    const col = db.collection(nameCollections.branding);

    const existing = await col.findOne({ singleton: SINGLETON }) ?? defaultBranding();

    // Build update payload from text fields
    const fields = [
      "name","shortName","tagline","legalName",
      "fontPrimary","fontSecondary",
      "colorPrimary","colorSecondary","colorAccent",
      "website","email","phone",
      "instagram","twitter","facebook","youtube",
      "metaTitle","metaDescription",
    ];
    const update = { ...existing, updatedAt: new Date() };
    for (const f of fields) {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    }

    // Handle uploaded files — delete old ones when replaced
    for (const field of ["logo", "logo_dark", "favicon"]) {
      const uploaded = req.files?.[field]?.[0];
      if (uploaded) {
        // Remove old file
        if (existing[field]) {
          const oldPath = path.join(__dirname, "../storage/branding", path.basename(existing[field]));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        update[field] = `/storage/branding/${uploaded.filename}`;
      }
    }

    await col.updateOne(
      { singleton: SINGLETON },
      { $set: update },
      { upsert: true }
    );

    res.status(200).json({ code: "ok", message: "Configuración de marca guardada", data: update });
  } catch (err) {
    console.error("saveBranding error:", err);
    res.status(500).json({ code: "error", message: "Error al guardar la configuración de marca" });
  }
}

// ── DELETE /api/branding/logo/:field ─────────────────────────────────────
async function deleteLogo(req, res) {
  const { field } = req.params;
  if (!["logo", "logo_dark", "favicon"].includes(field)) {
    return res.status(400).json({ code: "error", message: "Campo inválido" });
  }
  try {
    const db  = getDB();
    const col = db.collection(nameCollections.branding);
    const doc = await col.findOne({ singleton: SINGLETON });
    if (doc?.[field]) {
      const filePath = path.join(__dirname, "../storage/branding", path.basename(doc[field]));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await col.updateOne({ singleton: SINGLETON }, { $set: { [field]: null, updatedAt: new Date() } });
    }
    res.status(200).json({ code: "ok", message: "Imagen eliminada" });
  } catch (err) {
    console.error("deleteLogo error:", err);
    res.status(500).json({ code: "error", message: "Error al eliminar la imagen" });
  }
}

module.exports = { getBranding, saveBranding, deleteLogo, uploadFields };
