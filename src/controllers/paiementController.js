// controllers/paiementController.js
const paiementModel = require('../models/paiementModel'); // ajuste le chemin si besoin

// Liste (endpoint admin) : /api/admin/paiements
async function listAdmin(req, res) {
  try {
    const userId = req.userId;
    const remote = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    console.log(`[paiementController.listAdmin] called by userId=${userId} ip=${remote} query=`, req.query);

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const data = await paiementModel.list({ page, limit });

    console.log(`[paiementController.listAdmin] returning ${Array.isArray(data.paiements) ? data.paiements.length : 0} paiements (page=${page} limit=${limit})`);
    return res.json(data);
  } catch (err) {
    console.error('paiementController.listAdmin error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}


// Récupérer un paiement par id : /api/admin/paiements/:id
async function getById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const paiement = await paiementModel.findById(id);
    if (!paiement) return res.status(404).json({ error: 'Not found' });

    return res.json({ paiement });
  } catch (err) {
    console.error('paiementController.getById error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Mettre à jour le statut : PUT /api/admin/paiements/:id/status
async function updateStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!id || !status) return res.status(400).json({ error: 'Missing id or status' });

    // Ici tu peux vérifier si l'utilisateur est admin ou a les droits
    // const userId = req.userId; // si tu utilises auth middleware
    // if (!isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });

    const updated = await paiementModel.updateStatus(id, status);
    return res.json({ paiement: updated });
  } catch (err) {
    console.error('paiementController.updateStatus error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listAdmin, getById, updateStatus };
