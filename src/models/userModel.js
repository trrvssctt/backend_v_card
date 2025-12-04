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
}

async function createUser({ nom, prenom, email, mot_de_passe, photo_profil = null, biographie = null, role = 'USER' }) {
  // Create user as verified by default (remove email verification concept)
  const [result] = await pool.query(
    'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, photo_profil, biographie, role, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [nom, prenom, email, mot_de_passe, photo_profil, biographie, role, 1]
  );
  return { id: result.insertId, nom, prenom, email };
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM utilisateurs WHERE email = ? LIMIT 1', [email]);
  return rows[0];
}

async function findById(id) {
  const [rows] = await pool.query('SELECT id, nom, prenom, email, photo_profil, biographie, role, verified, date_inscription, dernier_login FROM utilisateurs WHERE id = ? LIMIT 1', [id]);
  return rows[0];
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
  await pool.query('DELETE FROM utilisateurs WHERE id = ?', [id]);
}

async function listUsers({ page = 1, limit = 50 } = {}) {
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

module.exports = { init, createUser, findByEmail, findById, findByVerificationToken, verifyUser, setLastLogin, setActive, deleteUser, listUsers };
