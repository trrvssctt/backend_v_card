const express = require('express');
const router = express.Router();
const competenceController = require('../controllers/competenceController');
const auth = require('../middlewares/authMiddleware');
const requireActive = require('../middlewares/requireActive');

router.post('/', auth, requireActive, competenceController.create);
router.put('/:id', auth, requireActive, competenceController.update);
router.delete('/:id', auth, requireActive, competenceController.del);
router.get('/portfolio/:portfolioId', auth, competenceController.listByPortfolio);

module.exports = router;
