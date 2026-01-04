const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middlewares/authMiddleware');
const adminAuth = require('../middlewares/adminAuth');

// Admin listing endpoints
//router.get('/admin/users', auth, userController.ListUsers);
router.get('/admin/users', auth, adminAuth, userController.ListUsers);
router.get('/admin/users/pending', auth, userController.adminPendingUsers);

router.post('/register', userController.register);
router.post('/login', userController.login);
// Admin helper: check duplicates
router.post('/admin/check-duplicate', auth, adminAuth, userController.adminCheckDuplicate);
router.get('/me', auth, userController.me);
router.put('/me', auth, userController.updateMe);
router.get('/me/paiements', auth, userController.getMyPayments);

// Admin-managed user CRUD (clients only)
router.post('/admin', auth, adminAuth, userController.adminCreateUser);
router.put('/admin/:id', auth, adminAuth, userController.adminUpdateUser);
router.delete('/admin/:id', auth, adminAuth, userController.adminSoftDeleteUser);
router.put('/admin/:id/activate', auth, adminAuth, userController.adminActivateUser);
router.put('/admin/:id/deactivate', auth, adminAuth, userController.adminDeactivateUser);
// Admin can fetch payments for a specific user
router.get('/:id/paiements', auth, adminAuth, userController.getUserPayments);

module.exports = router;
