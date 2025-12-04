const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      titre VARCHAR(200) NOT NULL,
      description TEXT,
      image TEXT,
      lien_demo TEXT,
      lien_code TEXT,
      date_debut DATE,
      date_fin DATE,
      CONSTRAINT fk_projet_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function create(project) {
  const keys = Object.keys(project).join(', ');
  const placeholders = Object.keys(project).map(() => '?').join(', ');
  const values = Object.values(project);
  const [result] = await pool.query(`INSERT INTO projets (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...project };
}

async function update(id, data) {
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await pool.query(`UPDATE projets SET ${sets} WHERE id = ?`, values);
  const [rows] = await pool.query('SELECT * FROM projets WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function del(id) {
  await pool.query('DELETE FROM projets WHERE id = ?', [id]);
}

async function findByPortfolio(portfolioId) {
  const [rows] = await pool.query('SELECT * FROM projets WHERE portfolio_id = ? ORDER BY date_debut DESC', [portfolioId]);
  return rows;
}

async function deleteByPortfolio(portfolioId) {
  await pool.query('DELETE FROM projets WHERE portfolio_id = ?', [portfolioId]);
}

module.exports = { init, create, update, del, findByPortfolio, deleteByPortfolio };
