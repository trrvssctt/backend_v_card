const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const auth = require('../middlewares/authMiddleware');
const adminAuth = require('../middlewares/adminAuth');

// Public: list plans
router.get('/', planController.listPlans);
// Authenticated: get current user's subscriptions
router.get('/me', auth, planController.getUserPlans);
// Public: get plan by id or slug
router.get('/:idOrSlug', planController.getPlan);

// Admin: create plan
router.post('/', auth, adminAuth, planController.createPlan);

// Authenticated user: subscribe to a plan
router.post('/subscribe', auth, planController.subscribe);

module.exports = router;
