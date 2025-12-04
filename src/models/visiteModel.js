const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      date_visite TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      adresse_ip VARCHAR(50),
      user_agent TEXT,
      pays VARCHAR(100),
      referer TEXT,
      CONSTRAINT fk_visite_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function create(data) {
  if (!data || !data.portfolio_id) {
    throw new Error('portfolio_id is required');
  }
  const keys = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);
  const [result] = await pool.query(`INSERT INTO visites (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...data };
}

module.exports = { init, create };
