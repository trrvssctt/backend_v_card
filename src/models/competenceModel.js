const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      nom VARCHAR(150) NOT NULL,
      niveau ENUM('Débutant','Intermédiaire','Avancé','Expert'),
      categorie VARCHAR(100),
      CONSTRAINT fk_competence_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function create(data) {
  const keys = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);
  const [result] = await pool.query(`INSERT INTO competences (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...data };
}

async function update(id, data) {
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await pool.query(`UPDATE competences SET ${sets} WHERE id = ?`, values);
  const [rows] = await pool.query('SELECT * FROM competences WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function del(id) {
  await pool.query('DELETE FROM competences WHERE id = ?', [id]);
}

async function findByPortfolio(portfolioId) {
  const [rows] = await pool.query('SELECT * FROM competences WHERE portfolio_id = ?', [portfolioId]);
  return rows;
}

async function deleteByPortfolio(portfolioId) {
  await pool.query('DELETE FROM competences WHERE portfolio_id = ?', [portfolioId]);
}

module.exports = { init, create, update, del, findByPortfolio, deleteByPortfolio };
