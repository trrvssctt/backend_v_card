const abonnementModel = require('../models/abonnementModel');
const planModel = require('../models/planModel');
const userModel = require('../models/userModel');
const crypto = require('crypto');
const { pool } = require('../db');

// Public: return checkout info for an abonnement payment token
async function getCheckoutInfo(req, res) {
  try {
    const token = req.params.token;
    if (!token) return res.status(400).json({ error: 'token required' });
    const ab = await abonnementModel.findByPaymentToken(token);
    if (!ab) {
      console.warn('abonnement checkout token not found:', token);
      return res.status(404).json({ error: 'Token non trouvé ou expiré' });
    }
    let plan = null;
    try { if (ab.plan_id) plan = await planModel.getPlanById(ab.plan_id); } catch (e) { console.warn('Could not fetch plan for abonnement', e && e.message); }
    const paiement = { montant: ab.montant, reference: ab.payment_reference || null };
    return res.json({ abonnement: ab, plan, paiement, expires_at: null });
  } catch (err) {
    console.error('abonnement.getCheckoutInfo error:', err && (err.stack || err.message || err));
    // return diagnostic in dev or concise message in prod
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({ error: 'Server error', details: err && (err.stack || err.message) });
    }
    return res.status(500).json({ error: 'Server error retrieving abonnement' });
  }
}

// Public: confirm payment for abonnement token
async function confirmCheckout(req, res) {
  try {
    const token = req.params.token;
    if (!token) return res.status(400).json({ error: 'token required' });
    const payload = req.body || {};
    const ab = await abonnementModel.findByPaymentToken(token);
    if (!ab) return res.status(404).json({ error: 'Not found' });
    const paymentRef = payload.reference_transaction || payload.payment_reference || `REF-${Date.now()}`;
    // set end_date to 1 year from now by default
    const now = new Date();
    const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const updated = await abonnementModel.updatePaymentDetails(ab.id, { payment_reference: paymentRef, end_date: oneYear, statut: 'active' });
    // activate user account
    try { await userModel.setActive(ab.utilisateur_id, true); } catch (e) { console.warn('Could not activate user after payment', e && e.message); }
    return res.json({ abonnement: updated });
  } catch (err) {
    console.error('abonnement.confirmCheckout error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function createAbonnement(req, res) {
  try {
    const utilisateur_id = req.userId;
    if (!utilisateur_id) return res.status(401).json({ error: 'Unauthorized' });
    const { plan_id = null, montant = 0, currency = 'XOF', payment_reference = null, metadata = null } = req.body;
    // basic validation
    if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
    // verify plan exists
    const plan = await planModel.getPlanById(plan_id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const montantVal = Number(montant) || (Number(plan.price_cents || 0) / 100) || 0;
    const ab = await abonnementModel.createAbonnement({ utilisateur_id, plan_id, montant: montantVal, currency, statut: 'active', metadata });
    return res.json({ abonnement: ab });
  } catch (err) {
    console.error('abonnement.createAbonnement error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getUserAbonnements(req, res) {
  try {
    const utilisateur_id = req.userId;
    if (!utilisateur_id) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await abonnementModel.findByUser(utilisateur_id);
    return res.json({ abonnements: rows });
  } catch (err) {
    console.error('abonnement.getUserAbonnements error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getAbonnement(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const ab = await abonnementModel.findById(id);
    if (!ab) return res.status(404).json({ error: 'Not found' });
    return res.json({ abonnement: ab });
  } catch (err) {
    console.error('abonnement.getAbonnement error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Return payments for the authenticated user's abonnements and commandes
async function getUserPayments(req, res) {
  try {
    const utilisateur_id = req.userId;
    if (!utilisateur_id) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch paiements linked to user's commandes OR paiements whose reference matches an abonnement
    const [rows] = await pool.query(`
      SELECT p.*, c.numero_commande AS numero_commande, c.utilisateur_id AS utilisateur_id
      FROM paiements p
      LEFT JOIN commandes c ON c.id = p.commande_id
      WHERE (c.utilisateur_id = ?)
         OR (p.reference_transaction IN (SELECT payment_reference FROM abonnements WHERE utilisateur_id = ? AND payment_reference IS NOT NULL))
      ORDER BY p.created_at DESC
    `, [utilisateur_id, utilisateur_id]);

    // compute total CA for confirmed/paid paiements
    const [tot] = await pool.query(`
      SELECT COALESCE(SUM(p.montant),0) AS total_revenue
      FROM paiements p
      LEFT JOIN commandes c ON c.id = p.commande_id
      WHERE ((c.utilisateur_id = ?) OR (p.reference_transaction IN (SELECT payment_reference FROM abonnements WHERE utilisateur_id = ? AND payment_reference IS NOT NULL)))
        AND p.statut IN ('confirmed','paid')
    `, [utilisateur_id, utilisateur_id]);

    const totalRevenue = tot && tot[0] ? Number(tot[0].total_revenue) : 0;

    return res.json({ paiements: rows || [], totalRevenue });
  } catch (err) {
    console.error('abonnement.getUserPayments error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function cancelAbonnement(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const updated = await abonnementModel.cancelAbonnement(id);
    return res.json({ abonnement: updated });
  } catch (err) {
    console.error('abonnement.cancelAbonnement error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createAbonnement, getUserAbonnements, getAbonnement, cancelAbonnement, getCheckoutInfo, confirmCheckout, getUserPayments };
