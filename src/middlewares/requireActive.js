const { pool } = require('../db');

module.exports = async function (req, res, next) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const [rows] = await pool.query('SELECT is_active FROM utilisateurs WHERE id = ? LIMIT 1', [userId]);
    const user = rows[0];
    // Default to active if column is missing or user not found (allow other checks to handle that)
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (typeof user.is_active === 'undefined' || user.is_active === 1) {
      return next();
    }
    return res.status(403).json({ error: 'Account inactive. Please complete payment or contact support.' });
  } catch (err) {
    console.error('requireActive middleware error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
