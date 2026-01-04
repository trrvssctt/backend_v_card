const { pool } = require('../db');
const crypto = require('crypto');

// Initialise la table `utilisateurs` d'après class.md
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      prenom VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      mot_de_passe TEXT NOT NULL,
      photo_profil TEXT,
      biographie TEXT,
      role VARCHAR(20) DEFAULT 'USER',
      verified BOOLEAN DEFAULT FALSE,
      verification_token VARCHAR(255),
      date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      dernier_login TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // Ensure columns exist (in case table created with older schema)
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'utilisateurs'`
  );
  const columnNames = new Set(cols.map((r) => r.COLUMN_NAME));
  if (!columnNames.has('verified')) {
    await pool.query("ALTER TABLE utilisateurs ADD COLUMN verified BOOLEAN DEFAULT FALSE");
  }
  if (!columnNames.has('verification_token')) {
    await pool.query("ALTER TABLE utilisateurs ADD COLUMN verification_token VARCHAR(255)");
  }
  if (!columnNames.has('is_active')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN is_active BOOLEAN DEFAULT TRUE");
    } catch (err) {
      console.warn('userModel.init: could not add is_active column:', err.message);
    }
  }
  if (!columnNames.has('phone')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN phone VARCHAR(50) NULL");
    } catch (err) {
      console.warn('userModel.init: could not add phone column:', err.message);
    }
  }
  // Add admin tracking columns for audit (created_by, modified_by, deleted_by), soft-delete flag and deleted_at timestamp
  if (!columnNames.has('created_by')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN created_by INT NULL");
    } catch (err) {
      console.warn('userModel.init: could not add created_by column:', err.message);
    }
  }
  if (!columnNames.has('modified_by')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN modified_by INT NULL");
    } catch (err) {
      console.warn('userModel.init: could not add modified_by column:', err.message);
    }
  }
  if (!columnNames.has('deleted_by')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN deleted_by INT NULL");
    } catch (err) {
      console.warn('userModel.init: could not add deleted_by column:', err.message);
    }
  }
  if (!columnNames.has('deleted_at')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN deleted_at TIMESTAMP NULL");
    } catch (err) {
      console.warn('userModel.init: could not add deleted_at column:', err.message);
    }
  }
  if (!columnNames.has('statut')) {
    try {
      await pool.query("ALTER TABLE utilisateurs ADD COLUMN statut VARCHAR(20) DEFAULT 'actif'");
    } catch (err) {
      console.warn('userModel.init: could not add statut column:', err.message);
    }
  }
}

async function createUser({ nom, prenom, email, mot_de_passe, phone = null, photo_profil = null, biographie = null, role = 'USER', is_active = true, verified = null }) {
  // Create user. `is_active` controls whether account is active; when `verified` is not provided,
  // we set it to the same value as `is_active` to follow admin intent.
  const verifiedValue = typeof verified === 'boolean' || typeof verified === 'number' ? (verified ? 1 : 0) : (is_active ? 1 : 0);
  const isActiveValue = is_active ? 1 : 0;
  const [result] = await pool.query(
    'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, phone, photo_profil, biographie, role, is_active, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [nom, prenom, email, mot_de_passe, phone, photo_profil, biographie, role, isActiveValue, verifiedValue]
  );
  return { id: result.insertId, nom, prenom, email };
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE email = ? LIMIT 1', [email]);
  return rows[0];
}

async function findByPhone(phone) {
  if (!phone) return null;
  const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE phone = ? LIMIT 1', [phone]);
  return rows[0];
}

async function findByEmailOrPhone(email, phone) {
  const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE (email = ? OR (phone IS NOT NULL AND phone = ?)) LIMIT 1', [email, phone]);
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.query('SELECT id, nom, prenom, email, phone, photo_profil, biographie, role, verified, is_active, date_inscription, dernier_login, created_by, modified_by, deleted_by, deleted_at, statut FROM utilisateurs WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function updateUser(id, fields = {}) {
  // Only allow a safe subset of columns to be updated
  const allowed = new Set(['prenom', 'nom', 'email', 'mot_de_passe', 'photo_profil', 'biographie', 'is_active', 'verified', 'dernier_login', 'modified_by', 'phone']);
  const updates = [];
  const params = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.has(k)) {
      updates.push(`${k} = ?`);
      params.push(v);
    }
  }
  if (updates.length === 0) return null;
  params.push(id);
  const sql = `UPDATE utilisateurs SET ${updates.join(', ')} WHERE id = ?`;
  await pool.query(sql, params);
  return await findById(id);
}

async function findByVerificationToken(token) {
  const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE verification_token = ? LIMIT 1', [token]);
  return rows[0];
}

async function verifyUser(id) {
  await pool.query('UPDATE utilisateurs SET verified = TRUE, verification_token = NULL WHERE id = ?', [id]);
}

async function setLastLogin(id) {
  await pool.query('UPDATE utilisateurs SET dernier_login = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

async function setActive(id, active = true) {
  await pool.query('UPDATE utilisateurs SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

async function deleteUser(id) {
  // Preserve old behavior: hard delete if explicitly called without admin context
  await pool.query('DELETE FROM utilisateurs WHERE id = ?', [id]);
}

async function softDeleteUser(id, adminId = null) {
  const params = ['supprimer', 0, adminId, id];
  await pool.query('UPDATE utilisateurs SET statut = ?, is_active = ?, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP WHERE id = ?', params);
  return await findById(id);
}

async function activateUser(id, adminId = null) {
  const params = [1, 'actif', adminId, id];
  await pool.query('UPDATE utilisateurs SET is_active = ?, statut = ?, modified_by = ? WHERE id = ?', params);
  return await findById(id);
}

async function deactivateUser(id, adminId = null) {
  const params = [0, 'inactif', adminId, id];
  await pool.query('UPDATE utilisateurs SET is_active = ?, statut = ?, modified_by = ? WHERE id = ?', params);
  return await findById(id);
}


async function listUsers({ page = 1, limit = 50 } = {}) {
  console.log("je suis dans le mauvais model")

  const l = Math.min(Number(limit) || 50, 200);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.email, u.role, u.verified, u.is_active, u.date_inscription,
            (SELECT COUNT(*) FROM portfolios p WHERE p.utilisateur_id = u.id) AS portfolio_count
     FROM utilisateurs u
     ORDER BY u.date_inscription DESC
     LIMIT ? OFFSET ?`,
    [l, offset]
  );
  return { users: rows, page: p, limit: l };
}

async function listUsersClients({ page = 1, limit = 50 } = {}) {
  console.log("je suis dans le bon model")
  const l = Math.max(1, Math.min(Number(limit) || 50, 200));
  const p = Math.max(1, Number(page) || 1);
  const [db] = await pool.query('SELECT DATABASE() as db');
  console.log('DB ACTIVE:', db[0].db);
  const offset = (p - 1) * l;
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.email, u.role, u.verified, u.is_active, u.date_inscription,
            (SELECT COUNT(*) FROM portfolios p WHERE p.utilisateur_id = u.id) AS portfolio_count
     FROM utilisateurs u
     WHERE LOWER(TRIM(u.role)) = 'user'
     ORDER BY u.date_inscription DESC
     LIMIT ? OFFSET ?`,
    [l, offset]
  );
  return { users: rows, page: p, limit: l };
}

async function listPendingUsers({ page = 1, limit = 200 } = {}) {
  const l = Math.min(Number(limit) || 200, 1000);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.email, u.role, u.verified, u.is_active, u.date_inscription,
            (SELECT COUNT(*) FROM portfolios p WHERE p.utilisateur_id = u.id) AS portfolio_count
     FROM utilisateurs u
     WHERE (u.verified = FALSE OR u.verified = 0)
     ORDER BY u.date_inscription DESC
     LIMIT ? OFFSET ?`,
    [l, offset]
  );
  return { users: rows, page: p, limit: l };
}

module.exports = {
  init,
  createUser,
  findByEmail,
  findById,
  findByVerificationToken,
  verifyUser,
  setLastLogin,
  setActive,
  deleteUser,
  listUsers,
  listPendingUsers,
  updateUser,
  softDeleteUser,
  activateUser,
  deactivateUser,
  listUsersClients,
  findByPhone,
  findByEmailOrPhone,
};
