const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Public roles listing
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, description FROM roles ORDER BY id ASC');
    return res.json({ roles: rows || [] });
  } catch (err) {
    console.error('rolesRoutes GET / error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
