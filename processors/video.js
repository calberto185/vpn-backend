const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const { ensureDir } = require('../utils/fsx.js');


const VIDEO_TARGET_BITRATE = process.env.VIDEO_TARGET_BITRATE || '1500k';
const VIDEO_MAX_WIDTH = parseInt(process.env.VIDEO_MAX_WIDTH || '1280', 10);
const VIDEO_CRF = parseInt(process.env.VIDEO_CRF || '28', 10);


/**
* Convierte cualquier video a MP4 (H.264 + AAC) con bitrate/CRF bajos.
* Estrategia: CRF + límite de bitrate y reescalado si es mayor que VIDEO_MAX_WIDTH.
*/
async function processVideo(inputPath, outDirPublic) {
await ensureDir(outDirPublic);
const outPath = path.join(outDirPublic, `${path.parse(inputPath).name}.mp4`);


await new Promise((resolve, reject) => {
ffmpeg(inputPath)
.outputOptions([
'-c:v libx264',
`-crf ${VIDEO_CRF}`,
'-preset veryfast',
`-b:v ${VIDEO_TARGET_BITRATE}`,
'-maxrate ' + VIDEO_TARGET_BITRATE,
'-bufsize ' + (parseInt(VIDEO_TARGET_BITRATE) * 2 || '3000k'),
`-vf scale='min(${VIDEO_MAX_WIDTH},iw):-2'`,
'-movflags +faststart',
'-c:a aac',
'-b:a 128k',
'-ac 2'
])
.on('end', resolve)
.on('error', reject)
.save(outPath);
});


return { outputPath: outPath, mime: 'video/mp4' };
}

module.exports = { processVideo }