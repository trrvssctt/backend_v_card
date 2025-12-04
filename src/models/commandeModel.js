const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commandes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT NOT NULL,
      numero_commande VARCHAR(100) UNIQUE NOT NULL,
      statut ENUM('En_attente','En_traitement','Expédiée','Livrée','Annulée') DEFAULT 'En_attente',
      montant_total DECIMAL(10,2) DEFAULT 0,
      adresse_livraison TEXT,
      date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      date_livraison TIMESTAMP NULL,
      CONSTRAINT fk_commande_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

async function createCommande(data) {
  const payload = {
    utilisateur_id: data.utilisateur_id,
    numero_commande: data.numero_commande,
    statut: data.statut || 'En_attente',
    montant_total: data.montant_total || 0,
    adresse_livraison: data.adresse_livraison || null,
  };
  const keys = Object.keys(payload).join(', ');
  const placeholders = Object.keys(payload).map(() => '?').join(', ');
  const values = Object.values(payload);
  const [result] = await pool.query(`INSERT INTO commandes (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...payload };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM commandes WHERE id = ? LIMIT 1', [id]);
  return rows[0];
}

async function findByUser(userId) {
  const [rows] = await pool.query('SELECT * FROM commandes WHERE utilisateur_id = ? ORDER BY date_commande DESC', [userId]);
  return rows;
}

async function updateStatus(id, statut) {
  await pool.query('UPDATE commandes SET statut = ? WHERE id = ?', [statut, id]);
  return await findById(id);
}

module.exports = { init, createCommande, findById, findByUser, updateStatus };
