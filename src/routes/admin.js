
import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ success: false, message: "Accès refusé. Droits d'administrateur requis." });
  }
};

router.use(protect);
router.use(isAdmin);

router.get('/stats', adminController.getGlobalStats);
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserDetails);
router.post('/users/admin', adminController.createAdmin);
router.post('/users/client', adminController.createClient);
router.put('/users/admin/:id', adminController.updateAdmin);
router.put('/users/:id/status', adminController.updateUserStatus);
router.get('/payments', adminController.getAllPayments);

// Logistique NFC
router.get('/nfc-orders', adminController.getAllNFCOrders);
router.put('/nfc-orders/:id/status', adminController.updateNFCOrderStatus);

// Demandes d'Upgrade
router.get('/upgrade-requests', adminController.getUpgradeRequests);
router.post('/upgrade-requests/:paymentId/approve', adminController.approveUpgrade);

// Gestion des Plans
router.get('/plans', adminController.getAllPlans);
router.post('/plans', adminController.createPlan);
router.put('/plans/:id', adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

// Gestion des Rôles & Permissions
router.get('/permissions', adminController.getPermissions);
router.get('/roles', adminController.getRoles);
router.post('/roles', adminController.createRole);
router.put('/roles/:id', adminController.updateRole);

export default router;
