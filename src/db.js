const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-gestionapp.alwaysdata.net',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || '385922',
  password: process.env.DB_PASSWORD || 'Dianka16',
  database: process.env.DB_NAME || 'gestionapp_carrer_card',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = {
  pool,
  async testConnection() {
    // Try connecting a few times to handle transient network issues
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let conn;
      try {
        conn = await pool.getConnection();
        await conn.ping();
        console.log('MySQL connected');
        conn.release();
        return;
      } catch (err) {
        if (conn) try { conn.release(); } catch (e) {}
        const isLast = attempt === maxAttempts;
        console.error(`MySQL connection attempt ${attempt} failed${isLast ? '' : ', retrying...'}`, err.message || err);
        if (isLast) throw err;
        // wait a bit before retrying
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
};
