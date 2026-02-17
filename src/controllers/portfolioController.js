
import prisma from '../config/prisma.js';
import db from '../config/database.js';

const formatPortfolio = (p) => ({
  ...p,
  competences: typeof p.competences === 'string' ? JSON.parse(p.competences) : (p.competences || [])
});

// Liste des colonnes autorisées pour la mise à jour (évite views_count, id, etc.)
const VALID_PORTFOLIO_COLUMNS = [
  'titre', 'description', 'theme', 'url_slug', 'est_public',
  'banner_image_url', 'banner_color', 'profile_image_url', 'cv_url',
  'location', 'phone', 'website', 'linkedin_url', 'github_url',
  'twitter_url', 'instagram_url', 'facebook_url', 'domain', 'competences'
];

export const createPortfolio = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { 
      titre, description, theme, url_slug, est_public,
      banner_image_url, banner_color, profile_image_url, cv_url,
      location, phone, website, linkedin_url, github_url,
      twitter_url, instagram_url, facebook_url, domain, competences,
      projects, experiences
    } = req.body;

    const portfolioId = Math.random().toString(36).substr(2, 9);

    await connection.query(
      `INSERT INTO portfolios (
        id, utilisateur_id, titre, description, theme, url_slug, est_public, 
        banner_image_url, banner_color, profile_image_url, cv_url, location, 
        phone, website, linkedin_url, github_url, twitter_url, instagram_url, 
        facebook_url, domain, competences
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        portfolioId, req.user.id, titre, description, theme, url_slug, est_public ?? true, 
        banner_image_url, banner_color, profile_image_url, cv_url, location, 
        phone, website, linkedin_url, github_url, twitter_url, instagram_url, 
        facebook_url, domain, JSON.stringify(competences || [])
      ]
    );

    if (projects && Array.isArray(projects)) {
      for (const proj of projects) {
        if (proj.titre) {
          await connection.query(
            `INSERT INTO projets (id, portfolio_id, titre, description, image, lien_demo) VALUES (?, ?, ?, ?, ?, ?)`,
            [Math.random().toString(36).substr(2, 9), portfolioId, proj.titre, proj.description, proj.image, proj.lien_demo]
          );
        }
      }
    }

    if (experiences && Array.isArray(experiences)) {
      for (const exp of experiences) {
        if (exp.titre_poste) {
          await connection.query(
            `INSERT INTO experiences (id, portfolio_id, titre_poste, entreprise, description, date_debut, date_fin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [Math.random().toString(36).substr(2, 9), portfolioId, exp.titre_poste, exp.entreprise, exp.description, exp.date_debut || null, exp.date_fin || null]
          );
        }
      }
    }

    await connection.commit();
    const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
    res.status(201).json({ success: true, data: { ...formatPortfolio(portfolio), views_count: 0 } });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const updatePortfolio = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { projects, experiences, ...bodyData } = req.body;
    
    const existing = await prisma.portfolio.findUnique({ where: { id } });
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Portfolio non trouvé' });
    }
    if (existing.utilisateur_id !== req.user.id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Action non autorisée' });
    }

    // Filtrage des données pour ne garder que les colonnes réelles de la table
    const updateData = {};
    VALID_PORTFOLIO_COLUMNS.forEach(col => {
      if (bodyData[col] !== undefined) {
        updateData[col] = bodyData[col];
      }
    });

    if (updateData.competences !== undefined) {
      updateData.competences = JSON.stringify(updateData.competences);
    }

    // 1. Mettre à jour le portfolio principal
    await prisma.portfolio.update({
      where: { id },
      data: { ...updateData, updated_at: new Date() }
    });

    // 2. Mise à jour des projets (Suppression et ré-insertion)
    if (projects !== undefined && Array.isArray(projects)) {
      await connection.query('DELETE FROM projets WHERE portfolio_id = ?', [id]);
      for (const proj of projects) {
        if (proj.titre) {
          await connection.query(
            `INSERT INTO projets (id, portfolio_id, titre, description, image, lien_demo) VALUES (?, ?, ?, ?, ?, ?)`,
            [Math.random().toString(36).substr(2, 9), id, proj.titre, proj.description, proj.image, proj.lien_demo]
          );
        }
      }
    }

    // 3. Mise à jour des expériences
    if (experiences !== undefined && Array.isArray(experiences)) {
      await connection.query('DELETE FROM experiences WHERE portfolio_id = ?', [id]);
      for (const exp of experiences) {
        if (exp.titre_poste) {
          await connection.query(
            `INSERT INTO experiences (id, portfolio_id, titre_poste, entreprise, description, date_debut, date_fin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [Math.random().toString(36).substr(2, 9), id, exp.titre_poste, exp.entreprise, exp.description, exp.date_debut || null, exp.date_fin || null]
          );
        }
      }
    }

    await connection.commit();
    const [updated] = await db.query(`
      SELECT p.*, (SELECT COUNT(*) FROM visites v WHERE v.portfolio_id = p.id) as views_count
      FROM portfolios p WHERE p.id = ?
    `, [id]);
    
    res.json({ success: true, data: { ...formatPortfolio(updated[0]), views_count: Number(updated[0].views_count || 0) } });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const getMyPortfolio = async (req, res, next) => {
  try {
    const [portfolios] = await db.query(`
      SELECT p.*, 
             (SELECT COUNT(*) FROM visites v WHERE v.portfolio_id = p.id) as views_count
      FROM portfolios p
      WHERE p.utilisateur_id = ? AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    const formatted = portfolios.map(p => ({
      ...formatPortfolio(p),
      views_count: Number(p.views_count || 0)
    }));
    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

export const getPortfolioDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [portfolioRows] = await db.query(`
      SELECT p.*, (SELECT COUNT(*) FROM visites v WHERE v.portfolio_id = p.id) as views_count
      FROM portfolios p WHERE p.id = ?
    `, [id]);
    
    const portfolio = portfolioRows[0];

    if (!portfolio || portfolio.utilisateur_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Portfolio non trouvé' });
    }

    const projects = await prisma.projet.findMany({ where: { portfolio_id: id } });
    const experiences = await prisma.experience.findMany({ where: { portfolio_id: id } });
    const skills = await prisma.competence.findMany({ where: { portfolio_id: id } });

    res.json({
      success: true,
      data: {
        portfolio: { ...formatPortfolio(portfolio), views_count: Number(portfolio.views_count || 0) },
        projects,
        experiences,
        skills
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicPortfolio = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const portfolio = await prisma.portfolio.findUnique({
      where: { url_slug: slug }
    });

    if (!portfolio || !portfolio.est_public) {
      return res.status(404).json({ success: false, message: 'Portfolio non trouvé' });
    }

    prisma.visite.create({
      data: {
        id: Math.random().toString(36).substr(2, 9),
        portfolio_id: portfolio.id,
        adresse_ip: req.ip,
        user_agent: req.get('user-agent'),
        page: 'home'
      }
    }).catch(console.error);

    res.json({ 
      success: true, 
      data: formatPortfolio(portfolio)
    });
  } catch (error) {
    next(error);
  }
};
