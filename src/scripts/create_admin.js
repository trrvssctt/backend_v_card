require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../db');

async function upsertAdmin(email, password, fullName = null, roleName = 'super_admin') {
  try {
    // ensure roles table has role
    const [roleRows] = await pool.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleName]);
    let roleId = roleRows && roleRows[0] && roleRows[0].id;
    if (!roleId) {
      const [ir] = await pool.query('INSERT INTO roles (name, description) VALUES (?, ?) ', [roleName, 'Created by script']);
      roleId = ir.insertId;
    }

    const hash = await bcrypt.hash(password, 12);

    const [existing] = await pool.query('SELECT id FROM admin_users WHERE email = ? LIMIT 1', [email]);
    if (existing && existing.length > 0) {
      const id = existing[0].id;
      await pool.query('UPDATE admin_users SET password_hash = ?, full_name = ?, role_id = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, fullName, roleId, id]);
      console.log('Updated existing admin user id=', id);
      return id;
    } else {
      const [res] = await pool.query('INSERT INTO admin_users (email, password_hash, full_name, role_id, is_active) VALUES (?, ?, ?, ?, 1)', [email, hash, fullName, roleId]);
      console.log('Inserted admin user id=', res.insertId);
      return res.insertId;
    }
  } catch (e) {
    console.error('Failed to upsert admin:', e);
    process.exit(1);
  }
}

(async () => {
  const email = process.env.CREATE_ADMIN_EMAIL || 'seydou@portefolia.com';
  const password = process.env.CREATE_ADMIN_PASSWORD || 'Passer1234';
  const name = process.env.CREATE_ADMIN_NAME || 'Seydou DIANKA';
  const role = process.env.CREATE_ADMIN_ROLE || 'super_admin';
  await upsertAdmin(email, password, name, role);
  console.log('Done.');
  process.exit(0);
})();
