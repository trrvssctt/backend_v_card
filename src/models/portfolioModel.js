const { pool } = require('../db');
const projectModel = require('./projectModel');
const competenceModel = require('./competenceModel');
const experienceModel = require('./experienceModel');
const liensSociauxModel = require('./liensSociauxModel');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT NOT NULL,
      titre VARCHAR(200),
      description TEXT,
      theme VARCHAR(100),
      url_slug VARCHAR(150) UNIQUE NOT NULL,
      est_public BOOLEAN DEFAULT TRUE,
      -- presentation optional fields
      banner_type VARCHAR(100),
      banner_image_url TEXT,
      banner_color VARCHAR(50),
      profile_image_url TEXT,
  -- social/contact fields
  location VARCHAR(150),
  phone VARCHAR(50),
  website VARCHAR(255),
  linkedin_url VARCHAR(255),
  github_url VARCHAR(255),
  twitter_url VARCHAR(255),
      cv_url TEXT,
      date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_portfolio_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
  // Also attempt to add columns if the table existed without them
  try {
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS banner_type VARCHAR(100)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS banner_image_url TEXT");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS banner_color VARCHAR(50)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS profile_image_url TEXT");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS cv_url TEXT");
    // social/contact fields
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS location VARCHAR(150)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS website VARCHAR(255)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(255)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS github_url VARCHAR(255)");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(255)");
    // template relation fields
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS selected_template_id INT NULL");
    await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS template_settings JSON NULL");
  } catch (err) {
    // Ignore if ALTER NOT SUPPORTED on older MySQL; table created above will contain columns for new DBs
    console.warn('portfolioModel.init: ALTER TABLE optional columns may not be supported on this MySQL version:', err.message);
  }
}

async function createPortfolio(data) {
  // Map frontend fields to DB fields (SEULEMENT le schéma)
  const payload = {
    utilisateur_id: data.user_id || data.utilisateur_id,
    titre: data.title || data.titre,
    description: data.bio || data.description,
    theme: data.theme || data.theme_color || null,
    url_slug: data.slug || data.url_slug || `u-${Date.now()}`,
    est_public: data.is_public !== undefined ? data.is_public : true,
    // optional presentation and contact fields
    banner_type: data.banner_type !== undefined ? data.banner_type : (data.bannerType || null),
    banner_image_url: data.banner_image_url !== undefined ? data.banner_image_url : (data.banner || data.banner_image || null),
    banner_color: data.banner_color !== undefined ? data.banner_color : (data.bannerColor || null),
    profile_image_url: data.profile_image_url !== undefined ? data.profile_image_url : (data.profile_image || null),
    cv_url: data.cv_url !== undefined ? data.cv_url : (data.resume_url || null),
    location: data.location || null,
    phone: data.phone || null,
    website: data.website || null,
    linkedin_url: data.linkedin_url || null,
    github_url: data.github_url || null,
    twitter_url: data.twitter_url || null,
  };
  // Remove undefined/null values
  const validKeys = Object.keys(payload).filter(k => payload[k] !== undefined && payload[k] !== null);
  const keys = validKeys.join(', ');
  const placeholders = validKeys.map(() => '?').join(', ');
  const values = validKeys.map(k => payload[k]);
  const [result] = await pool.query(`INSERT INTO portfolios (${keys}) VALUES (${placeholders})`, values);
  return { id: result.insertId, ...payload };
}

async function updatePortfolio(id, data) {
  const payload = {};
  if (data.title !== undefined || data.titre !== undefined) payload.titre = data.title || data.titre;
  if (data.bio !== undefined || data.description !== undefined) payload.description = data.bio || data.description;
  if (data.slug !== undefined || data.url_slug !== undefined) payload.url_slug = data.slug || data.url_slug;
  if (data.is_public !== undefined || data.est_public !== undefined) payload.est_public = (data.is_public !== undefined) ? data.is_public : data.est_public;
  if (data.theme_color !== undefined || data.theme !== undefined) payload.theme = data.theme_color || data.theme;
  // social/contact fields
  if (data.location !== undefined) payload.location = data.location;
  if (data.phone !== undefined) payload.phone = data.phone;
  if (data.website !== undefined) payload.website = data.website;
  if (data.linkedin_url !== undefined) payload.linkedin_url = data.linkedin_url;
  if (data.github_url !== undefined) payload.github_url = data.github_url;
  if (data.twitter_url !== undefined) payload.twitter_url = data.twitter_url;
  // SUPPRIMÉ : if pour banner_*, profile_image_url, cv_url
  if (Object.keys(payload).length === 0) return await findById(id);
  const sets = Object.keys(payload).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(payload), id];
  await pool.query(`UPDATE portfolios SET ${sets} WHERE id = ?`, values);
  return await findById(id);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM portfolios WHERE id = ? LIMIT 1', [id]);
  const p = rows && rows.length > 0 ? rows[0] : null;
  if (!p) return null;
  // Load related lists
  const [projets] = await pool.query('SELECT * FROM projets WHERE portfolio_id = ? ORDER BY date_debut DESC', [id]);
  const [competences] = await pool.query('SELECT * FROM competences WHERE portfolio_id = ?', [id]);
  const [experiences] = await pool.query('SELECT * FROM experiences WHERE portfolio_id = ?', [id]);
  // Add english aliases to make frontend form binding easier
  p.title = p.titre;
  p.slug = p.url_slug;
  p.bio = p.description;
  p.theme_color = p.theme;
  p.is_public = p.est_public;
  p.banner_type = p.banner_type;
  p.banner_color = p.banner_color;
  p.banner_image_url = p.banner_image_url;
  p.profile_image_url = p.profile_image_url;
  p.cv_url = p.cv_url;
  p.location = p.location;
  p.phone = p.phone;
  p.website = p.website;
  p.linkedin_url = p.linkedin_url;
  p.github_url = p.github_url;
  p.twitter_url = p.twitter_url;
  p.projects = projets.map(pr => ({ ...pr, title: pr.titre, demo_url: pr.lien_demo, code_url: pr.lien_code, image: pr.image }));
  p.projets = projets;
  p.competences = competences.map(c => ({ ...c, name: c.nom, level: c.niveau, category: c.categorie }));
  p.experiences = experiences.map(ex => ({ ...ex, title: ex.titre_poste, company: ex.entreprise }));
  return p;
}

async function findByUser(userId) {
  const [rows] = await pool.query('SELECT * FROM portfolios WHERE utilisateur_id = ? ORDER BY date_creation DESC', [userId]);
  return rows;
}

async function findBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM portfolios WHERE url_slug = ? AND est_public = TRUE LIMIT 1', [slug]);
  let p = (rows && rows.length > 0) ? rows[0] : null;
  if (!p) {
    const [r2] = await pool.query('SELECT * FROM portfolios WHERE url_slug = ? LIMIT 1', [slug]);
    p = (r2 && r2.length > 0) ? r2[0] : null;
  }
  if (!p) return null;
  const id = p.id;
  const [projets] = await pool.query('SELECT * FROM projets WHERE portfolio_id = ? ORDER BY date_debut DESC', [id]);
  const [competences] = await pool.query('SELECT * FROM competences WHERE portfolio_id = ?', [id]);
  const [experiences] = await pool.query('SELECT * FROM experiences WHERE portfolio_id = ?', [id]);
  p.title = p.titre;
  p.slug = p.url_slug;
  p.bio = p.description;
  p.theme_color = p.theme;
  p.is_public = p.est_public;
  p.projects = projets.map(pr => ({ ...pr, title: pr.titre, demo_url: pr.lien_demo, code_url: pr.lien_code, image: pr.image }));
  p.competences = competences.map(c => ({ ...c, name: c.nom, level: c.niveau, category: c.categorie }));
  p.experiences = experiences.map(ex => ({ ...ex, title: ex.titre_poste, company: ex.entreprise }));
  return p;
}

async function findByIdWithRelations(id) {
  const portfolio = await findById(id);
  if (!portfolio) return null;

  // Fetch related data
  const projects = await projectModel.findByPortfolio(id);
  const competences = await competenceModel.findByPortfolio(id);
  const experiences = await experienceModel.findByPortfolio(id);
  const liensSociaux = await liensSociauxModel.findByPortfolio(id);

  // Mapper liens sociaux vers un objet simple (ex. : { linkedin_url: 'https://...' })
  const socialLinks = liensSociaux.reduce((acc, lien) => {
    switch (lien.plateforme) {
      case 'linkedin': acc.linkedin_url = lien.url; break;
      case 'github': acc.github_url = lien.url; break;
      case 'twitter': acc.twitter_url = lien.url; break;
      case 'website': acc.website = lien.url; break;
      default: break;
    }
    return acc;
  }, {});

  return {
    ...portfolio,
    // Ajout pour contact (si colonnes ajoutées)
    location: portfolio.location || '',
    phone: portfolio.phone || '',
    // Social links mappés
    ...socialLinks,
    // Champs aliases anglais
    title: portfolio.titre,
    bio: portfolio.description,
    slug: portfolio.url_slug,
    is_public: portfolio.est_public,
    theme_color: portfolio.theme,  // Mapping inverse
    // Related arrays (mappés comme avant)
    projects: projects.map(p => ({
      ...p,
      title: p.titre,
      demo_url: p.lien_demo,
      code_url: p.lien_code,
      image: p.image,  // Image du projet
    })),
    competences: competences.map(c => ({
      ...c,
      name: c.nom,
      level: c.niveau,
      category: c.categorie,
    })),
    experiences: experiences.map(e => ({
      ...e,
      title: e.titre_poste,
      company: e.entreprise,
    })),
  };
}
module.exports = { init, createPortfolio, updatePortfolio, findById, findByUser, findBySlug, findByIdWithRelations };