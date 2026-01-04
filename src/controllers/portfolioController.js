const portfolioModel = require('../models/portfolioModel');
const visiteModel = require('../models/visiteModel');
const projectModel = require('../models/projectModel');
const competenceModel = require('../models/competenceModel');
const experienceModel = require('../models/experienceModel');
const { pool } = require('../db');
const planModel = require('../models/planModel');

// Map various domain strings to DB enum values expected by the `domaines` column
function mapDomaines(value) {
  if (!value && value !== 0) return null;
  try {
    const s = String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (s.includes('tech')) return 'TECH';
    if (s.includes('agro') || s.includes('agric')) return 'AGRO';
    if (s.includes('droit') || s.includes('jurid')) return 'DROIT';
    if (s.includes('medec') || s.includes('medecine') || s.includes('med')) return 'MEDECINE';
    return null;
  } catch (e) {
    const s = String(value).toLowerCase();
    if (s.includes('tech')) return 'TECH';
    if (s.includes('agro')) return 'AGRO';
    if (s.includes('droit')) return 'DROIT';
    if (s.includes('med')) return 'MEDECINE';
    return null;
  }
}

async function create(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const userId = req.userId;
    console.log(`[portfolioController.create] called by userId=${userId}`);
    console.log('[portfolioController.create] body=', Object.keys(req.body || {}).length ? req.body : '<empty>');
    if (!userId) {
      await conn.rollback();
      conn.release();
      console.warn('[portfolioController.create] unauthorized: no userId');
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
        console.warn(`[portfolioController.create] free plan limit reached for user ${userId} (existing=${existing.length})`);
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
        console.warn(`[portfolioController.create] starter plan limit reached for user ${userId} (count=${count})`);
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
        console.warn(`[portfolioController.create] pro plan limit reached for user ${userId} (count=${count})`);
        return res.status(400).json({ error: 'Plan Professionnel: limite atteinte (20 portfolios maximum)' });
      }
    }

    const incoming = { ...req.body };
    // normalize domain enum if provided by client
    const domainesEnum = mapDomaines(incoming.domaines || incoming.domain || incoming.domaine || incoming.domain_enum || incoming.domaines);
    // Debug: log incoming snapshot and computed enum
    console.log('[portfolioController.create] incoming keys=', Object.keys(incoming || {}).join(', '));
    console.log('[portfolioController.create] domainesEnum=', domainesEnum);
    if ((incoming.domaines || incoming.domain || incoming.domaine || incoming.domain_enum) && !domainesEnum) {
      await conn.rollback();
      conn.release();
      console.warn(`[portfolioController.create] invalid domaines value provided by user ${userId}:`, incoming.domaines || incoming.domain || incoming.domaine || incoming.domain_enum);
      return res.status(400).json({ error: 'Invalid domaine value. Allowed: TECH, AGRO, DROIT, MEDECINE' });
    }
    // Enforce social links limit: free=1, starter=3, others unlimited
    const socialKeys = ['website', 'linkedin_url', 'github_url', 'twitter_url', 'facebook_url', 'instagram_url'];
    const providedSocials = socialKeys.reduce((acc, k) => acc + (incoming[k] ? 1 : 0), 0);
    // Free=1, Starter=3, Premium+Business=5, Pro/default=Infinity
    let socialLimit = Infinity;
    if (isFreePlan) socialLimit = 1;
    else if (isStarterPlan) socialLimit = 3;
    else if (isPremiumPlan || isBusinessPlan) socialLimit = 5;
    // Debug: social counts
    console.log(`[portfolioController.create] social counts user=${userId} provided=${providedSocials} limit=${socialLimit}`);
    if (providedSocials > socialLimit) {
      await conn.rollback();
      conn.release();
      console.warn(`[portfolioController.create] social links limit exceeded user=${userId} provided=${providedSocials} limit=${socialLimit}`);
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
      domain: incoming.domain || incoming.domaine || null,
      domaines: domainesEnum,
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

    // generate a URL slug server-side if not provided by client
    function slugify(text) {
      if (!text) return `p-${portfolioId}`;
      return text
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    }

    try {
      const providedSlug = incoming.slug || incoming.url_slug || null;
      const base = providedSlug ? providedSlug.toString().trim() : (mapped.titre || `portfolio-${portfolioId}`);
      const finalSlug = `${slugify(base)}-${portfolioId}`;
      await conn.query('UPDATE portfolios SET url_slug = ? WHERE id = ?', [finalSlug, portfolioId]);
      console.log(`Generated slug for portfolio ${portfolioId}: ${finalSlug}`);
    } catch (e) {
      console.warn('Could not generate slug for portfolio', e && (e.message || e));
    }

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
  if (incoming.domain !== undefined || incoming.domaine !== undefined) mappedUpdate.domain = incoming.domain || incoming.domaine;
  // handle enum column `domaines` if provided
  if (incoming.domaines !== undefined || incoming.domain !== undefined || incoming.domaine !== undefined || incoming.domain_enum !== undefined) {
    const val = incoming.domaines || incoming.domain || incoming.domaine || incoming.domain_enum;
    const mappedDomain = mapDomaines(val);
    if ((incoming.domaines || incoming.domain || incoming.domaine || incoming.domain_enum) && !mappedDomain) {
      return res.status(400).json({ error: 'Invalid domaine value. Allowed: TECH, AGRO, DROIT, MEDECINE' });
    }
    if (mappedDomain) mappedUpdate.domaines = mappedDomain;
  }

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

// Admin listing: return portfolios with owner info and aggregated views_count
async function listAdmin(req, res) {
  try {
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;
    const sort = (req.query.sort || '').toString();
    let orderClause = 'p.created_at DESC';
    if (sort === 'user') orderClause = 'u.prenom ASC, u.nom ASC';
    else if (sort === 'views') orderClause = 'v.views_count DESC';

    const sql = `
      SELECT p.*, u.prenom as owner_first_name, u.nom as owner_last_name, u.email as owner_email,
        COALESCE(v.views_count, 0) AS views_count
      FROM portfolios p
      LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
      LEFT JOIN (
        SELECT portfolio_id, COUNT(*) AS views_count
        FROM visites
        GROUP BY portfolio_id
      ) v ON v.portfolio_id = p.id
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(sql, [limit, offset]);
    // For each portfolio owner, fetch their latest plan (using planModel.listUserPlans)
    const ownerIds = Array.from(new Set(rows.map(r => r.utilisateur_id).filter(Boolean)));
    const plansByOwner = {};
    for (const oid of ownerIds) {
      try {
        const userPlans = await planModel.listUserPlans(oid);
        const latest = userPlans && userPlans.length ? userPlans[0] : null;
        plansByOwner[oid] = latest || null;
      } catch (e) {
        plansByOwner[oid] = null;
      }
    }

    // attach owner_plan info to each row
    for (const r of rows) {
      const ownerId = r.utilisateur_id;
      const plan = plansByOwner[ownerId] || null;
      r.owner_plan = plan ? { id: plan.id, slug: plan.slug || null, name: plan.name || null } : null;
      // normalize owner fields for frontend
      r.owner = {
        id: r.utilisateur_id,
        first_name: r.owner_first_name || r.first_name || null,
        last_name: r.owner_last_name || r.last_name || null,
        email: r.owner_email || null,
      };
    }

    // compute aggregated stats from visites counts and plan distribution
    const total = rows.length;
    const deletedCount = rows.filter(r => r.deleted_at).length || 0;
    const isPublic = (p) => {
      return (
        p?.is_public === true || p?.is_public === 1 || p?.is_public === '1' ||
        p?.est_public === true || p?.est_public === 1 || p?.est_public === '1'
      );
    };
    const publicCount = rows.filter((p) => isPublic(p) && !p.deleted_at).length || 0;
    const privateCount = rows.filter((p) => !isPublic(p) && !p.deleted_at).length || 0;
    const totalViews = rows.reduce((acc, r) => acc + (Number(r.views_count || 0) || 0), 0);
    const activeCount = total - deletedCount;
    const avgViews = activeCount > 0 ? Math.round(totalViews / activeCount) : 0;

    const distributionByPlan = rows.reduce((acc, r) => {
      const slug = (r.owner_plan && r.owner_plan.slug) ? r.owner_plan.slug : 'unknown';
      acc[slug] = (acc[slug] || 0) + 1;
      return acc;
    }, {});

    // If client asked to sort by plan, do it now (server-side SQL doesn't know plan slug)
    if (sort === 'plan') {
      rows.sort((a, b) => {
        const pa = (a.owner_plan && a.owner_plan.slug) ? a.owner_plan.slug : '';
        const pb = (b.owner_plan && b.owner_plan.slug) ? b.owner_plan.slug : '';
        return pa.localeCompare(pb);
      });
    }

    return res.json({ portfolios: rows, stats: {
      total,
      public: publicCount,
      private: privateCount,
      deleted: deletedCount,
      totalViews,
      avgViews,
      distribution_by_plan: distributionByPlan,
    } });
  } catch (err) {
    console.error('Error listing admin portfolios:', err);
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

module.exports = { create, update, listByUser, listAdmin, getPublicBySlug, recordVisit, recordVisitBySlug, getById };

