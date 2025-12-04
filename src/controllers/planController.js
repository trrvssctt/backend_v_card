const planModel = require('../models/planModel');
const userModel = require('../models/userModel');

async function listPlans(req, res) {
  try {
    const plans = await planModel.listPlans();
    res.json({ plans });
  } catch (err) {
    console.error('planController.listPlans', err);
    res.status(500).json({ error: 'Failed to list plans' });
  }
}

async function getPlan(req, res) {
  try {
    const { idOrSlug } = req.params;
    let plan = null;
    if (/^\d+$/.test(idOrSlug)) {
      plan = await planModel.getPlanById(Number(idOrSlug));
    } else {
      plan = await planModel.getPlanBySlug(idOrSlug);
    }
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const features = await planModel.listPlanFeatures(plan.id);
    res.json({ plan, features });
  } catch (err) {
    console.error('planController.getPlan', err);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
}

async function createPlan(req, res) {
  try {
    const payload = req.body;
    const result = await planModel.createPlan(payload);
    // optionally add features if provided
    if (payload.features && Array.isArray(payload.features)) {
      for (let i = 0; i < payload.features.length; i++) {
        const f = payload.features[i];
        await planModel.addFeature(result.id, f.feature || f, f.value || null, i);
      }
    }
    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error('planController.createPlan', err);
    res.status(500).json({ error: 'Failed to create plan' });
  }
}

async function subscribe(req, res) {
  try {
    const utilisateur_id = req.userId;
    if (!utilisateur_id) return res.status(401).json({ error: 'Unauthorized' });
    const { plan_id, start_date = null, end_date = null, payment_reference = null, metadata = null } = req.body;
    // ensure user exists
    const user = await userModel.findById(utilisateur_id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    // ensure plan exists (if provided)
    if (plan_id) {
      const plan = await planModel.getPlanById(plan_id);
      if (!plan) return res.status(404).json({ error: 'Plan introuvable' });
    }
    const sub = await planModel.subscribeUser({ utilisateur_id, plan_id, start_date, end_date, payment_reference, metadata });
    res.json({ ok: true, subscriptionId: sub.id });
  } catch (err) {
    console.error('planController.subscribe', err);
    res.status(500).json({ error: 'Failed to subscribe user' });
  }
}

async function getUserPlans(req, res) {
  try {
    const utilisateur_id = req.userId;
    if (!utilisateur_id) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await planModel.listUserPlans(utilisateur_id);
    return res.json({ plans: rows });
  } catch (err) {
    console.error('planController.getUserPlans', err);
    return res.status(500).json({ error: 'Failed to fetch user plans' });
  }
}

module.exports = { listPlans, getPlan, createPlan, subscribe, getUserPlans };
