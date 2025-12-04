const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfc_cards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      price_cents INT NOT NULL,
      currency VARCHAR(10) DEFAULT 'FCFA',

      allow_name TINYINT(1) DEFAULT 1,
      allow_surname TINYINT(1) DEFAULT 1,
      allow_email TINYINT(1) DEFAULT 1,
      allow_phone TINYINT(1) DEFAULT 1,
      allow_job TINYINT(1) DEFAULT 1,
      allow_website TINYINT(1) DEFAULT 1,

      allow_logo TINYINT(1) DEFAULT 0,
      allow_design_custom TINYINT(1) DEFAULT 0,

      metadata JSON DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  // Ensure columns exist for older schemas
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nfc_cards'`
    );
    const columnNames = new Set(cols.map((r) => r.COLUMN_NAME));
    if (!columnNames.has('metadata')) {
      await pool.query("ALTER TABLE nfc_cards ADD COLUMN metadata JSON DEFAULT NULL");
    }
    if (!columnNames.has('is_active')) {
      await pool.query("ALTER TABLE nfc_cards ADD COLUMN is_active TINYINT(1) DEFAULT 1");
    }
    if (!columnNames.has('updated_at')) {
      await pool.query("ALTER TABLE nfc_cards ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }
  } catch (e) {
    console.warn('carte_visite_model.init: could not ensure columns', e.message || e);
  }
}

async function listCards({ onlyActive = true } = {}) {
  const where = onlyActive ? 'WHERE is_active = 1' : '';
  const [rows] = await pool.query(`SELECT * FROM nfc_cards ${where} ORDER BY price_cents ASC`);
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM nfc_cards WHERE id = ? LIMIT 1', [id]);
  return rows && rows.length ? rows[0] : null;
}

async function createCard(data) {
  const payload = {
    name: data.name,
    description: data.description || null,
    price_cents: data.price_cents || 0,
    currency: data.currency || 'FCFA',
    allow_name: data.allow_name ? 1 : 0,
    allow_surname: data.allow_surname ? 1 : 0,
    allow_email: data.allow_email ? 1 : 0,
    allow_phone: data.allow_phone ? 1 : 0,
    allow_job: data.allow_job ? 1 : 0,
    allow_website: data.allow_website ? 1 : 0,
    allow_logo: data.allow_logo ? 1 : 0,
    allow_design_custom: data.allow_design_custom ? 1 : 0,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    is_active: data.is_active ? 1 : 0,
  };
  const keys = Object.keys(payload).join(', ');
  const placeholders = Object.keys(payload).map(() => '?').join(', ');
  const values = Object.values(payload);
  const [result] = await pool.query(`INSERT INTO nfc_cards (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...payload };
}

async function updateCard(id, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return await getById(id);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => {
    if (k === 'metadata') return JSON.stringify(patch[k]);
    if (['allow_name','allow_surname','allow_email','allow_phone','allow_job','allow_website','allow_logo','allow_design_custom','is_active'].includes(k)) return patch[k] ? 1 : 0;
    return patch[k];
  });
  values.push(id);
  await pool.query(`UPDATE nfc_cards SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  return await getById(id);
}

async function deleteCard(id) {
  await pool.query('DELETE FROM nfc_cards WHERE id = ?', [id]);
}

module.exports = { init, listCards, getById, createCard, updateCard, deleteCard };
