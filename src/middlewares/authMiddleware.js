const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

module.exports = function (req, res, next) {
  // Prefer Authorization header, but allow token via query param as a fallback
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid auth header' });
    token = parts[1];
  } else if (req.query && req.query.token) {
    // WARNING: passing token in query string can leak in logs; only use for SSE/dev or when HTTPS is used.
    token = String(req.query.token);
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
