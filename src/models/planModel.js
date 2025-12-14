const { pool } = require('../db');

async function init() {
  // Create plans table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(200) NOT NULL UNIQUE,
      description TEXT,
      price_cents INT DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'XOF',
      billing_interval VARCHAR(50) DEFAULT 'one_time',
      is_public TINYINT(1) DEFAULT 1,
      metadata JSON DEFAULT NULL,
      external_price_id VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_features (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_id INT NOT NULL,
      feature VARCHAR(255) NOT NULL,
      value VARCHAR(255) DEFAULT NULL,
      position INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT NOT NULL,
      plan_id INT NULL,
      start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      end_date TIMESTAMP NULL DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'active',
      payment_reference VARCHAR(255) DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function listPlans() {
  const [rows] = await pool.query('SELECT id, name, slug, description, price_cents, currency, billing_interval, is_public, created_at, updated_at FROM plans WHERE deleted_at IS NULL ORDER BY price_cents ASC');
  return rows;
}

async function getPlanById(id) {
  const [rows] = await pool.query('SELECT * FROM plans WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function getPlanBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM plans WHERE slug = ? LIMIT 1', [slug]);
  return rows[0];
}

async function createPlan({ name, slug, description = null, price_cents = 0, currency = 'XOF', billing_interval = 'one_time', is_public = 1, metadata = null, external_price_id = null }) {
  // generate a slug from name if not provided
  let finalSlug = slug;
  if (!finalSlug) {
    const base = (name || '').toString().toLowerCase().trim()
      .replace(/[\s\u00A0\-]+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/\-+/g, '-').replace(/^-+|-+$/g, '');
    let candidate = base || `plan-${Date.now()}`;
    // ensure uniqueness
    let i = 0;
    while (true) {
      const check = i === 0 ? candidate : `${candidate}-${i}`;
      const [rows] = await pool.query('SELECT id FROM plans WHERE slug = ? LIMIT 1', [check]);
      if (!rows || rows.length === 0) {
        finalSlug = check;
        break;
      }
      i++;
    }
  }

  const [result] = await pool.query(
    `INSERT INTO plans (name, slug, description, price_cents, currency, billing_interval, is_public, metadata, external_price_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, finalSlug, description, price_cents, currency, billing_interval, is_public, metadata ? JSON.stringify(metadata) : null, external_price_id]
  );
  return { id: result.insertId };
}

async function addFeature(plan_id, feature, value = null, position = 0) {
  const [result] = await pool.query('INSERT INTO plan_features (plan_id, feature, value, position) VALUES (?, ?, ?, ?)', [plan_id, feature, value, position]);
  return { id: result.insertId };
}

async function listPlanFeatures(plan_id) {
  const [rows] = await pool.query('SELECT id, feature, value, position FROM plan_features WHERE plan_id = ? ORDER BY position ASC', [plan_id]);
  return rows;
}

async function subscribeUser({ utilisateur_id, plan_id = null, start_date = null, end_date = null, status = 'active', payment_reference = null, metadata = null }) {
  const [result] = await pool.query(
    `INSERT INTO user_plans (utilisateur_id, plan_id, start_date, end_date, status, payment_reference, metadata)
     VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?)`,
    [utilisateur_id, plan_id, start_date, end_date, status, payment_reference, JSON.stringify(metadata)]
  );
  return { id: result.insertId };
}

async function listUserPlans(utilisateur_id) {
  const [rows] = await pool.query(
    'SELECT up.*, p.name, p.slug, p.price_cents, p.billing_interval, p.currency FROM user_plans up LEFT JOIN plans p ON p.id = up.plan_id WHERE up.utilisateur_id = ? ORDER BY up.created_at DESC',
    [utilisateur_id]
  );
  return rows;
}

module.exports = { init, listPlans, getPlanById, getPlanBySlug, createPlan, addFeature, listPlanFeatures, subscribeUser, listUserPlans };
