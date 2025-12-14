const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      thumbnail_url VARCHAR(1024),
      preview_url VARCHAR(1024),
      price_cents INT DEFAULT 0,
      currency VARCHAR(16) DEFAULT 'F CFA',
      is_public TINYINT DEFAULT 1,
      author VARCHAR(255),
      version VARCHAR(50),
      supported_sections JSON,
      required_fields JSON,
      allowed_plans JSON,
      default_settings JSON,
      settings_schema JSON,
      assets JSON,
      custom_css TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // Ensure portfolios has template columns (for older DBs)
  try {
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS selected_template_id INT NULL");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS template_settings JSON NULL");
  } catch (err) {
    // Some MySQL versions may not support IF NOT EXISTS in ALTER; ignore failures
    console.warn('templateModel.init: optional ALTER TABLE may not be supported:', err.message);
  }
}

async function findAllPublic() {
  const [rows] = await pool.query('SELECT * FROM templates WHERE is_public = 1 ORDER BY id DESC');
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM templates WHERE id = ? LIMIT 1', [id]);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function findBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM templates WHERE slug = ? LIMIT 1', [slug]);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function createTemplate(data) {
  const fields = [
    'name','slug','description','thumbnail_url','preview_url','price_cents','currency','is_public','author','version','supported_sections','required_fields','allowed_plans','default_settings','settings_schema','assets','custom_css'
  ];
  const payload = {};
  fields.forEach(f => { if (data[f] !== undefined) payload[f] = data[f]; });
  const keys = Object.keys(payload);
  if (keys.length === 0) throw new Error('No template data');
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO templates (${keys.join(',')}) VALUES (${placeholders})`;
  const values = keys.map(k => payload[k]);
  const [result] = await pool.query(sql, values);
  return await findById(result.insertId);
}

async function updateTemplate(id, data) {
  const fields = ['name','description','thumbnail_url','preview_url','price_cents','currency','is_public','author','version','supported_sections','required_fields','allowed_plans','default_settings','settings_schema','assets','custom_css'];
  const payload = {};
  fields.forEach(f => { if (data[f] !== undefined) payload[f] = data[f]; });
  const keys = Object.keys(payload);
  if (keys.length === 0) return await findById(id);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => payload[k]);
  values.push(id);
  await pool.query(`UPDATE templates SET ${sets} WHERE id = ?`, values);
  return await findById(id);
}

async function removeTemplate(id) {
  await pool.query('DELETE FROM templates WHERE id = ?', [id]);
  return true;
}

module.exports = { init, findAllPublic, findById, findBySlug, createTemplate, updateTemplate, removeTemplate };
