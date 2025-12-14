const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const auth = require('../middlewares/authMiddleware');
const requireActive = require('../middlewares/requireActive');

router.post('/', auth, requireActive, projectController.create);
router.put('/:id', auth, requireActive, projectController.update);
router.delete('/:id', auth, requireActive, projectController.del);
router.get('/portfolio/:portfolioId', auth, projectController.listByPortfolio);

module.exports = router;
