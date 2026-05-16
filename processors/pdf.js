const { exec: execCb } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { ensureDir } = require('../utils/fsx.js');
const exec = promisify(execCb);


const PDF_GS_QUALITY = process.env.PDF_GS_QUALITY || '/ebook'; // /screen es más agresivo


/**
* Comprime PDFs usando Ghostscript (requiere gs instalado en el sistema).
*/
async function processPdf(inputPath, outDirPublic) {
await ensureDir(outDirPublic);
const outPath = path.join(outDirPublic, `${path.parse(inputPath).name}.pdf`);


const cmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${PDF_GS_QUALITY} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outPath}" "${inputPath}"`;
await exec(cmd);
return { outputPath: outPath, mime: 'application/pdf' };
}
module.exports = { processPdf }