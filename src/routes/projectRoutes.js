const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const auth = require('../middlewares/authMiddleware');

router.post('/', auth, projectController.create);
router.put('/:id', auth, projectController.update);
router.delete('/:id', auth, projectController.del);
router.get('/portfolio/:portfolioId', auth, projectController.listByPortfolio);

module.exports = router;
