const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');
const auth = require('../middlewares/authMiddleware');
const adminAuth = require('../middlewares/adminAuth');

// Routes mounted at /api/admin/paiements (admin area)
// GET / -> list paiements (supports ?page=&limit=)
router.get('/', auth, adminAuth, async (req, res) => {
  return paiementController.listAdmin(req, res);
});

// GET /:id -> get single paiement
router.get('/:id', auth, adminAuth, async (req, res) => {
  return paiementController.getById(req, res);
});

// PUT /:id/status -> update status
router.put('/:id/status', auth, adminAuth, async (req, res) => {
  return paiementController.updateStatus(req, res);
});

module.exports = router;
