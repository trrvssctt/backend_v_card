const { pool } = require('../db');

async function record({ content_type, content_id, changes, editor_id = null }) {
  await pool.query('INSERT INTO content_history (content_type, content_id, changes, editor_id) VALUES (?, ?, ?, ?)', [content_type, content_id, JSON.stringify(changes || {}), editor_id]);
}

async function listFor(content_type, content_id, limit = 50) {
  const [rows] = await pool.query('SELECT * FROM content_history WHERE content_type = ? AND content_id = ? ORDER BY created_at DESC LIMIT ?', [content_type, content_id, limit]);
  return rows || [];
}

module.exports = { record, listFor };
