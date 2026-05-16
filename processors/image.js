const sharp = require('sharp');
const path = require('path');
const { ensureDir, withExt } = require('../utils/fsx.js');


const IMAGE_MAX_WIDTH = parseInt(process.env.IMAGE_MAX_WIDTH || '1920', 10);
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY || '45', 10);


/**
* Comprime y convierte imágenes a AVIF (muy eficiente) con fallback WebP
* para lograr un "peso" muy bajo manteniendo buena calidad.
*/
async function processImage(inputPath, outDirPublic) {
await ensureDir(outDirPublic);
const baseName = path.basename(inputPath, path.extname(inputPath));
const avifOut = path.join(outDirPublic, `${baseName}.avif`);
const webpOut = path.join(outDirPublic, `${baseName}.webp`);


// 1) Intentar AVIF
try {
await sharp(inputPath)
.rotate() // respeta orientación EXIF
.resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
.avif({ quality: IMAGE_QUALITY, effort: 4 })
.toFile(avifOut);
return { outputPath: avifOut, mime: 'image/avif' };
} catch (e) {
console.warn('AVIF falló, probando WebP', e.message);
}


// 2) Fallback WebP
await sharp(inputPath)
.rotate()
.resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
.webp({ quality: IMAGE_QUALITY })
.toFile(webpOut);
return { outputPath: webpOut, mime: 'image/webp' };
}

module.exports = { processImage }