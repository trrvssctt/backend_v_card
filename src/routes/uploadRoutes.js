const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadController = require('../controllers/uploadController');
const auth = require('../middlewares/authMiddleware');
const adminAuth = require('../middlewares/adminAuth');

// POST /api/admin/uploads/cloudinary
router.post('/cloudinary', auth, adminAuth, upload.single('file'), async (req, res) => {
  return uploadController.uploadToCloudinary(req, res);
});

module.exports = router;
