const { body, validationResult } = require('express-validator');

const portfolioRules = () => {
  return [
  // accept either English or French top-level keys
  body('title').optional({ checkFalsy: true }).isString().isLength({ min: 2 }).withMessage('Le nom est requis (2+ caractères)'),
  body('titre').optional({ checkFalsy: true }).isString().isLength({ min: 2 }).withMessage('Le nom est requis (2+ caractères)'),
  body('slug').optional({ checkFalsy: true }).isString().isLength({ min: 2 }).withMessage('Le slug est requis'),
  body('url_slug').optional({ checkFalsy: true }).isString().isLength({ min: 2 }).withMessage('Le slug est requis'),
    body('bio').optional({ checkFalsy: true }).isString().isLength({ max: 2000 }),
    body('website').optional({ checkFalsy: true }).isURL().withMessage('Site web invalide'),
    body('linkedin_url').optional({ checkFalsy: true }).isURL().withMessage('LinkedIn invalide'),
    body('github_url').optional({ checkFalsy: true }).isURL().withMessage('GitHub invalide'),
    body('twitter_url').optional({ checkFalsy: true }).isURL().withMessage('Twitter invalide'),
    body('profile_image_url').optional({ checkFalsy: true }).isURL().withMessage('Image invalide'),
    body('theme_color').optional({ checkFalsy: true }).isString().isLength({ min: 4, max: 7 }),
    body('banner_type').optional({ checkFalsy: true }).isIn(['color','image']),
    body('banner_color').optional({ checkFalsy: true }).isString(),
    body('is_public').optional(),
    // related arrays
  body('projects').optional().isArray(),
  // accept English or French project fields
  body('projects.*.title').optional({ checkFalsy: true }).isString(),
  body('projects.*.titre').optional({ checkFalsy: true }).isString(),
  body('projects.*.demo_url').optional({ checkFalsy: true }).isURL().withMessage('Project demo URL invalide'),
  body('projects.*.lien_demo').optional({ checkFalsy: true }).isURL().withMessage('Project demo URL invalide'),
  body('competences').optional().isArray(),
  body('competences.*.name').optional({ checkFalsy: true }).isString(),
  body('competences.*.nom').optional({ checkFalsy: true }).isString(),
  body('competences.*.level').optional({ checkFalsy: true }).isString(),
  body('competences.*.niveau').optional({ checkFalsy: true }).isString(),
  body('experiences').optional().isArray(),
  body('experiences.*.title').optional({ checkFalsy: true }).isString(),
  body('experiences.*.titre_poste').optional({ checkFalsy: true }).isString(),
  body('experiences.*.company').optional({ checkFalsy: true }).isString(),
  body('experiences.*.entreprise').optional({ checkFalsy: true }).isString(),
  ];
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

module.exports = { portfolioRules, validate };
