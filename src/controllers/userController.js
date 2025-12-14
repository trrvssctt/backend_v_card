const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

async function register(req, res) {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const existing = await userModel.findByEmail(email);
  if (existing) return res.status(409).json({ error: 'User already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const user = await userModel.createUser({ email, password: hashed, name });
  return res.status(201).json({ user });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await userModel.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  // Block login for inactive users (paid accounts awaiting validation)
  if (typeof user.is_active !== 'undefined' && user.is_active === 0) {
    return res.status(403).json({ error: 'Account inactive. Payment is pending administrative validation.' });
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token });
}

async function me(req, res) {
  const userId = req.userId;
  const user = await userModel.findById(userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  return res.json({ user });
}

module.exports = { register, login, me };
