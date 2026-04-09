const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const imageDetectionController = require('../controllers/imageDetectionController');
const authMiddleware = require('../middlewares/authMiddleware');
const { analyzeImage } = require('../services/aiAnalysisService');

const router = express.Router();

// 配置 multer 临时存储
const upload = multer({
  dest: path.join(__dirname, '../../storage/tmp'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|bmp|gif|webp|tiff|tif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /image\/(jpeg|png|bmp|gif|webp|tiff)/.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed (jpg, jpeg, png, bmp, gif, webp, tiff)'));
  }
});

// 健康检查
router.get('/health', imageDetectionController.checkServiceHealth);

// 单张图片检测
router.post('/detect', authMiddleware, upload.single('file'), imageDetectionController.detectSingleImage);

// 批量图片检测
router.post('/detect/batch', authMiddleware, upload.array('files', 20), imageDetectionController.detectMultipleImages);

// 单独 YOLO 检测
router.post('/detect-only', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片' });
        const imageDetectionService = require('../services/imageDetectionService');
        const result = await imageDetectionService.detectImage(req.file.path);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
});

// AI 完整分析（YOLO + 豆包）
router.post('/analyze-full', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片' });
        let originalFilename = req.file.originalname;
        try { originalFilename = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); } catch (_) {}
        
        // 直接使用前端传来的 yoloResult
        let yoloResult = null;
        if (req.body.yoloResult) {
            try { yoloResult = JSON.parse(req.body.yoloResult); } catch (_) {}
        }
        const aiResult = await analyzeImage(req.file.path, originalFilename, yoloResult);
        res.json(aiResult);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
});

module.exports = router;
