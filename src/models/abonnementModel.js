const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abonnements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT NOT NULL,
      plan_id INT NULL,
      type VARCHAR(50) DEFAULT 'abonnement',
      statut VARCHAR(50) DEFAULT 'pending',
      montant DECIMAL(10,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'XOF',
      start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      end_date TIMESTAMP NULL,
      payment_reference VARCHAR(255) DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function createAbonnement({ utilisateur_id, plan_id = null, type = 'abonnement', statut = 'pending', montant = 0, currency = 'XOF', start_date = null, end_date = null, payment_reference = null, metadata = null }) {
  const sql = `INSERT INTO abonnements (utilisateur_id, plan_id, type, statut, montant, currency, start_date, end_date, payment_reference, metadata) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)`;
  const params = [utilisateur_id, plan_id, type, statut, montant, currency, start_date, end_date, payment_reference, metadata ? JSON.stringify(metadata) : null];
  const [result] = await pool.query(sql, params);
  return { id: result.insertId, utilisateur_id, plan_id, type, statut, montant, currency, start_date, end_date, payment_reference, metadata };
}

async function findByUser(utilisateur_id) {
  const [rows] = await pool.query('SELECT * FROM abonnements WHERE utilisateur_id = ? ORDER BY created_at DESC', [utilisateur_id]);
  return rows || [];
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM abonnements WHERE id = ? LIMIT 1', [id]);
  return rows && rows[0] ? rows[0] : null;
}

async function findByPaymentToken(token) {
  if (!token) return null;
  try {
    const [rows] = await pool.query(`SELECT * FROM abonnements WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.payment_token')) = ? LIMIT 1`, [token]);
    if (rows && rows[0]) return rows[0];
  } catch (e) {
    // ignore JSON_EXTRACT errors (older MySQL, etc.)
  }
  // fallback: match payment_reference
  try {
    const [rows2] = await pool.query('SELECT * FROM abonnements WHERE payment_reference = ? LIMIT 1', [token]);
    if (rows2 && rows2[0]) return rows2[0];
  } catch (e) { /* ignore */ }
  // fallback: metadata contains token as substring
  try {
    const like = `%${token}%`;
    const [rows3] = await pool.query('SELECT * FROM abonnements WHERE metadata LIKE ? LIMIT 1', [like]);
    if (rows3 && rows3[0]) return rows3[0];
  } catch (e) { /* ignore */ }
  return null;
}

async function updatePaymentDetails(id, { payment_reference = null, end_date = null, statut = 'active' } = {}) {
  await pool.query('UPDATE abonnements SET payment_reference = ?, end_date = ?, statut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [payment_reference, end_date, statut, id]);
  return await findById(id);
}

async function updateStatus(id, statut) {
  await pool.query('UPDATE abonnements SET statut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [statut, id]);
  return await findById(id);
}

async function cancelAbonnement(id) {
  await pool.query('UPDATE abonnements SET statut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['cancelled', id]);
  return await findById(id);
}

module.exports = { init, createAbonnement, findByUser, findById, findByPaymentToken, updatePaymentDetails, updateStatus, cancelAbonnement };
