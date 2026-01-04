const { pool } = require('../db');

// Usage: app.post('/users/:id', authMiddleware, rbac.requirePermission('users:write'), logAdminAction('update_user', 'users'), handler)
function logAdminAction(action, resource) {
  return async function (req, res, next) {
    // after response we want to log outcome; hook into res.on('finish')
    const start = Date.now();
    res.on('finish', async () => {
      try {
        const adminId = (req.admin && req.admin.id) || null;
        const details = JSON.stringify({
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          body: req.body,
        });
        const ip = req.ip || req.headers['x-forwarded-for'] || null;
        const ua = req.headers['user-agent'] || null;
        await pool.query(
          'INSERT INTO admin_action_logs (admin_id, action, resource, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
          [adminId, action, resource, details, ip, ua]
        );
      } catch (err) {
        console.error('adminLogger error:', err.message);
      }
    });
    next();
  };
}

module.exports = { logAdminAction };
