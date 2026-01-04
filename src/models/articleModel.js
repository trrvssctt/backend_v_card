const { pool } = require('../db');

async function init() {
  // migration handles table creation
}

async function createArticle(data) {
  const sql = `INSERT INTO articles (title, slug, excerpt, content, meta_title, meta_description, status, author_id, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [data.title, data.slug, data.excerpt || null, data.content || null, data.meta_title || null, data.meta_description || null, data.status || 'draft', data.author_id || null, data.published_at || null];
  const [res] = await pool.query(sql, params);
  return findById(res.insertId);
}

async function updateArticle(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return findById(id);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const params = keys.map(k => patch[k]);
  params.push(id);
  await pool.query(`UPDATE articles SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
  return findById(id);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM articles WHERE id = ? LIMIT 1', [id]);
  return rows && rows[0] ? rows[0] : null;
}

async function findBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM articles WHERE slug = ? AND deleted_at IS NULL LIMIT 1', [slug]);
  return rows && rows[0] ? rows[0] : null;
}

async function listArticles({ page = 1, limit = 20, q = null, status = null } = {}) {
  const l = Math.min(Number(limit) || 20, 200);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (q) { where.push('(title LIKE ? OR excerpt LIKE ? OR content LIKE ?)'); params.push('%'+q+'%','%'+q+'%','%'+q+'%'); }
  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS cnt FROM articles ${whereSql}`, params);
  const total = countRow ? Number(countRow.cnt || 0) : 0;
  const sql = `SELECT * FROM articles ${whereSql} ORDER BY published_at DESC, created_at DESC LIMIT ? OFFSET ?`;
  const [rows] = await pool.query(sql, params.concat([l, offset]));
  return { articles: rows || [], page: p, limit: l, total };
}

async function deleteArticle(id) {
  await pool.query('UPDATE articles SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { ok: true };
}

module.exports = { init, createArticle, updateArticle, findById, findBySlug, listArticles, deleteArticle };
