const userModel = require('../models/userModel');

module.exports = async function (req, res, next) {
  try {
    // authMiddleware should have populated req.userId already
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await userModel.findById(userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (String(user.role).toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Forbidden - admin only' });
    // attach full user to request for later handlers
    req.user = user;
    next();
  } catch (err) {
    console.error('adminAuth error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
