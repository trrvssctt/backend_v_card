const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const planModel = require('../models/planModel');
const sendEmail = require('../utils/sendEmail');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

async function register(req, res) {
  const { nom, prenom, email, password, photo_profil, biographie, plan_id, plan_slug } = req.body;
  if (!email || !password || !nom || !prenom) return res.status(400).json({ error: 'nom, prenom, email et password requis' });

  const existing = await userModel.findByEmail(email);
  if (existing) return res.status(409).json({ error: 'Utilisateur déjà existant' });

  const hash = await bcrypt.hash(password, 12);
  const user = await userModel.createUser({ nom, prenom, email, mot_de_passe: hash, photo_profil, biographie });

  // Previously we sent verification emails and required email verification.
  // That concept has been removed: users are created verified and can log in immediately.
  try {
    // If a free plan was provided, attempt to subscribe the user to it (best-effort)
    let plan = null;
    if (plan_id) plan = await planModel.getPlanById(plan_id);
    else if (plan_slug) plan = await planModel.getPlanBySlug(plan_slug);
    else {
      try {
        const allPlans = await planModel.listPlans();
        plan = (allPlans || []).find((p) => Number(p.price_cents || 0) === 0);
      } catch (e) {}
    }
    if (plan && Number(plan.price_cents || 0) === 0) {
      try { await planModel.subscribeUser({ utilisateur_id: user.id, plan_id: plan.id, status: 'active' }); } catch (e) { console.warn('subscribeUser failed at registration:', e.message || e); }
    }
  } catch (e) {
    console.warn('plan processing error at registration:', e.message || e);
  }

  const token = jwt.sign({ sub: user.id, role: 'USER', email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return res.status(201).json({ id: user.id, email: user.email, token, message: 'Compte créé.' });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email et password requis' });

  const user = await userModel.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = await bcrypt.compare(password, user.mot_de_passe);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  // Note: email verification removed — allow login regardless of verified flag

  await userModel.setLastLogin(user.id);

  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token });
}

async function verify(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token manquant' });

  const user = await userModel.findByVerificationToken(token);
  if (!user) return res.status(400).json({ error: 'token invalide' });

  await userModel.verifyUser(user.id);
  return res.json({ ok: true, message: 'Email vérifié' });
}

module.exports = { register, login, verify };
