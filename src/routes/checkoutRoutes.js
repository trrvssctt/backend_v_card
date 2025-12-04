const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const authMiddleware = require('../middlewares/authMiddleware');

// create checkout (authenticated)
router.post('/', authMiddleware, checkoutController.createCheckout);

// get checkout details by token (public)
router.get('/:token', checkoutController.getCheckout);

// confirm checkout (authenticated or webhook in real world)
router.post('/:token/confirm', authMiddleware, checkoutController.confirmCheckout);

module.exports = router;
