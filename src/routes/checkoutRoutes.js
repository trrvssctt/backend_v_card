const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const authMiddleware = require('../middlewares/authMiddleware');

// create checkout (authenticated)
router.post('/', authMiddleware, checkoutController.createCheckout);

// get checkout details by token (public)
router.get('/:token', checkoutController.getCheckout);

// confirm checkout (allow unauthenticated confirmation using checkout token)
router.post('/:token/confirm', checkoutController.confirmCheckout);

module.exports = router;
