const { pool } = require('../db');
const crypto = require('crypto');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      user_agent TEXT,
      ip VARCHAR(50),
      revoked TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      INDEX (utilisateur_id),
      INDEX (token_hash)
    ) ENGINE=InnoDB;
  `);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createRefreshToken({ utilisateur_id, token, user_agent = null, ip = null, expires_at = null }) {
  const token_hash = hashToken(token);
  await pool.query('INSERT INTO refresh_tokens (utilisateur_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)', [utilisateur_id, token_hash, user_agent, ip, expires_at]);
}

async function findByToken(token) {
  const token_hash = hashToken(token);
  const [rows] = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1', [token_hash]);
  return rows[0];
}

async function revokeByToken(token) {
  const token_hash = hashToken(token);
  await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [token_hash]);
}

async function revokeById(id) {
  await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [id]);
}

async function revokeAllForUser(userId) {
  await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE utilisateur_id = ?', [userId]);
}

async function deleteExpired() {
  await pool.query('DELETE FROM refresh_tokens WHERE expires_at IS NOT NULL AND expires_at < NOW()');
}

module.exports = { init, createRefreshToken, findByToken, revokeByToken, revokeById, revokeAllForUser, deleteExpired };
