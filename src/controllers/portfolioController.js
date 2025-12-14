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
    const userPlans = await planModel.listUserPlans(userId);
    const latestPlan = userPlans && userPlans.length ? userPlans[0] : null;
    const planSlug = latestPlan && latestPlan.slug ? String(latestPlan.slug).trim().toLowerCase() : 'gratuit';
    const isFreePlan = planSlug === 'gratuit' || planSlug === 'free' || (latestPlan && Number(latestPlan.price_cents || 0) === 0);
    const isStarterPlan = ['starter', 'standard'].includes(planSlug);
    const isProPlan = ['professionnel', 'pro', 'professional'].includes(planSlug);
    const isPremiumPlan = ['premium', 'premium_pro', 'premium-plus'].includes(planSlug);
    console.log(`User ${userId} creating portfolio with plan slug='${planSlug}' (isProPlan=${isProPlan})`);
    const isBusinessPlan = ['business'].includes(planSlug);

    // If free plan, ensure user doesn't already have a portfolio (limit 1)
    // Business plan has no limits
    if (isFreePlan && !isBusinessPlan) {
      const existing = await portfolioModel.findByUser(userId);
      if (existing && existing.length > 0) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: "Plan gratuit: vous ne pouvez créer qu'un seul portfolio" });
      }
    }

    // If starter plan, enforce limit of 5 portfolios
    if (isStarterPlan && !isBusinessPlan) {
      const existing = await portfolioModel.findByUser(userId);
      const count = existing ? existing.length : 0;
      if (count >= 5) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Plan Starter: limite atteinte (5 portfolios maximum)' });
      }
    }

    // If professional plan, enforce limit of 20 portfolios
    if (isProPlan && !isBusinessPlan) {
      const existing = await portfolioModel.findByUser(userId);
      const count = existing ? existing.length : 0;
      if (count >= 20) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Plan Professionnel: limite atteinte (20 portfolios maximum)' });
      }
    }

    const incoming = { ...req.body };
    // Enforce social links limit: free=1, starter=3, others unlimited
    const socialKeys = ['website', 'linkedin_url', 'github_url', 'twitter_url', 'facebook_url', 'instagram_url'];
    const providedSocials = socialKeys.reduce((acc, k) => acc + (incoming[k] ? 1 : 0), 0);
    // Free=1, Starter=3, Premium+Business=5, Pro/default=Infinity
    let socialLimit = Infinity;
    if (isFreePlan) socialLimit = 1;
    else if (isStarterPlan) socialLimit = 3;
    else if (isPremiumPlan || isBusinessPlan) socialLimit = 5;
    if (providedSocials > socialLimit) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ error: `Limite formulé ${isFreePlan ? 'gratuite' : 'Starter'} : vous ne pouvez ajouter que ${socialLimit} lien(s) de réseaux sociaux.` });
    }
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
      facebook_url: incoming.facebook_url || null,
      instagram_url: incoming.instagram_url || null,
    };
    const keys = Object.keys(mapped).filter(k => mapped[k] !== undefined && mapped[k] !== null).join(', ');
    const placeholders = Object.keys(mapped).filter(k => mapped[k] !== undefined && mapped[k] !== null).map(() => '?').join(', ');
    const values = Object.keys(mapped).filter(k => mapped[k] !== undefined && mapped[k] !== null).map(k => mapped[k]);
    const [pResult] = await conn.query(`INSERT INTO portfolios (${keys}) VALUES (${placeholders})`, values);
    const portfolioId = pResult.insertId;

    // Persist related records if provided using the same connection (map to French columns)
    // For free plans we disallow adding related items on creation
    if (!isFreePlan && Array.isArray(req.body.projects) && req.body.projects.length > 0) {
      // Limit projects: Starter=3, Pro=10, others unlimited
      const projectLimit = isStarterPlan ? 3 : (isProPlan ? 10 : Infinity);
      if (req.body.projects.length > projectLimit) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: `Plan ${isStarterPlan ? 'Starter' : (isProPlan ? 'Professionnel' : 'Avancé')} : maximum ${projectLimit} projets par portfolio.` });
      }
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
      // Limit competences: Starter=3, Pro=10, others unlimited
      const competenceLimit = isStarterPlan ? 3 : (isProPlan ? 10 : Infinity);
      if (req.body.competences.length > competenceLimit) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: `Plan ${isStarterPlan ? 'Starter' : (isProPlan ? 'Professionnel' : 'Avancé')} : maximum ${competenceLimit} compétences par portfolio.` });
      }
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
      // Limit experiences: Starter=0 (not allowed), Pro=5, others unlimited
      const experienceLimit = isStarterPlan ? 0 : (isProPlan ? 5 : Infinity);
      if (req.body.experiences.length > experienceLimit) {
        await conn.rollback();
        conn.release();
        if (experienceLimit === 0) {
          return res.status(400).json({ error: 'Plan Starter : ajout d\'expériences non autorisé.' });
        }
        return res.status(400).json({ error: `Plan ${isProPlan ? 'Professionnel' : 'Avancé'} : maximum ${experienceLimit} expériences par portfolio.` });
      }
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
        { key: 'facebook_url', plateforme: 'facebook' },
        { key: 'instagram_url', plateforme: 'instagram' },
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
      if (incoming.is_public !== undefined || incoming.est_public !== undefined) mappedUpdate.est_public = (incoming.is_public !== undefined) ? incoming.is_public : incoming.est_public;
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

      // Before replacing social links, enforce free-plan limit (only one social link allowed)
      const userPlans = await planModel.listUserPlans(userId);
      const latestPlan = userPlans && userPlans.length ? userPlans[0] : null;
      const planSlug = latestPlan && latestPlan.slug ? String(latestPlan.slug).trim().toLowerCase() : 'gratuit';
      console.log(`User ${userId} updating portfolio with plan slug='${planSlug}'`);
      const isFree = planSlug === 'gratuit' || planSlug === 'free' || (latestPlan && Number(latestPlan.price_cents || 0) === 0);
      const isStarter = ['starter', 'standard'].includes(planSlug);
      const isPro = ['professionnel', 'pro', 'professional'].includes(planSlug);
      const isPremium = ['premium', 'premium_pro', 'premium-plus'].includes(planSlug);
      const isBusiness = ['business'].includes(planSlug);

      const socialPlatforms = [
        { key: 'website', plateforme: 'website' },
        { key: 'linkedin_url', plateforme: 'linkedin' },
        { key: 'github_url', plateforme: 'github' },
        { key: 'twitter_url', plateforme: 'twitter' },
        { key: 'facebook_url', plateforme: 'facebook' },
        { key: 'instagram_url', plateforme: 'instagram' },
      ];

      const provided = socialPlatforms.reduce((acc, plat) => acc + ((incoming && incoming[plat.key]) ? 1 : 0), 0);
      // Free=1, Starter=3, Premium+Business=5, Pro/default=Infinity
      let socialLimitUpdate = Infinity;
      if (isFree) socialLimitUpdate = 1;
      else if (isStarter) socialLimitUpdate = 3;
      else if (isPremium || isBusiness) socialLimitUpdate = 5;
      if (provided > socialLimitUpdate) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: `Limite formulé ${isFree ? 'gratuite' : 'Starter'} : vous ne pouvez ajouter que ${socialLimitUpdate} lien(s) de réseaux sociaux.` });
      }

      // Enforce project/competence/experience limits for updates as well
      if (Array.isArray(req.body.projects)) {
        const projectLimitUpdate = isStarter ? 3 : (isPro ? 10 : Infinity);
        if (req.body.projects.length > projectLimitUpdate) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ error: `Plan ${isStarter ? 'Starter' : (isPro ? 'Professionnel' : 'Avancé')} : maximum ${projectLimitUpdate} projets par portfolio.` });
        }
      }
      if (Array.isArray(req.body.competences)) {
        const competenceLimitUpdate = isStarter ? 3 : (isPro ? 10 : Infinity);
        if (req.body.competences.length > competenceLimitUpdate) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ error: `Plan ${isStarter ? 'Starter' : (isPro ? 'Professionnel' : 'Avancé')} : maximum ${competenceLimitUpdate} compétences par portfolio.` });
        }
      }
      if (Array.isArray(req.body.experiences)) {
        const experienceLimitUpdate = isStarter ? 0 : (isPro ? 5 : Infinity);
        if (req.body.experiences.length > experienceLimitUpdate) {
          await conn.rollback();
          conn.release();
          if (experienceLimitUpdate === 0) {
            return res.status(400).json({ error: 'Plan Starter : ajout d\'expériences non autorisé.' });
          }
          return res.status(400).json({ error: `Plan ${isPro ? 'Professionnel' : 'Avancé'} : maximum ${experienceLimitUpdate} expériences par portfolio.` });
        }
      }

      await conn.query('DELETE FROM liens_sociaux WHERE portfolio_id = ?', [id]);
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

