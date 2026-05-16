const multer = require('multer');
const path = require('path');
const { ensureDir } = require('../utils/fsx.js');

/**
 * Servicio de subida de archivos
 * - Crea directorios definidos en el .env (DIRECTORIES)
 * - Permite elegir dinámicamente el destino desde el controlador
 */

const directoryFiles = {
  public: 'storage/public',
  avatars: 'storage/avatars',
  contracts: 'storage/contracts',
  vouchers: 'storage/vouchers',
  others: 'storage/others'
};

let baseDir = process.cwd();
let fullDirs = {};

/**
 * Inicializa los directorios de subida.
 * Crea los necesarios si no existen.
 */
async function initUploadService() {
  // Lee directorios desde .env o usa los definidos
  const dirsFromEnv = process.env.DIRECTORIES
    ? process.env.DIRECTORIES.split(',').map(d => d.trim())
    : Object.values(directoryFiles);

  // Crea directorios
  for (const [key, relPath] of Object.entries(directoryFiles)) {
    const fullPath = path.isAbsolute(relPath)
      ? relPath
      : path.join(baseDir, relPath);
    await ensureDir(fullPath);
    fullDirs[key] = fullPath;
  }

  console.log('📁 [UPLOAD] Directorios inicializados:');
  Object.entries(fullDirs).forEach(([k, v]) => console.log(`   - ${k}: ${v}`));

  return fullDirs;
}

/**
 * Devuelve un middleware Multer configurado según el tipo indicado.
 * @param {string} dirPath - ruta del directorio (por ejemplo directoryFiles.vouchers)
 * @returns {multer.Multer} middleware listo para usar
 */
function getUploader(dirPath = directoryFiles.others, nameFile = "") {
  // Validación del directorio
  const uploadDir = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(baseDir, dirPath);

  if (!uploadDir) {
    throw new Error(`❌ [UPLOAD] Directorio inválido: ${dirPath}`);
  }

  const storage = multer.diskStorage({
    destination: async (_, __, cb) => {
      try {
        await ensureDir(uploadDir);
        cb(null, uploadDir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (_, file, cb) => {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      let name = path.basename(file.originalname, ext);
      if(!!nameFile) {
        name = `${nameFile}${ext}`
      } else {
        name = `${name}-${timestamp}${ext}`
      }
      cb(null, name);
    },
  });

  const maxSizeMB = Number(process.env.MAX_FILE_MB) || 100;

  return multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  });
}

module.exports = {
  directoryFiles,
  initUploadService,
  getUploader
}