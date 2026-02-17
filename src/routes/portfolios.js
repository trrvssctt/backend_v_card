
import express from 'express';
import * as portfolioController from '../controllers/portfolioController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// 1. Routes publiques (Pas de token requis)
router.get('/public/:slug', portfolioController.getPublicPortfolio);

// 2. Routes "Spéciales" (Avant les routes avec paramètre :id simple)
router.get('/me', protect, portfolioController.getMyPortfolio);

// 3. Routes avec paramètre ID
// Utilisation d'une route spécifique pour les détails pour éviter les collisions
router.get('/:id/details', protect, portfolioController.getPortfolioDetails);

// Route de mise à jour principale (PUT /api/portfolios/:id)
router.put('/:id', protect, portfolioController.updatePortfolio);

// 4. Création
router.post('/', protect, portfolioController.createPortfolio);

export default router;
