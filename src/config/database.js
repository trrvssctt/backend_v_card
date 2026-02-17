import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-gestionapp.alwaysdata.net',
  user: process.env.DB_USER || '385922',
  password: process.env.DB_PASSWORD || 'Dianka16',
  database: process.env.DB_NAME || 'gestionapp_portefolia_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

export default pool;
