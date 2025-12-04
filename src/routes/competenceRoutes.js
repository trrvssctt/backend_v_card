const express = require('express');
const router = express.Router();
const competenceController = require('../controllers/competenceController');
const auth = require('../middlewares/authMiddleware');

router.post('/', auth, competenceController.create);
router.put('/:id', auth, competenceController.update);
router.delete('/:id', auth, competenceController.del);
router.get('/portfolio/:portfolioId', auth, competenceController.listByPortfolio);

module.exports = router;
