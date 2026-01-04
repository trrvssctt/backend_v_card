const express = require('express');
const router = express.Router();
const abonnementController = require('../controllers/abonnementController');
const auth = require('../middlewares/authMiddleware');
// public checkout endpoints for abonnement tokens
router.get('/checkout/:token', abonnementController.getCheckoutInfo);
router.post('/checkout/:token/confirm', abonnementController.confirmCheckout);

router.post('/', auth, abonnementController.createAbonnement);
router.get('/me', auth, abonnementController.getUserAbonnements);
router.get('/me/paiements', auth, abonnementController.getUserPayments);
router.get('/:id', auth, abonnementController.getAbonnement);
router.put('/:id/cancel', auth, abonnementController.cancelAbonnement);

module.exports = router;
