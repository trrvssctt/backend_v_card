const { pool } = require('../db');

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM admin_users WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ? LIMIT 1', [email]);
  return rows[0];
}

async function getRolePermissionsByAdminId(adminId) {
  const [rows] = await pool.query(
    `SELECT p.name FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN roles r ON r.id = rp.role_id
     JOIN admin_users a ON a.role_id = r.id
     WHERE a.id = ?`,
    [adminId]
  );
  return rows.map((r) => r.name);
}

async function getRoleNameByAdminId(adminId) {
  const [rows] = await pool.query(
    `SELECT r.name FROM roles r
     JOIN admin_users a ON a.role_id = r.id
     WHERE a.id = ? LIMIT 1`,
    [adminId]
  );
  return rows[0] && rows[0].name;
}

module.exports = { findById, findByEmail, getRolePermissionsByAdminId, getRoleNameByAdminId };
