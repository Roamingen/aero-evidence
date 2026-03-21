const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const STORAGE_TMP_DIR = path.resolve(__dirname, '../../storage/tmp');
const STORAGE_ATTACHMENTS_DIR = path.resolve(__dirname, '../../storage/attachments');

fs.mkdirSync(STORAGE_TMP_DIR, { recursive: true });
fs.mkdirSync(STORAGE_ATTACHMENTS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'text/plain',
    'text/csv',
]);

// 这里是文件上传的限制：最大50mb，限制个数不超过5
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 5;

const storage = multer.diskStorage({
    destination(_req, _file, cb) {
        cb(null, STORAGE_TMP_DIR);
    },
    filename(_req, file, cb) {
        const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

function fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES_PER_REQUEST,
    },
});

async function computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(`0x${hash.digest('hex')}`));
        stream.on('error', reject);
    });
}

function detectAttachmentType(mimeType) {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (
        mimeType.includes('pdf')
        || mimeType.includes('document')
        || mimeType.includes('word')
        || mimeType.includes('sheet')
        || mimeType.includes('presentation')
        || mimeType.includes('msword')
        || mimeType.includes('excel')
        || mimeType.includes('powerpoint')
    ) {
        return 'document';
    }
    return 'other';
}

function ensureDraftAttachmentDir(draftId) {
    const dir = path.join(STORAGE_ATTACHMENTS_DIR, String(draftId));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_').slice(0, 200);
}

module.exports = {
    upload,
    computeFileHash,
    detectAttachmentType,
    ensureDraftAttachmentDir,
    sanitizeFileName,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE,
    MAX_FILES_PER_REQUEST,
    STORAGE_TMP_DIR,
    STORAGE_ATTACHMENTS_DIR,
};
