const express = require('express');
const router = express.Router();
const commandeController = require('../controllers/commandeController');
const auth = require('../middlewares/authMiddleware');

// protected routes
router.post('/', auth, commandeController.createOrder);
router.get('/', auth, commandeController.listOrders);
router.get('/:id', auth, commandeController.getOrder);
router.put('/:id/status', auth, commandeController.updateOrderStatus);

// public order creation (guests)
router.post('/public', commandeController.createPublicOrder);

module.exports = router;
