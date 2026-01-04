const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      portfolio_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      page VARCHAR(200) DEFAULT NULL,
      payload JSON DEFAULT NULL,
      adresse_ip VARCHAR(50) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_analytics_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function create(event) {
  const keys = [];
  const values = [];
  if (!event || !event.portfolio_id || !event.type) throw new Error('portfolio_id and type are required');
  keys.push('portfolio_id'); values.push(event.portfolio_id);
  keys.push('type'); values.push(event.type);
  keys.push('page'); values.push(event.page || null);
  keys.push('payload'); values.push(event.payload ? JSON.stringify(event.payload) : null);
  keys.push('adresse_ip'); values.push(event.adresse_ip || null);
  keys.push('user_agent'); values.push(event.user_agent || null);

  const sql = `INSERT INTO analytics_events (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`;
  const [result] = await pool.query(sql, values);
  return { id: result.insertId, ...event };
}

async function findByPortfolio(portfolioId, since=null) {
  const params = [portfolioId];
  let sql = 'SELECT * FROM analytics_events WHERE portfolio_id = ?';
  if (since) { sql += ' AND created_at >= ?'; params.push(since); }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countByType(portfolioId, since=null) {
  const params = [portfolioId];
  let sql = 'SELECT type, COUNT(*) AS cnt FROM analytics_events WHERE portfolio_id = ?';
  if (since) { sql += ' AND created_at >= ?'; params.push(since); }
  sql += ' GROUP BY type';
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { init, create, findByPortfolio, countByType };
