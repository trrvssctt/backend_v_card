const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS liens_sociaux (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      plateforme VARCHAR(100),
      url TEXT,
      CONSTRAINT fk_lien_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function findByPortfolio(portfolioId) {
  const [rows] = await pool.query('SELECT * FROM liens_sociaux WHERE portfolio_id = ?', [portfolioId]);
  return rows;
}

async function deleteByPortfolio(portfolioId) {
  await pool.query('DELETE FROM liens_sociaux WHERE portfolio_id = ?', [portfolioId]);
}

module.exports = { init, findByPortfolio, deleteByPortfolio };