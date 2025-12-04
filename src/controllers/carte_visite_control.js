const carteModel = require('../models/carte_visite_model');
const { pool } = require('../db');

async function listPublicCards(req, res) {
  try {
    const cards = await carteModel.listCards({ onlyActive: true });
    // normalize price for frontend (convert cents to major unit)
    const normalized = (cards || []).map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      price: (Number(c.price_cents || 0) / 100),
      currency: c.currency || 'FCFA',
      allow_name: !!c.allow_name,
      allow_surname: !!c.allow_surname,
      allow_email: !!c.allow_email,
      allow_phone: !!c.allow_phone,
      allow_job: !!c.allow_job,
      allow_website: !!c.allow_website,
      allow_logo: !!c.allow_logo,
      allow_design_custom: !!c.allow_design_custom,
      metadata: c.metadata ? JSON.parse(c.metadata) : null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
    return res.json({ cards: normalized });
  } catch (err) {
    console.error('listPublicCards error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getCard(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const c = await carteModel.getById(id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const normalized = {
      id: c.id,
      name: c.name,
      description: c.description,
      price: (Number(c.price_cents || 0) / 100),
      currency: c.currency || 'FCFA',
      allow_name: !!c.allow_name,
      allow_surname: !!c.allow_surname,
      allow_email: !!c.allow_email,
      allow_phone: !!c.allow_phone,
      allow_job: !!c.allow_job,
      allow_website: !!c.allow_website,
      allow_logo: !!c.allow_logo,
      allow_design_custom: !!c.allow_design_custom,
      metadata: c.metadata ? JSON.parse(c.metadata) : null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
    return res.json({ card: normalized });
  } catch (err) {
    console.error('getCard error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Admin operations (protected)
async function createCard(req, res) {
  try {
    const payload = req.body;
    // expect price in major unit (e.g., 15000), store in cents
    const toInsert = {
      name: payload.name,
      description: payload.description || null,
      price_cents: Math.round((Number(payload.price || payload.price_cents || 0)) * 100),
      currency: payload.currency || 'FCFA',
      allow_name: payload.allow_name !== undefined ? !!payload.allow_name : true,
      allow_surname: payload.allow_surname !== undefined ? !!payload.allow_surname : true,
      allow_email: payload.allow_email !== undefined ? !!payload.allow_email : true,
      allow_phone: payload.allow_phone !== undefined ? !!payload.allow_phone : true,
      allow_job: payload.allow_job !== undefined ? !!payload.allow_job : true,
      allow_website: payload.allow_website !== undefined ? !!payload.allow_website : true,
      allow_logo: payload.allow_logo !== undefined ? !!payload.allow_logo : false,
      allow_design_custom: payload.allow_design_custom !== undefined ? !!payload.allow_design_custom : false,
      metadata: payload.metadata || null,
      is_active: payload.is_active !== undefined ? !!payload.is_active : true,
    };
    const created = await carteModel.createCard(toInsert);
    return res.status(201).json({ card: created });
  } catch (err) {
    console.error('createCard error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateCard(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const patch = req.body;
    if (patch.price) patch.price_cents = Math.round(Number(patch.price) * 100);
    const updated = await carteModel.updateCard(id, patch);
    return res.json({ card: updated });
  } catch (err) {
    console.error('updateCard error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteCard(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    await carteModel.deleteCard(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteCard error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listPublicCards, getCard, createCard, updateCard, deleteCard };
