const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');
const auth = require('../middlewares/authMiddleware');
const requireActive = require('../middlewares/requireActive');
const { portfolioRules, validate } = require('../validators/portfolioValidator');

router.post('/', auth, requireActive, portfolioRules(), validate, portfolioController.create);
router.put('/:id', auth, requireActive, portfolioRules(), validate, portfolioController.update);
// GET single portfolio (auth required)
router.get('/:id', auth, portfolioController.getById);
// Note: GET /api/portfolios/ (no id) returns listByUser
router.get('/', auth, portfolioController.listByUser);
module.exports = router;
