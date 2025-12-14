const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const auth = require('../middlewares/authMiddleware');

// Public event ingestion endpoint (called from portfolio pages)
router.post('/events', analyticsController.recordEvent);

// summary requires auth and ownership check is done in controller
router.get('/summary', auth, analyticsController.summary);
router.get('/stream', auth, analyticsController.streamVisits);
router.get('/', auth, analyticsController.getAnalytics);
// Alias for advanced analytics used by frontend
router.get('/advanced', auth, analyticsController.getAnalytics);

module.exports = router;
