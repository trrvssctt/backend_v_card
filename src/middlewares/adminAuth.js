const userModel = require('../models/userModel');
const adminUserModel = require('../models/adminUserModel');

module.exports = async function (req, res, next) {
  try {
    // authMiddleware should have populated req.userId already
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // First try regular utilisateurs table
    const user = await userModel.findById(userId);
    if (user) {
      const roleStr = (user.role || '').toString().toLowerCase();
      // Accept any role that explicitly contains 'admin' (e.g. 'admin', 'ADMIN', 'super_admin', 'admin_technique')
      if (roleStr.includes('admin')) {
        req.user = user;
        return next();
      }
    }

    // Fallback: check admin_users table for dedicated admin accounts
    const admin = await adminUserModel.findById(userId);
    if (!admin) return res.status(403).json({ error: 'Forbidden - admin only' });
    req.user = admin;
    next();
  } catch (err) {
    console.error('adminAuth error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
