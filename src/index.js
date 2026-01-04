const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const bodyParser = require('express').json;
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const userModel = require('./models/userModel');
const portfolioRoutes = require('./routes/portfolioRoutes');
const portfolioModel = require('./models/portfolioModel');
const projectRoutes = require('./routes/projectRoutes');
const competenceRoutes = require('./routes/competenceRoutes');
const experienceRoutes = require('./routes/experienceRoutes');
const projectModel = require('./models/projectModel');
const competenceModel = require('./models/competenceModel');
const experienceModel = require('./models/experienceModel');
const planRoutes = require('./routes/planRoutes');
const rolesRoutes = require('./routes/rolesRoutes');
const planModel = require('./models/planModel');
const commandeRoutes = require('./routes/commandeRoutes');
const commandeModel = require('./models/commandeModel');
const carteModel = require('./models/carteModel');
const carteVisiteModel = require('./models/carte_visite_model');
const carteVisiteRoutes = require('./routes/carte_visite_routes');
const templateRoutes = require('./routes/templateRoutes');
const templateModel = require('./models/templateModel');
const adminRoutes = require('./routes/adminRoutes');
const abonnementRoutes = require('./routes/abonnementRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const uploadPublicRoutes = require('./routes/uploadPublicRoutes');
const contentPublicRoutes = require('./routes/contentPublicRoutes');
const adminController = require('./controllers/adminController');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Configure CORS early so preflight requests are handled before body parsing
// Allow multiple origins via CORS_ORIGIN env var (comma-separated). Default includes localhost and the deployed frontend domain.
// Include frontend dev origin (localhost:8080), backend local (localhost:3000) and production frontend domain `https://portefolia.tech`.
//const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8080,http://localhost:3000,https://portefolia.tech';
const rawOrigins = process.env.CORS_ORIGIN || 'https://portefolia.tech';
const allowedOrigins = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // If env allows wildcard '*', accept any origin
    if (allowedOrigins.indexOf('*') !== -1) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  // include common headers like Cache-Control and Accept so browsers' preflight succeeds
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Cache-Control','Accept','Origin']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// parse cookies for refresh token handling
app.use(cookieParser());
// increase request body size limits to accommodate larger portfolio payloads
app.use(bodyParser({ limit: '50mb' }));
app.use(require('express').urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/portfolios', portfolioRoutes);
// public content routes (articles/pages)
app.use('/api', contentPublicRoutes);
// public portfolio view
const portfolioController = require('./controllers/portfolioController');
app.get('/p/:slug', portfolioController.getPublicBySlug);
app.post('/api/visits', portfolioController.recordVisit);
app.post('/p/:slug/visits', portfolioController.recordVisitBySlug);

app.get('/', (req, res) => res.json({ok: true}));

// Mount order routes
app.use('/api/commandes', commandeRoutes);
// NFC card plans (public)
app.use('/api/nfc-cards', carteVisiteRoutes);
// Template routes (public + admin)
app.use('/api/templates', templateRoutes);
// Serve generated vCard visit files
app.use('/uploads/visites_carte', express.static(path.join(__dirname, '..', 'public', 'Visites_Carte')));
const checkoutRoutes = require('./routes/checkoutRoutes');
app.use('/api/checkout', checkoutRoutes);
// admin routes
  app.use('/api/admin', adminRoutes);
  app.use('/api/abonnements', abonnementRoutes);
// Analytics endpoints (per-portfolio, owners only)
app.use('/api/analytics', analyticsRoutes);
// public upload routes (authenticated users)
app.use('/api/uploads', uploadPublicRoutes);
// plans
app.use('/api/plans', planRoutes);
// Public roles listing
app.use('/api/roles', rolesRoutes);

// Webhooks (public endpoint) - keep minimal and verify signatures in production
app.post('/webhooks/payment', (req, res) => adminController.paymentWebhook(req, res));

// start server after testing db connection
(async () => {
  try {
    await db.testConnection();
    // initialiser la table utilisateurs si besoin
    await userModel.init();
    // initialiser portfolios
    await portfolioModel.init();
    await projectModel.init();
    await competenceModel.init();
    await experienceModel.init();
    // init plans
    await planModel.init();
    await templateModel.init();
    const invoiceModel = require('./models/invoiceModel');
    const articleModel = require('./models/articleModel');
    const pageModel = require('./models/pageModel');
    const contentHistoryModel = require('./models/contentHistoryModel');
    await invoiceModel.init();
    // init content models (no-op, migration manages schema)
    try { await articleModel.init(); } catch (e) {}
    try { await pageModel; } catch (e) {}
    try { await contentHistoryModel; } catch (e) {}
    await commandeModel.init();
    const paiementModel = require('./models/paiementModel');
    await paiementModel.init();
    const checkoutModel = require('./models/checkoutModel');
    await checkoutModel.init();
    await carteModel.init();
    await carteVisiteModel.init();
    const abonnementModel = require('./models/abonnementModel');
    await abonnementModel.init();
    const refreshTokenModel = require('./models/refreshTokenModel');
    await refreshTokenModel.init();
  const visiteModel = require('./models/visiteModel');
  await visiteModel.init();
    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

// Mount feature routes
app.use('/api/projects', projectRoutes);
app.use('/api/competences', competenceRoutes);
app.use('/api/experiences', experienceRoutes);
