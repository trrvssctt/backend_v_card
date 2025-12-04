const planModel = require('../models/planModel');
const commandeModel = require('../models/commandeModel');
const paiementModel = require('../models/paiementModel');
const checkoutModel = require('../models/checkoutModel');

function genOrderNumber() {
  return 'CHK-' + Date.now() + '-' + Math.random().toString(36).substr(2,6).toUpperCase();
}

async function createCheckout(req, res) {
  try {
    const userId = req.userId;
    const { plan_id } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!plan_id) return res.status(400).json({ error: 'plan_id required' });

    const plan = await planModel.getPlanById(plan_id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const numero = genOrderNumber();
    const montant = Number(plan.price_cents || 0) / 100; // montant en unités monétaires
    // create a commande to track this purchase
    const commande = await commandeModel.createCommande({ utilisateur_id: userId, numero_commande: numero, montant_total: montant });

    // create a paiement row with pending status
    const paiement = await paiementModel.createPaiement({ commande_id: commande.id, montant: montant, statut: 'pending', metadata: { plan_id, purpose: 'upgrade' } });

    // create checkout token
    const checkout = await checkoutModel.createCheckout({ utilisateur_id: userId, plan_id, commande_id: commande.id, paiement_id: paiement.id, metadata: { plan } });

    return res.status(201).json({ checkout: { id: checkout.id, token: checkout.token }, checkout_url: `${process.env.FRONTEND_BASE || 'http://localhost:8080'}/checkout?token=${checkout.token}` });
  } catch (err) {
    console.error('createCheckout error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getCheckout(req, res) {
  try {
    const token = req.params.token;
    if (!token) return res.status(400).json({ error: 'token required' });
    const checkout = await checkoutModel.findByToken(token);
    if (!checkout) return res.status(404).json({ error: 'Not found' });

    // fetch related data
    const plan = await planModel.getPlanById(checkout.plan_id);
    const paiement = await paiementModel.findById(checkout.paiement_id);
    return res.json({ checkout, plan, paiement });
  } catch (err) {
    console.error('getCheckout error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Confirm payment for checkout: mark paiement confirmed and subscribe user to plan
async function confirmCheckout(req, res) {
  try {
    const token = req.params.token;
    const { reference_transaction } = req.body;
    const checkout = await checkoutModel.findByToken(token);
    if (!checkout) return res.status(404).json({ error: 'Not found' });

    // Only the same user can confirm (for now); in real setup, this should be done via provider webhook
    if (req.userId && Number(req.userId) !== Number(checkout.utilisateur_id)) return res.status(403).json({ error: 'Forbidden' });

    // mark paiement as paid
    await paiementModel.updateStatus(checkout.paiement_id, 'confirmed');
    // update checkout status
    await checkoutModel.updateStatus(checkout.id, 'confirmed');

    // Subscribe user to plan
    await planModel.subscribeUser({ utilisateur_id: checkout.utilisateur_id, plan_id: checkout.plan_id, status: 'active', payment_reference: reference_transaction || null });

    // update commande status
    await commandeModel.updateStatus(checkout.commande_id, 'En_traitement');

    return res.json({ ok: true });
  } catch (err) {
    console.error('confirmCheckout error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createCheckout, getCheckout, confirmCheckout };
