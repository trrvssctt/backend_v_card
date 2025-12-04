const { pool } = require('../db');
const crypto = require('crypto');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkouts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(128) NOT NULL UNIQUE,
      utilisateur_id INT NOT NULL,
      plan_id INT NOT NULL,
      commande_id INT NOT NULL,
      paiement_id INT NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      expires_at TIMESTAMP NULL,
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE,
      FOREIGN KEY (paiement_id) REFERENCES paiements(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function createCheckout({ utilisateur_id, plan_id, commande_id, paiement_id, expires_at = null, metadata = null }) {
  const token = genToken();
  const [result] = await pool.query(`INSERT INTO checkouts (token, utilisateur_id, plan_id, commande_id, paiement_id, expires_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [token, utilisateur_id, plan_id, commande_id, paiement_id, expires_at, metadata ? JSON.stringify(metadata) : null]);
  return { id: result.insertId, token, utilisateur_id, plan_id, commande_id, paiement_id, expires_at };
}

async function findByToken(token) {
  const [rows] = await pool.query(`SELECT * FROM checkouts WHERE token = ? LIMIT 1`, [token]);
  return rows && rows.length ? rows[0] : null;
}

async function updateStatus(id, status) {
  await pool.query('UPDATE checkouts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  const [rows] = await pool.query('SELECT * FROM checkouts WHERE id = ? LIMIT 1', [id]);
  return rows && rows.length ? rows[0] : null;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM checkouts WHERE id = ? LIMIT 1', [id]);
  return rows && rows.length ? rows[0] : null;
}

async function list({ page = 1, limit = 50 } = {}) {
  const l = Math.min(Number(limit) || 50, 200);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  const [rows] = await pool.query(`SELECT c.*, u.email AS user_email, u.nom AS user_nom, u.prenom AS user_prenom, p.name AS plan_name, p.price_cents AS plan_price_cents
    FROM checkouts c
    LEFT JOIN utilisateurs u ON u.id = c.utilisateur_id
    LEFT JOIN plans p ON p.id = c.plan_id
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?`, [l, offset]);
  return { checkouts: rows, page: p, limit: l };
}

module.exports = { init, createCheckout, findByToken, updateStatus, findById, list };
