const adminUserModel = require('../models/adminUserModel');

// Usage: requirePermission('users:write') or requirePermission(['users:write','system:admin'])
function requirePermission(required) {
  const requiredPermissions = Array.isArray(required) ? required : [required];

  return async function (req, res, next) {
    try {
      // authMiddleware must have set req.userId
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      // Try to find admin in admin_users first
      let admin = await adminUserModel.findById(userId);
      // If not found, try utilisateurs table (some admin accounts are stored there with role string)
      if (!admin) {
        const userModel = require('../models/userModel');
        const user = await userModel.findById(userId);
        if (!user) return res.status(403).json({ error: 'Forbidden - admin access required' });
        const roleStr = (user.role || '').toString().toLowerCase();
        if (!roleStr.includes('admin')) {
          return res.status(403).json({ error: 'Forbidden - admin access required' });
        }

        // user is an admin-like role; fetch permissions based on roles.name = user.role
        const { pool } = require('../db');
        // super_admin bypass
        if (roleStr === 'super_admin' || roleStr === 'super-admin') {
          req.admin = user; // attach user record
          return next();
        }

        // Try exact role name match first
        let [permRows] = await pool.query(
          `SELECT p.name FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
           JOIN roles r ON r.id = rp.role_id
           WHERE LOWER(r.name) = ?`,
          [roleStr]
        );
        let permissions = (permRows || []).map((r) => r.name);

        // If no exact match found, try a fallback: roles containing 'admin' (covers cases like usuarios.role='ADMIN')
        if ((!permissions || permissions.length === 0) && roleStr === 'admin') {
          const [fallbackRows] = await pool.query(
            `SELECT p.name FROM permissions p
             JOIN role_permissions rp ON rp.permission_id = p.id
             JOIN roles r ON r.id = rp.role_id
             WHERE LOWER(r.name) LIKE '%admin%'`
          );
          permissions = (fallbackRows || []).map((r) => r.name);
        }

        const hasAll = requiredPermissions.every((p) => permissions.includes(p));
        if (!hasAll) return res.status(403).json({ error: 'Forbidden - missing permission' });
        req.admin = user;
        return next();
      }

      // super_admin bypasses permission checks for dedicated admin_users
      const roleName = await adminUserModel.getRoleNameByAdminId(admin.id);
      if (roleName === 'super_admin') {
        req.admin = admin;
        return next();
      }

      const permissions = await adminUserModel.getRolePermissionsByAdminId(admin.id);
      const hasAll = requiredPermissions.every((p) => permissions.includes(p));
      if (!hasAll) return res.status(403).json({ error: 'Forbidden - missing permission' });

      req.admin = admin;
      next();
    } catch (err) {
      console.error('RBAC error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  };
}

module.exports = { requirePermission };
