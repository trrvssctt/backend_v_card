const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cartes_nfc (
      id INT AUTO_INCREMENT PRIMARY KEY,
      commande_id INT NOT NULL,
      uid_nfc VARCHAR(150) UNIQUE NOT NULL,
      lien_portfolio TEXT,
      design TEXT,
      statut ENUM('En_attente','Gravée','Envoyée','Active') DEFAULT 'En_attente',
      date_activation TIMESTAMP NULL,
      CONSTRAINT fk_carte_commande FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function createCarte(data) {
  const payload = {
    commande_id: data.commande_id,
    uid_nfc: data.uid_nfc,
    lien_portfolio: data.lien_portfolio || null,
    design: data.design || null,
    statut: data.statut || 'En_attente',
  };
  const keys = Object.keys(payload).join(', ');
  const placeholders = Object.keys(payload).map(() => '?').join(', ');
  const values = Object.values(payload);
  const [result] = await pool.query(`INSERT INTO cartes_nfc (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...payload };
}

async function findByCommande(commandeId) {
  const [rows] = await pool.query('SELECT * FROM cartes_nfc WHERE commande_id = ?', [commandeId]);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM cartes_nfc WHERE id = ? LIMIT 1', [id]);
  return rows && rows.length ? rows[0] : null;
}

async function findAll({ page = 1, limit = 100, statut, commande_id } = {}) {
  const l = Math.min(Number(limit) || 100, 1000);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  const where = [];
  const params = [];
  if (statut) { where.push('statut = ?'); params.push(statut); }
  if (commande_id) { where.push('commande_id = ?'); params.push(Number(commande_id)); }
  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  const [rows] = await pool.query(`SELECT * FROM cartes_nfc ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, l, offset]);
  return { cartes: rows, page: p, limit: l };
}

async function updateCarte(id, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return await findById(id);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => patch[k]);
  values.push(id);
  await pool.query(`UPDATE cartes_nfc SET ${sets} WHERE id = ?`, values);
  return await findById(id);
}

async function setStatus(id, statut) {
  await pool.query('UPDATE cartes_nfc SET statut = ? WHERE id = ?', [statut, id]);
  return await findById(id);
}

async function assignUid(id, uid) {
  await pool.query('UPDATE cartes_nfc SET uid_nfc = ? WHERE id = ?', [uid, id]);
  return await findById(id);
}

async function deleteCarte(id) {
  await pool.query('DELETE FROM cartes_nfc WHERE id = ?', [id]);
}

module.exports = { init, createCarte, findByCommande, findById, findAll, updateCarte, setStatus, assignUid, deleteCarte };
