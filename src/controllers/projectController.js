const projectModel = require('../models/projectModel');

async function create(req, res) {
  try {
    const userId = req.userId;
    const portfolioId = Number(req.body.portfolio_id);
    if (!portfolioId) return res.status(400).json({ error: 'portfolio_id required' });
    // map incoming keys to French DB columns expected by projectModel
    const project = {
      portfolio_id: portfolioId,
      titre: req.body.title || req.body.titre || null,
      description: req.body.description || null,
      image: req.body.image || null,
      lien_demo: req.body.demo_url || req.body.lien_demo || null,
      lien_code: req.body.code_url || req.body.lien_code || null,
      date_debut: req.body.date_debut || null,
      date_fin: req.body.date_fin || null,
    };
    const result = await projectModel.create(project);
    return res.status(201).json({ project: result });
  } catch (err) {
    console.error('Error creating project:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function update(req, res) {
  try {
    const id = Number(req.params.id);
    const data = {
      titre: req.body.title !== undefined ? req.body.title : req.body.titre,
      description: req.body.description,
      image: req.body.image,
      lien_demo: req.body.demo_url !== undefined ? req.body.demo_url : req.body.lien_demo,
      lien_code: req.body.code_url !== undefined ? req.body.code_url : req.body.lien_code,
      date_debut: req.body.date_debut,
      date_fin: req.body.date_fin,
    };
    // remove undefined properties
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const result = await projectModel.update(id, data);
    return res.json({ project: result });
  } catch (err) {
    console.error('Error updating project:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function del(req, res) {
  try {
    const id = Number(req.params.id);
    await projectModel.del(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting project:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function listByPortfolio(req, res) {
  try {
    const portfolioId = Number(req.params.portfolioId);
    const rows = await projectModel.findByPortfolio(portfolioId);
    return res.json({ projects: rows });
  } catch (err) {
    console.error('Error listing projects:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { create, update, del, listByPortfolio };
