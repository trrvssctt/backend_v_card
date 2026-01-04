const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

router.post('/register', auth.register);
router.post('/login', auth.login);
// Admin login (separate endpoint so client login uses `utilisateurs` table only)
router.post('/admin/sama_connection_page', auth.adminLogin);
router.get('/admin/me', require('../middlewares/authMiddleware'), auth.adminMe);
router.get('/verify', auth.verify);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);

module.exports = router;
