const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/carte_visite_control');
const adminAuth = require('../middlewares/adminAuth');

// Public
router.get('/', ctrl.listPublicCards);
router.get('/:id', ctrl.getCard);

// Admin protected
router.post('/', adminAuth, ctrl.createCard);
router.put('/:id', adminAuth, ctrl.updateCard);
router.delete('/:id', adminAuth, ctrl.deleteCard);

module.exports = router;
