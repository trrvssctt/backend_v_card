const { pool } = require('../db');

async function findBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM pages WHERE slug = ? LIMIT 1', [slug]);
  return rows && rows[0] ? rows[0] : null;
}

async function upsertPage({ slug, title, content, meta_title, meta_description }) {
  const existing = await findBySlug(slug);
  if (existing) {
    await pool.query('UPDATE pages SET title = ?, content = ?, meta_title = ?, meta_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, content, meta_title || null, meta_description || null, existing.id]);
    return findBySlug(slug);
  }
  const [res] = await pool.query('INSERT INTO pages (slug, title, content, meta_title, meta_description) VALUES (?, ?, ?, ?, ?)', [slug, title, content, meta_title || null, meta_description || null]);
  return findBySlug(slug);
}

async function listPages() {
  const [rows] = await pool.query('SELECT * FROM pages ORDER BY updated_at DESC, created_at DESC');
  return rows || [];
}

module.exports = { findBySlug, upsertPage, listPages };
