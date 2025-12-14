const express = require('express');
const router = express.Router();
const experienceController = require('../controllers/experienceController');
const auth = require('../middlewares/authMiddleware');
const requireActive = require('../middlewares/requireActive');

router.post('/', auth, requireActive, experienceController.create);
router.put('/:id', auth, requireActive, experienceController.update);
router.delete('/:id', auth, requireActive, experienceController.del);
router.get('/portfolio/:portfolioId', auth, experienceController.listByPortfolio);

module.exports = router;
