const path = require('path');
const fs = require('fs/promises');
const { isImage, isVideo, isPdf } = require('../utils/mime.js');
const { processImage } = require('../processors/image.js');
const { processVideo } = require('../processors/video.js');
const { processPdf } = require('../processors/pdf.js');
const { ensureDir } = require('../utils/fsx.js');
const { getUploader, directoryFiles } = require('../services/storageService.js');

const uploadFileMiddleware = (ruteDirectory, nameFile) => async (req, res, next) => {
  try {
    // 🧱 Crear directorio si no existe
    await ensureDir(ruteDirectory);

    const user = !!req?.user?.id ? req?.user?.id : nameFile
    const timestamp = Date.now();
    const name = `${user}-${timestamp}`
    // ⚙️ Configurar Multer dinámicamente
    const upload = await getUploader(ruteDirectory, name).single('file');

    // 📤 Ejecutar Multer
    upload(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            code: "file_invalid",
            status: 400,
            message: "El archivo excede el tamaño máximo permitido.",
          });
        }
        console.error('❌ Error Multer:', err);
        return res.status(500).json({
          code: "error_internal",
          status: 500,
          message: "Error al subir el archivo."
        });
      }

      // Verificar archivo subido
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          code: "file_invalid",
          status: 400,
          message: 'No se subió ningún archivo.'
        });
      }
      next();
      // try {
      //   const mime = file.mimetype;
      //   const outDirStorage = path.join(process.cwd(), ruteDirectory);
      //   await ensureDir(outDirStorage);

      //   let result;
      //   if (isImage(mime)) {
      //     result = await processImage(file.path, outDirStorage);
      //   } else if (isVideo(mime)) {
      //     result = await processVideo(file.path, outDirStorage);
      //   } else if (isPdf(mime)) {
      //     result = await processPdf(file.path, outDirStorage);
      //   } else {
      //     return res.status(400).json({ error: 'Tipo de archivo no soportado.' });
      //   }

      //   // 🧹 Eliminar archivo temporal
      //   await fs.rm(file.path, { force: true });

      //   return res.json({
      //     success: true,
      //     mime: result.mime,
      //     outputPath: result.outputPath.replace(process.cwd(), ''), // ruta relativa
      //   });
      // } catch (error) {
      //   console.error('❌ Error procesando archivo:', error);
      //   return res.status(500).json({ error: 'Error procesando el archivo.' });
      // }
    });
  } catch (err) {
    console.error('❌ Error general en upload:', err);
    res.status(500).json({
      code: "error_internal",
      status: 500,
      message: 'Error interno del servidor.'
    });
  }
}

module.exports = { uploadFileMiddleware };
