const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const paiementController = require('../controllers/paiementController');
const auth = require('../middlewares/authMiddleware');
const adminAuth = require('../middlewares/adminAuth');

// Protected admin endpoints
router.get('/users', auth, adminAuth, adminController.listUsers);
router.get('/users/pending', auth, adminAuth, adminController.listPendingUsers);
router.get('/commandes', auth, adminAuth, adminController.listCommandes);
// User management
router.get('/users/:id', auth, adminAuth, adminController.getUser);
router.put('/users/:id/activate', auth, adminAuth, adminController.activateUser);
router.put('/users/:id/deactivate', auth, adminAuth, adminController.deactivateUser);
router.put('/users/:id/verify', auth, adminAuth, adminController.verifyUser);
router.delete('/users/:id', auth, adminAuth, adminController.deleteUser);

// Confirm payment and validate (generate invoice, subscription, send email)
router.put('/users/:id/confirm-payment', auth, adminAuth, adminController.confirmPaymentAndValidate);

// Portfolios admin
router.get('/portfolios', auth, adminAuth, adminController.listPortfolios);
router.get('/portfolios/:id', auth, adminAuth, adminController.getPortfolio);
router.put('/portfolios/:id', auth, adminAuth, adminController.updatePortfolioAdmin);
router.delete('/portfolios/:id', auth, adminAuth, adminController.deletePortfolio);
router.put('/portfolios/:id/feature', auth, adminAuth, adminController.featurePortfolio);

// Commandes admin
router.get('/commandes', auth, adminAuth, adminController.adminListCommandes);
router.get('/commandes/:id', auth, adminAuth, adminController.adminGetCommande);
router.put('/commandes/:id/status', auth, adminAuth, adminController.adminUpdateCommandeStatus);

// Analytics & reports
router.get('/totals', auth, adminAuth, adminController.totals);
router.get('/visits/monthly', auth, adminAuth, adminController.monthlyVisits);
router.get('/revenue/monthly', auth, adminAuth, adminController.monthlyRevenue);
router.get('/export/commandes.csv', auth, adminAuth, adminController.exportCommandesCsv);

// Cartes admin
router.get('/cartes', auth, adminAuth, adminController.listCartes);
router.get('/cartes/:id', auth, adminAuth, adminController.getCarte);
router.put('/cartes/:id/assign-uid', auth, adminAuth, adminController.assignUidCarte);
router.put('/cartes/:id/status', auth, adminAuth, adminController.setCarteStatus);
router.delete('/cartes/:id', auth, adminAuth, adminController.deleteCarte);

// Paiements admin (delegated to dedicated routes file)
const paiementRoutes = require('./paiementRoutes');
router.use('/paiements', paiementRoutes);

// Notifications admin
router.get('/notifications', auth, adminAuth, adminController.listNotifications);
router.post('/notifications', auth, adminAuth, adminController.createNotification);

// Uploads (server-side Cloudinary upload endpoint)
const uploadRoutes = require('./uploadRoutes');
router.use('/uploads', uploadRoutes);

// Revenue / finance
router.get('/revenue/summary', auth, adminAuth, adminController.revenueSummary);
router.get('/revenue/users', auth, adminAuth, adminController.revenueByUser);
router.get('/revenue/stream', auth, adminAuth, adminController.revenueStream);

// Upgrade requests management
router.get('/upgrades', auth, adminAuth, adminController.listUpgrades);
router.get('/upgrades/:id', auth, adminAuth, adminController.getUpgrade);
router.put('/upgrades/:id/approve', auth, adminAuth, adminController.approveUpgrade);

module.exports = router;
