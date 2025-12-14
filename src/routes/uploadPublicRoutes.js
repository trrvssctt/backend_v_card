const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadController = require('../controllers/uploadController');
const auth = require('../middlewares/authMiddleware');
const requireActive = require('../middlewares/requireActive');

// Public upload endpoint for authenticated users (used for CV upload, etc.)
// POST /api/uploads/cloudinary
router.post('/cloudinary', auth, requireActive, upload.single('file'), async (req, res) => {
  return uploadController.uploadToCloudinary(req, res);
});

module.exports = router;
