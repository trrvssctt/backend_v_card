const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const adminUserModel = require('../models/adminUserModel');
const planModel = require('../models/planModel');
const sendEmail = require('../utils/sendEmail');
const commandeModel = require('../models/commandeModel');
const paiementModel = require('../models/paiementModel');
const checkoutModel = require('../models/checkoutModel');
const abonnementModel = require('../models/abonnementModel');
const refreshTokenModel = require('../models/refreshTokenModel');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30);

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
      try {
        await planModel.subscribeUser({ utilisateur_id: user.id, plan_id: plan.id, status: 'active' });
        // ensure user is active
        await userModel.setActive(user.id, true);
      } catch (e) { console.warn('subscribeUser failed at registration:', e.message || e); }
    } else if (plan && Number(plan.price_cents || 0) > 0) {
      // Paid plan: create an abonnement record (do NOT create a commande here)
      try {
        const montant = Number(plan.price_cents || 0) / 100;
        const paymentToken = require('crypto').randomBytes(16).toString('hex');
        const metadata = { purpose: 'signup', payment_token: paymentToken };
        const ab = await abonnementModel.createAbonnement({ utilisateur_id: user.id, plan_id: plan.id, montant: montant, currency: 'XOF', statut: 'pending', metadata });
        // mark user inactive until payment validated
        try { await userModel.setActive(user.id, false); } catch (e) { console.warn('Could not set user inactive:', e.message || e); }
        return res.status(201).json({ id: user.id, email: user.email, message: 'Compte créé. Abonnement créé en attente de paiement.', abonnement: { id: ab.id }, checkout: { token: paymentToken, checkout_url: `${process.env.FRONTEND_BASE || 'http://localhost:5173'}/checkout?token=${paymentToken}` } });
      } catch (e) {
        console.warn('Could not create abonnement at registration:', e.message || e);
        try { await userModel.setActive(user.id, false); } catch (ee) {}
        return res.status(201).json({ id: user.id, email: user.email, message: 'Compte créé. Abonnement en attente (erreur création).' });
      }
    }
  } catch (e) {
    console.warn('plan processing error at registration:', e.message || e);
  }

  const token = jwt.sign({ sub: user.id, role: 'USER', email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  // issue access + refresh tokens
  const accessToken = jwt.sign({ sub: user.id, role: 'USER', email: user.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await refreshTokenModel.createRefreshToken({ utilisateur_id: user.id, token: refreshToken, user_agent: req.headers['user-agent'] || null, ip: req.ip, expires_at: expiresAt });
  res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: (process.env.NODE_ENV === 'production'), sameSite: (process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')), maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000, path: '/' });
  return res.status(201).json({ id: user.id, email: user.email, accessToken, message: 'Compte créé.' });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email et password requis' });

  const user = await userModel.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = await bcrypt.compare(password, user.mot_de_passe);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  // If account is inactive (e.g., paid signup awaiting admin validation), block login
  if (typeof user.is_active !== 'undefined' && user.is_active === 0) {
    return res.status(403).json({ error: 'Compte inactif. Le paiement est en attente de validation administrative.' });
  }

  await userModel.setLastLogin(user.id);

  const accessToken = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await refreshTokenModel.createRefreshToken({ utilisateur_id: user.id, token: refreshToken, user_agent: req.headers['user-agent'] || null, ip: req.ip, expires_at: expiresAt });
  res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: (process.env.NODE_ENV === 'production'), sameSite: (process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')), maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000, path: '/' });
  return res.json({ accessToken });
}

async function verify(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token manquant' });

  const user = await userModel.findByVerificationToken(token);
  if (!user) return res.status(400).json({ error: 'token invalide' });

  await userModel.verifyUser(user.id);
  return res.json({ ok: true, message: 'Email vérifié' });
}

async function refresh(req, res) {
  const token = req.cookies && req.cookies.refresh_token;
  if (!token) return res.status(401).json({ error: 'Refresh token missing' });
  try {
    const dbToken = await refreshTokenModel.findByToken(token);
    if (!dbToken || dbToken.revoked) return res.status(401).json({ error: 'Invalid refresh token' });
    if (dbToken.expires_at && new Date(dbToken.expires_at) < new Date()) {
      await refreshTokenModel.revokeById(dbToken.id);
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    // issue new access token and rotate refresh token
    const user = await userModel.findById(dbToken.utilisateur_id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const accessToken = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
    // rotate refresh
    await refreshTokenModel.revokeById(dbToken.id);
    const newRefresh = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    await refreshTokenModel.createRefreshToken({ utilisateur_id: user.id, token: newRefresh, user_agent: req.headers['user-agent'] || null, ip: req.ip, expires_at: expiresAt });
    res.cookie('refresh_token', newRefresh, { httpOnly: true, secure: (process.env.NODE_ENV === 'production'), sameSite: (process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax')), maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000, path: '/' });
    return res.json({ accessToken });
  } catch (e) {
    console.warn('refresh error', e && e.message);
    return res.status(401).json({ error: 'Could not refresh token' });
  }
}

async function logout(req, res) {
  const token = req.cookies && req.cookies.refresh_token;
  if (token) {
    try { await refreshTokenModel.revokeByToken(token); } catch (e) { console.warn('logout revoke failed', e && e.message); }
  }
  res.clearCookie('refresh_token', { path: '/' });
  return res.json({ ok: true });
}

module.exports = { register, login, verify, refresh, logout };

// Dedicated admin login that authenticates against admin_users table
async function adminLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email et password requis' });
  try {
    const adminUserModel = require('../models/adminUserModel');
    const admin = await adminUserModel.findByEmail(email);
    if (!admin) return res.status(401).json({ error: 'Identifiants invalides' });
    // block login if admin account is inactive
    if (typeof admin.is_active !== 'undefined' && admin.is_active === 0) {
      return res.status(403).json({ error: 'Compte administrateur inactif. Contactez le super-admin.' });
    }
    const okAdmin = await bcrypt.compare(password, admin.password_hash);
    if (!okAdmin) return res.status(401).json({ error: 'Identifiants invalides' });
    let roleName = await adminUserModel.getRoleNameByAdminId(admin.id);
    roleName = roleName || 'ADMIN';
    await userModel.setLastLogin && typeof userModel.setLastLogin === 'function' && userModel.setLastLogin(admin.id).catch(()=>{});
    const accessToken = jwt.sign({ sub: admin.id, role: roleName, email: admin.email, token_type: 'admin' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    await refreshTokenModel.createRefreshToken({ utilisateur_id: admin.id, token: refreshToken, user_agent: req.headers['user-agent'] || null, ip: req.ip, expires_at: expiresAt });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: (process.env.NODE_ENV === 'production'), sameSite: 'lax', maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000, path: '/' });
    return res.json({ accessToken });
  } catch (e) {
    console.warn('admin login error', e && e.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports.adminLogin = adminLogin;

async function adminMe(req, res) {
  try {
    // authMiddleware ensures token valid and req.userId set
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const adminUserModel = require('../models/adminUserModel');
    const admin = await adminUserModel.findById(userId);
    if (!admin) return res.status(404).json({ error: 'Not found' });
    // include role name
    const roleName = await adminUserModel.getRoleNameByAdminId(admin.id).catch(() => null);
    return res.json({ admin: { id: admin.id, email: admin.email, name: admin.full_name || admin.name || null, role: roleName, is_active: admin.is_active } });
  } catch (e) {
    console.warn('adminMe error', e && e.message);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports.adminMe = adminMe;
