const portfolioModel = require('../models/portfolioModel');
const visiteModel = require('../models/visiteModel');
const projectModel = require('../models/projectModel');
const competenceModel = require('../models/competenceModel');
const experienceModel = require('../models/experienceModel');
const { pool } = require('../db');
const planModel = require('../models/planModel');

async function create(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const userId = req.userId;
    if (!userId) {
      await conn.rollback();
      conn.release();
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user plan to enforce restrictions (free plan constraints)
    const userPlans = await planModel.listUserPlans(userId);
    const latestPlan = (userPlans && userPlans.length > 0) ? userPlans[0] : null;
    const isFreePlan = latestPlan && (Number(latestPlan.price_cents || 0) === 0 || (latestPlan.slug && latestPlan.slug.toLowerCase() === 'gratuit'));

    // If free plan, ensure user doesn't already have a portfolio
    if (isFreePlan) {
      const existing = await portfolioModel.findByUser(userId);
      if (existing && existing.length > 0) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Plan gratuit: vous ne pouvez créer qu\'un seul portfolio' });
      }
    }

    const incoming = { ...req.body };
    // Map frontend fields to French DB columns (SEULEMENT les champs du schéma)
    const mapped = {
      utilisateur_id: userId,
      titre: incoming.title || incoming.titre || null,
      description: incoming.bio || incoming.description || null,
      theme: incoming.theme_color || incoming.theme || null,
      url_slug: incoming.slug || incoming.url_slug || `u-${Date.now()}`,
      est_public: incoming.is_public !== undefined ? incoming.is_public : (incoming.est_public !== undefined ? incoming.est_public : true),
      // Presentation fields (optional)
      banner_type: incoming.banner_type || incoming.bannerType || null,
      banner_image_url: incoming.banner_image_url || incoming.banner || incoming.bannerImageUrl || null,
      banner_color: incoming.banner_color || incoming.bannerColor || null,
      profile_image_url: incoming.profile_image_url || incoming.profile_image || incoming.profileImageUrl || null,
      cv_url: incoming.cv_url || incoming.resume_url || incoming.cv || null,
      // contact fields
      location: incoming.location || null,
      phone: incoming.phone || null,
      // contact/social columns (store duplicates in table for easier editing)
      website: incoming.website || null,
      linkedin_url: incoming.linkedin_url || null,
      github_url: incoming.github_url || null,
      twitter_url: incoming.twitter_url || null,
    };
    const keys = Object.keys(mapped).filter(k => mapped[k] !== undefined && mapped[k] !== null).join(', ');
    const placeholders = Object.keys(mapped).filter(k => mapped[k] !== undefined && mapped[k] !== null).map(() => '?').join(', ');
    const values = Object.keys(mapped).filter(k => mapped[k] !== undefined && mapped[k] !== null).map(k => mapped[k]);
    const [pResult] = await conn.query(`INSERT INTO portfolios (${keys}) VALUES (${placeholders})`, values);
    const portfolioId = pResult.insertId;

    // Persist related records if provided using the same connection (map to French columns)
    // For free plans we disallow adding related items on creation
    if (!isFreePlan && Array.isArray(req.body.projects) && req.body.projects.length > 0) {
      for (const p of req.body.projects) {
        const projMapped = {
          portfolio_id: portfolioId,
          titre: p.title || p.titre || null,
          description: p.description || null,
          image: p.image || null,
          lien_demo: p.demo_url || p.lien_demo || null,
          lien_code: p.code_url || p.lien_code || null,
          date_debut: p.date_debut || null,
          date_fin: p.date_fin || null,
        };
        const k = Object.keys(projMapped).filter(kk => projMapped[kk] !== undefined && projMapped[kk] !== null).join(', ');
        const ph = Object.keys(projMapped).filter(kk => projMapped[kk] !== undefined && projMapped[kk] !== null).map(() => '?').join(', ');
        const vals = Object.keys(projMapped).filter(kk => projMapped[kk] !== undefined && projMapped[kk] !== null).map(kk => projMapped[kk]);
        await conn.query(`INSERT INTO projets (${k}) VALUES (${ph})`, vals);
      }
    }
    if (!isFreePlan && Array.isArray(req.body.competences) && req.body.competences.length > 0) {
      for (const c of req.body.competences) {
        const compMapped = {
          portfolio_id: portfolioId,
          nom: c.name || c.nom || null,
          niveau: c.level || c.niveau || null,
          categorie: c.category || c.categorie || null,
        };
        const k = Object.keys(compMapped).filter(kk => compMapped[kk] !== undefined && compMapped[kk] !== null).join(', ');
        const ph = Object.keys(compMapped).filter(kk => compMapped[kk] !== undefined && compMapped[kk] !== null).map(() => '?').join(', ');
        const vals = Object.keys(compMapped).filter(kk => compMapped[kk] !== undefined && compMapped[kk] !== null).map(kk => compMapped[kk]);
        await conn.query(`INSERT INTO competences (${k}) VALUES (${ph})`, vals);
      }
    }
    if (!isFreePlan && Array.isArray(req.body.experiences) && req.body.experiences.length > 0) {
      for (const e of req.body.experiences) {
        const expMapped = {
          portfolio_id: portfolioId,
          titre_poste: e.title || e.titre_poste || e.titre || null,
          entreprise: e.company || e.entreprise || null,
          description: e.description || null,
          date_debut: e.date_debut || null,
          date_fin: e.date_fin || null,
        };
        const k = Object.keys(expMapped).filter(kk => expMapped[kk] !== undefined && expMapped[kk] !== null).join(', ');
        const ph = Object.keys(expMapped).filter(kk => expMapped[kk] !== undefined && expMapped[kk] !== null).map(() => '?').join(', ');
        const vals = Object.keys(expMapped).filter(kk => expMapped[kk] !== undefined && expMapped[kk] !== null).map(kk => expMapped[kk]);
        await conn.query(`INSERT INTO experiences (${k}) VALUES (${ph})`, vals);
      }
    }

      const socialPlatforms = [
      { key: 'website', plateforme: 'website' },
      { key: 'linkedin_url', plateforme: 'linkedin' },
      { key: 'github_url', plateforme: 'github' },
      { key: 'twitter_url', plateforme: 'twitter' },
    ];
    for (const plat of socialPlatforms) {
      const url = incoming[plat.key];
      if (url) {
        await conn.query(
          'INSERT INTO liens_sociaux (portfolio_id, plateforme, url) VALUES (?, ?, ?)',
          [portfolioId, plat.plateforme, url]
        );
        console.log(`Inserted social link: ${plat.plateforme} = ${url}`);  // Log debug
      }
    }

    await conn.commit();
    conn.release();
    const created = await portfolioModel.findById(portfolioId);
    return res.status(201).json({ portfolio: created });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Error creating portfolio (transaction):', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });  // Ajout du message d'erreur pour debug
  }
}

async function update(req, res) {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    const existing = await portfolioModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const ownerId = existing.utilisateur_id !== undefined ? existing.utilisateur_id : existing.user_id;
    if (String(ownerId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

    // Start transaction for update + related replacements
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

  // update portfolio fields (include presentation optional fields)
      const incoming = { ...req.body };
      const mappedUpdate = {};
      if (incoming.title !== undefined || incoming.titre !== undefined) mappedUpdate.titre = incoming.title || incoming.titre;
      if (incoming.bio !== undefined || incoming.description !== undefined) mappedUpdate.description = incoming.bio || incoming.description;
      if (incoming.theme_color !== undefined || incoming.theme !== undefined) mappedUpdate.theme = incoming.theme_color || incoming.theme;
      if (incoming.slug !== undefined || incoming.url_slug !== undefined) mappedUpdate.url_slug = incoming.slug || incoming.url_slug;
      if (incoming.is_public !== undefined || incoming.est_public !== undefined) mappedUpdate.est_public = incoming.is_public || incoming.est_public;
  // optional presentation fields
  if (incoming.banner_type !== undefined) mappedUpdate.banner_type = incoming.banner_type;
  if (incoming.banner_image_url !== undefined || incoming.banner !== undefined) mappedUpdate.banner_image_url = incoming.banner_image_url || incoming.banner;
  if (incoming.banner_color !== undefined) mappedUpdate.banner_color = incoming.banner_color;
  if (incoming.profile_image_url !== undefined || incoming.profile_image !== undefined) mappedUpdate.profile_image_url = incoming.profile_image_url || incoming.profile_image;
  if (incoming.cv_url !== undefined || incoming.resume_url !== undefined) mappedUpdate.cv_url = incoming.cv_url || incoming.resume_url || incoming.cv;
  // contact/social fields
  if (incoming.location !== undefined) mappedUpdate.location = incoming.location;
  if (incoming.phone !== undefined) mappedUpdate.phone = incoming.phone;
  if (incoming.website !== undefined) mappedUpdate.website = incoming.website;
  if (incoming.linkedin_url !== undefined) mappedUpdate.linkedin_url = incoming.linkedin_url;
  if (incoming.github_url !== undefined) mappedUpdate.github_url = incoming.github_url;
  if (incoming.twitter_url !== undefined) mappedUpdate.twitter_url = incoming.twitter_url;

      if (Object.keys(mappedUpdate).length > 0) {
        const sets = Object.keys(mappedUpdate).map(k => `${k} = ?`).join(', ');
        const vals = [...Object.values(mappedUpdate), id];
        await conn.query(`UPDATE portfolios SET ${sets} WHERE id = ?`, vals);
      }

      // Replace related records (inchangé)
      if (Array.isArray(req.body.projects)) {
        await conn.query('DELETE FROM projets WHERE portfolio_id = ?', [id]);
        for (const p of req.body.projects) {
          const projMapped = {
            portfolio_id: id,
            titre: p.title || p.titre || null,
            description: p.description || null,
            image: p.image || null,
            lien_demo: p.demo_url || p.lien_demo || null,
            lien_code: p.code_url || p.lien_code || null,
            date_debut: p.date_debut || null,
            date_fin: p.date_fin || null,
          };
          const k = Object.keys(projMapped).filter(kk => projMapped[kk] !== undefined && projMapped[kk] !== null).join(', ');
          const ph = Object.keys(projMapped).filter(kk => projMapped[kk] !== undefined && projMapped[kk] !== null).map(() => '?').join(', ');
          const vals = Object.keys(projMapped).filter(kk => projMapped[kk] !== undefined && projMapped[kk] !== null).map(kk => projMapped[kk]);
          await conn.query(`INSERT INTO projets (${k}) VALUES (${ph})`, vals);
        }
      }
      if (Array.isArray(req.body.competences)) {
        await conn.query('DELETE FROM competences WHERE portfolio_id = ?', [id]);
        for (const c of req.body.competences) {
          const compMapped = {
            portfolio_id: id,
            nom: c.name || c.nom || null,
            niveau: c.level || c.niveau || null,
            categorie: c.category || c.categorie || null,
          };
          const k = Object.keys(compMapped).filter(kk => compMapped[kk] !== undefined && compMapped[kk] !== null).join(', ');
          const ph = Object.keys(compMapped).filter(kk => compMapped[kk] !== undefined && compMapped[kk] !== null).map(() => '?').join(', ');
          const vals = Object.keys(compMapped).filter(kk => compMapped[kk] !== undefined && compMapped[kk] !== null).map(kk => compMapped[kk]);
          await conn.query(`INSERT INTO competences (${k}) VALUES (${ph})`, vals);
        }
      }
      if (Array.isArray(req.body.experiences)) {
        await conn.query('DELETE FROM experiences WHERE portfolio_id = ?', [id]);
        for (const e of req.body.experiences) {
          const expMapped = {
            portfolio_id: id,
            titre_poste: e.title || e.titre_poste || e.titre || null,
            entreprise: e.company || e.entreprise || null,
            description: e.description || null,
            date_debut: e.date_debut || null,
            date_fin: e.date_fin || null,
          };
          const k = Object.keys(expMapped).filter(kk => expMapped[kk] !== undefined && expMapped[kk] !== null).join(', ');
          const ph = Object.keys(expMapped).filter(kk => expMapped[kk] !== undefined && expMapped[kk] !== null).map(() => '?').join(', ');
          const vals = Object.keys(expMapped).filter(kk => expMapped[kk] !== undefined && expMapped[kk] !== null).map(kk => expMapped[kk]);
          await conn.query(`INSERT INTO experiences (${k}) VALUES (${ph})`, vals);
        }
      }

      await conn.query('DELETE FROM liens_sociaux WHERE portfolio_id = ?', [id]);
  const socialPlatforms = [
    { key: 'website', plateforme: 'website' },
    { key: 'linkedin_url', plateforme: 'linkedin' },
    { key: 'github_url', plateforme: 'github' },
    { key: 'twitter_url', plateforme: 'twitter' },
  ];
  for (const plat of socialPlatforms) {
    const url = incoming[plat.key];
    if (url) {
      await conn.query(
        'INSERT INTO liens_sociaux (portfolio_id, plateforme, url) VALUES (?, ?, ?)',
        [id, plat.plateforme, url]
      );
      console.log(`Updated social link: ${plat.plateforme} = ${url}`);  // Log debug
    }
  }

      await conn.commit();
      conn.release();
      const updated = await portfolioModel.findById(id);
      return res.json({ portfolio: updated });
    } catch (err) {
      await conn.rollback();
      conn.release();
      console.error('Error updating portfolio (transaction):', err);
      return res.status(500).json({ error: 'Server error: ' + err.message });  // Ajout pour debug
    }
  } catch (err) {
    console.error('Error updating portfolio:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}

async function listByUser(req, res) {
  try {
    const userId = req.userId;
    const rows = await portfolioModel.findByUser(userId);
    return res.json({ portfolios: rows });
  } catch (err) {
    console.error('Error listing portfolios:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getPublicBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const portfolio = await portfolioModel.findBySlug(slug);
    if (!portfolio) return res.status(404).json({ error: 'Not found' });

    return res.json({ portfolio });
  } catch (err) {
    console.error('Error fetching portfolio by slug:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function recordVisit(req, res) {
  try {
    const { portfolio_id, adresse_ip, user_agent, referer, pays } = req.body;
    if (!portfolio_id) {
      return res.status(400).json({ error: 'portfolio_id is required' });
    }
    const row = await visiteModel.create({ portfolio_id, adresse_ip, user_agent, referer, pays });
    return res.json({ ok: true, visit: row });
  } catch (err) {
    console.error('Error recording visit:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function recordVisitBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const portfolio = await portfolioModel.findBySlug(slug);
    if (!portfolio) return res.status(404).json({ error: 'Not found' });
    const { adresse_ip, user_agent, referer, pays } = req.body;
    const row = await visiteModel.create({ portfolio_id: portfolio.id, adresse_ip, user_agent, referer, pays });
    return res.json({ ok: true, visit: row });
  } catch (err) {
    console.error('Error recording visit by slug:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getById(req, res) {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    const existing = await portfolioModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const ownerId = existing.utilisateur_id;
    if (String(ownerId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

    // Charge avec relations
    const portfolio = await portfolioModel.findByIdWithRelations(id);
    return res.json({ portfolio });
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}

module.exports = { create, update, listByUser, getPublicBySlug, recordVisit, recordVisitBySlug, getById };

