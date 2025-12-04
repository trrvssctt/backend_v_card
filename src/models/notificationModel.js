const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      titre VARCHAR(255),
      message TEXT,
      meta JSON,
      sent BOOLEAN DEFAULT FALSE,
      date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);
}

async function createNotification({ user_id = null, titre, message, meta = null }) {
  const payload = { user_id, titre, message, meta: meta ? JSON.stringify(meta) : null };
  const keys = Object.keys(payload).join(', ');
  const placeholders = Object.keys(payload).map(() => '?').join(', ');
  const values = Object.values(payload);
  const [result] = await pool.query(`INSERT INTO notifications (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...payload };
}

async function list({ page = 1, limit = 50 } = {}) {
  const l = Math.min(Number(limit) || 50, 200);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  // Determine the best column to order by (robust to existing schema variations)
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'`
  );
  const columnNames = new Set(cols.map((r) => r.COLUMN_NAME));
  const preferred = ['date_created', 'created_at', 'date_creation', 'date', 'id'];
  let orderBy = 'id';
  for (const n of preferred) {
    if (columnNames.has(n)) { orderBy = n; break; }
  }
  const [rows] = await pool.query(`SELECT * FROM notifications ORDER BY ${orderBy} DESC LIMIT ? OFFSET ?`, [l, offset]);
  return { notifications: rows, page: p, limit: l };
}

async function markSent(id) {
  await pool.query('UPDATE notifications SET sent = TRUE WHERE id = ?', [id]);
}

module.exports = { init, createNotification, list, markSent };
