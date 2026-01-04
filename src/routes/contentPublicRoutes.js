const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');

// Public articles
router.get('/articles', async (req, res) => contentController.publicListArticles(req, res));
router.get('/articles/:slug', async (req, res) => contentController.publicGetArticleBySlug(req, res));

// Public pages (used by admin editor to fetch existing page content)
router.get('/public/pages/:slug', async (req, res) => contentController.publicGetPage(req, res));

module.exports = router;
