const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT NOT NULL,
      plan_id INT DEFAULT NULL,
      amount DECIMAL(10,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'XOF',
      reference VARCHAR(255) DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_invoice_user FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function createInvoice({ utilisateur_id, plan_id = null, amount = 0, currency = 'XOF', reference = null, status = 'paid', metadata = null }) {
  const [result] = await pool.query(
    `INSERT INTO invoices (utilisateur_id, plan_id, amount, currency, reference, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [utilisateur_id, plan_id, amount, currency, reference, status, metadata ? JSON.stringify(metadata) : null]
  );
  return { id: result.insertId, utilisateur_id, plan_id, amount, currency, reference, status };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM invoices WHERE id = ? LIMIT 1', [id]);
  return rows && rows[0] ? rows[0] : null;
}

module.exports = { init, createInvoice, findById };
