const experienceModel = require('../models/experienceModel');

async function create(req, res) {
  try {
    const experience = {
      portfolio_id: req.body.portfolio_id || req.body.portfolioId,
      titre_poste: req.body.title || req.body.titre_poste || req.body.titre || null,
      entreprise: req.body.company || req.body.entreprise || null,
      description: req.body.description || null,
      date_debut: req.body.date_debut || null,
      date_fin: req.body.date_fin || null,
    };
    Object.keys(experience).forEach(k => experience[k] === undefined && delete experience[k]);
    const result = await experienceModel.create(experience);
    return res.status(201).json({ experience: result });
  } catch (err) {
    console.error('Error creating experience:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function update(req, res) {
  try {
    const id = Number(req.params.id);
    const data = {
      titre_poste: req.body.title !== undefined ? req.body.title : req.body.titre_poste !== undefined ? req.body.titre_poste : req.body.titre,
      entreprise: req.body.company !== undefined ? req.body.company : req.body.entreprise,
      description: req.body.description,
      date_debut: req.body.date_debut,
      date_fin: req.body.date_fin,
    };
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const result = await experienceModel.update(id, data);
    return res.json({ experience: result });
  } catch (err) {
    console.error('Error updating experience:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function del(req, res) {
  try {
    const id = Number(req.params.id);
    await experienceModel.del(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting experience:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function listByPortfolio(req, res) {
  try {
    const portfolioId = Number(req.params.portfolioId);
    const rows = await experienceModel.findByPortfolio(portfolioId);
    return res.json({ experiences: rows });
  } catch (err) {
    console.error('Error listing experiences:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { create, update, del, listByPortfolio };
