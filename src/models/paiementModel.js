const { pool } = require('../db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paiements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      commande_id INT NOT NULL,
      moyen_paiement VARCHAR(100) DEFAULT 'manual',
      reference_transaction VARCHAR(255) DEFAULT NULL,
      montant DECIMAL(10,2) DEFAULT 0,
      statut VARCHAR(50) DEFAULT 'pending',
      metadata JSON DEFAULT NULL,
      image_paiement VARCHAR(1024) DEFAULT NULL,
      date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      CONSTRAINT fk_paiement_commande FOREIGN KEY (commande_id) REFERENCES commandes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Ensure backwards-compatibility: if the table existed before we added the `metadata` column
  // add it now. We check INFORMATION_SCHEMA to avoid SQL errors on older MySQL versions.
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paiements' AND COLUMN_NAME IN ('metadata', 'image_paiement')`
    );
    const existing = (cols || []).map(c => c.COLUMN_NAME);
    if (!existing.includes('metadata')) {
      try { await pool.query(`ALTER TABLE paiements ADD COLUMN metadata JSON DEFAULT NULL`); } catch (e) { console.warn('Could not add metadata column', e.message || e); }
    }
    if (!existing.includes('image_paiement')) {
      try { await pool.query(`ALTER TABLE paiements ADD COLUMN image_paiement VARCHAR(1024) DEFAULT NULL`); } catch (e) { console.warn('Could not add image_paiement column', e.message || e); }
    }
  } catch (err) {
    // If the DB doesn't support JSON or INFORMATION_SCHEMA access, ignore and let other queries fail visibly.
    console.warn('paiementModel.init: could not ensure metadata column exists', err.message || err);
  }
}

async function createPaiement(data) {
  const payload = {
    commande_id: data.commande_id,
    moyen_paiement: data.moyen_paiement || data.provider || 'manual',
    reference_transaction: data.reference_transaction || data.reference || null,
    montant: data.montant || 0,
    statut: data.statut || data.status || 'pending',
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    // Some deployments have image_paiement column NOT NULL; ensure we don't insert null values
    image_paiement: (data.image_paiement || data.image) ? (data.image_paiement || data.image) : '',
  };
  const keys = Object.keys(payload).join(', ');
  const placeholders = Object.keys(payload).map(() => '?').join(', ');
  const values = Object.values(payload);
  const [result] = await pool.query(`INSERT INTO paiements (${keys}) VALUES (${placeholders})`, values);
  const created = { id: result.insertId, ...payload };
  return created;
}

async function findById(id) {
  const [rows] = await pool.query(`
    SELECT p.*, p.reference_transaction AS reference, p.montant AS montant_total, p.statut AS status,
           c.numero_commande AS numero_commande, c.utilisateur_id AS utilisateur_id,
           u.nom AS utilisateur_nom, u.prenom AS utilisateur_prenom, u.email AS utilisateur_email
    FROM paiements p
    LEFT JOIN commandes c ON c.id = p.commande_id
    LEFT JOIN utilisateurs u ON u.id = c.utilisateur_id
    WHERE p.id = ?
    LIMIT 1
  `, [id]);
  return rows && rows.length ? rows[0] : null;
}

async function list({ page = 1, limit = 50 } = {}) {
  const l = Math.min(Number(limit) || 50, 200);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;
  const [rows] = await pool.query(`
select * 
from paiements
left join commandes c on c.id = paiements.commande_id
left join utilisateurs u on u.id = c.utilisateur_id
order by paiements.created_at desc
  `, [l, offset]);
  return { paiements: rows, page: p, limit: l };
}

async function updateStatus(id, status) {
  await pool.query('UPDATE paiements SET statut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  return await findById(id);
}

module.exports = { init, createPaiement, findById, list, updateStatus };
