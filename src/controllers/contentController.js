const articleModel = require('../models/articleModel');
const pageModel = require('../models/pageModel');
const historyModel = require('../models/contentHistoryModel');

// Admin: CRUD articles
async function adminListArticles(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const q = req.query.q || null;
    const status = req.query.status || null;
    const data = await articleModel.listArticles({ page, limit, q, status });
    return res.json(data);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function adminCreateArticle(req, res) {
  try {
    const payload = req.body || {};
    const created = await articleModel.createArticle(payload);
    await historyModel.record({ content_type: 'article', content_id: created.id, changes: { created: payload }, editor_id: req.userId || null });
    return res.status(201).json({ article: created });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function adminGetArticle(req, res) {
  try {
    const id = Number(req.params.id);
    const a = await articleModel.findById(id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    const history = await historyModel.listFor('article', id);
    return res.json({ article: a, history });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function adminUpdateArticle(req, res) {
  try {
    const id = Number(req.params.id);
    const patch = req.body || {};
    const updated = await articleModel.updateArticle(id, patch);
    await historyModel.record({ content_type: 'article', content_id: id, changes: patch, editor_id: req.userId || null });
    return res.json({ article: updated });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function adminDeleteArticle(req, res) {
  try {
    const id = Number(req.params.id);
    await articleModel.deleteArticle(id);
    await historyModel.record({ content_type: 'article', content_id: id, changes: { deleted: true }, editor_id: req.userId || null });
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

// Public: list published articles and get by slug
async function publicListArticles(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const q = req.query.q || null;
    const data = await articleModel.listArticles({ page, limit, q, status: 'published' });
    return res.json(data);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function publicGetArticleBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const a = await articleModel.findBySlug(slug);
    if (!a || a.status !== 'published') return res.status(404).json({ error: 'Not found' });
    return res.json({ article: a });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

// Admin: manage legal pages
async function adminListPages(req, res) {
  try {
    const pages = await pageModel.listPages();
    return res.json({ pages });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function adminUpsertPage(req, res) {
  try {
    const slug = req.params.slug;
    const payload = req.body || {};
    const page = await pageModel.upsertPage({ slug, title: payload.title, content: payload.content, meta_title: payload.meta_title, meta_description: payload.meta_description });
    await historyModel.record({ content_type: 'page', content_id: page.id, changes: payload, editor_id: req.userId || null });
    return res.json({ page });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

async function publicGetPage(req, res) {
  try {
    const slug = req.params.slug;
    const p = await pageModel.findBySlug(slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json({ page: p });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}

module.exports = {
  adminListArticles, adminCreateArticle, adminGetArticle, adminUpdateArticle, adminDeleteArticle,
  publicListArticles, publicGetArticleBySlug,
  adminListPages, adminUpsertPage, publicGetPage
};
