const mime = require('mime-types');


const IMAGE_MIMES = new Set(['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif']);
const VIDEO_MIMES = new Set(['video/mp4','video/quicktime','video/x-msvideo','video/x-matroska','video/webm']);
const PDF_MIME = 'application/pdf';


function isImage(m) { return IMAGE_MIMES.has(m); }
function isVideo(m) { return VIDEO_MIMES.has(m); }
function isPdf(m) { return m === PDF_MIME; }
function guessExt(m){ return mime.extension(m) || 'bin'; }

module.exports = {
    IMAGE_MIMES,
    VIDEO_MIMES,
    PDF_MIME,
    isImage,
    isVideo,
    isPdf,
    guessExt
}