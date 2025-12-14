const express = require('express');
const router = express.Router();
const templateModel = require('../models/templateModel');
const auth = require('../middlewares/authMiddleware');
const adminAuth = require('../middlewares/adminAuth');

// Public: list templates
router.get('/', async (req, res) => {
  try {
    const templates = await templateModel.findAllPublic();
    res.json({ templates });
  } catch (err) {
    console.error('GET /api/templates error', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Public: get template by slug
router.get('/:slug', async (req, res) => {
  try {
    const t = await templateModel.findBySlug(req.params.slug);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json({ template: t });
  } catch (err) {
    console.error('GET /api/templates/:slug error', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Admin: create template
router.post('/', auth, adminAuth, async (req, res) => {
  try {
    const created = await templateModel.createTemplate(req.body);
    res.json({ template: created });
  } catch (err) {
    console.error('POST /api/templates error', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Admin: update
router.put('/:id', auth, adminAuth, async (req, res) => {
  try {
    const updated = await templateModel.updateTemplate(req.params.id, req.body);
    res.json({ template: updated });
  } catch (err) {
    console.error('PUT /api/templates/:id error', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Admin: delete
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    await templateModel.removeTemplate(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/templates/:id error', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
