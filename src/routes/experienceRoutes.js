const express = require('express');
const router = express.Router();
const experienceController = require('../controllers/experienceController');
const auth = require('../middlewares/authMiddleware');

router.post('/', auth, experienceController.create);
router.put('/:id', auth, experienceController.update);
router.delete('/:id', auth, experienceController.del);
router.get('/portfolio/:portfolioId', auth, experienceController.listByPortfolio);

module.exports = router;
