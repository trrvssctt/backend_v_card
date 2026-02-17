
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import app from './app.js';
import prisma from './config/prisma.js';
import db from './config/database.js';

const PORT = process.env.PORT || 4000;

const ensureColumn = async (table, column, definition) => {
  try {
    const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
    if (cols.length === 0) {
      console.log(`[Database] Ajout de la colonne '${column}' à la table '${table}'...`);
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    }
  } catch (err) {
    console.error(`[Database] Erreur lors de la vérification de la colonne ${column} dans ${table}:`, err.message);
  }
};

const ensureTables = async () => {
  try {
    console.log('[Database] Vérification des tables système...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
          id VARCHAR(191) PRIMARY KEY,
          nom VARCHAR(191) NOT NULL,
          prenom VARCHAR(191) NOT NULL,
          email VARCHAR(191) UNIQUE NOT NULL,
          mot_de_passe VARCHAR(191) NOT NULL,
          role VARCHAR(20) DEFAULT 'USER',
          is_active BOOLEAN DEFAULT true,
          statut VARCHAR(20) DEFAULT 'actif',
          photo_profil TEXT,
          biographie TEXT,
          phone VARCHAR(20),
          created_by VARCHAR(191),
          dernier_login DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS roles (
          id VARCHAR(191) PRIMARY KEY,
          name VARCHAR(191) NOT NULL,
          description TEXT,
          statut VARCHAR(20) DEFAULT 'actif',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS permissions (
          id VARCHAR(191) PRIMARY KEY,
          name VARCHAR(191) UNIQUE NOT NULL,
          description TEXT,
          statut VARCHAR(20) DEFAULT 'actif'
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
          role_id VARCHAR(191) NOT NULL,
          permission_id VARCHAR(191) NOT NULL,
          PRIMARY KEY (role_id, permission_id),
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS utilisateur_roles (
          utilisateur_id VARCHAR(191) NOT NULL,
          role_id VARCHAR(191) NOT NULL,
          PRIMARY KEY (utilisateur_id, role_id),
          FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS portfolios (
          id VARCHAR(191) PRIMARY KEY,
          utilisateur_id VARCHAR(191) NOT NULL,
          titre VARCHAR(191) NOT NULL,
          description TEXT,
          theme VARCHAR(50) DEFAULT 'modern',
          url_slug VARCHAR(191) UNIQUE NOT NULL,
          est_public BOOLEAN DEFAULT true,
          banner_image_url TEXT,
          banner_color VARCHAR(20) DEFAULT '#22c55e',
          profile_image_url TEXT,
          cv_url TEXT,
          location VARCHAR(191),
          phone VARCHAR(20),
          website VARCHAR(191),
          linkedin_url TEXT,
          github_url TEXT,
          twitter_url TEXT,
          instagram_url TEXT,
          facebook_url TEXT,
          domain VARCHAR(191),
          competences JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL,
          FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS projets (
          id VARCHAR(191) PRIMARY KEY,
          portfolio_id VARCHAR(191) NOT NULL,
          titre VARCHAR(191) NOT NULL,
          description TEXT,
          image TEXT,
          lien_demo TEXT,
          lien_code TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS experiences (
          id VARCHAR(191) PRIMARY KEY,
          portfolio_id VARCHAR(191) NOT NULL,
          titre_poste VARCHAR(191) NOT NULL,
          entreprise VARCHAR(191) NOT NULL,
          description TEXT,
          date_debut VARCHAR(50),
          date_fin VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS visites (
          id VARCHAR(191) PRIMARY KEY,
          portfolio_id VARCHAR(191) NOT NULL,
          adresse_ip VARCHAR(45),
          user_agent TEXT,
          page VARCHAR(50),
          date_visite TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await db.query(`CREATE TABLE IF NOT EXISTS plans (id VARCHAR(191) PRIMARY KEY, name VARCHAR(191) NOT NULL, slug VARCHAR(191) UNIQUE NOT NULL, description TEXT, price_cents INT NOT NULL DEFAULT 0, currency VARCHAR(10) DEFAULT 'F CFA', billing_interval ENUM('month', 'year') DEFAULT 'month', is_public BOOLEAN DEFAULT true, features JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, deleted_at TIMESTAMP NULL) ENGINE=InnoDB;`);
    await db.query(`CREATE TABLE IF NOT EXISTS subscriptions (id VARCHAR(191) PRIMARY KEY, utilisateur_id VARCHAR(191) NOT NULL, plan_id VARCHAR(191) NOT NULL, status ENUM('active', 'cancelled', 'expired', 'trialing') DEFAULT 'active', start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, end_date TIMESTAMP NULL, amount INT NOT NULL, currency VARCHAR(10) DEFAULT 'F CFA', FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE, FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE) ENGINE=InnoDB;`);
    await db.query(`CREATE TABLE IF NOT EXISTS paiements (id VARCHAR(191) PRIMARY KEY, utilisateur_id VARCHAR(191) NOT NULL, montant INT NOT NULL, devise VARCHAR(10) DEFAULT 'F CFA', reference VARCHAR(191), methode VARCHAR(50), statut ENUM('succes', 'echec', 'en_attente') DEFAULT 'succes', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE) ENGINE=InnoDB;`);
    await db.query(`CREATE TABLE IF NOT EXISTS invoices (id VARCHAR(191) PRIMARY KEY, utilisateur_id VARCHAR(191) NOT NULL, amount INT NOT NULL, currency VARCHAR(10) DEFAULT 'F CFA', reference VARCHAR(191) UNIQUE, status ENUM('paid', 'pending', 'failed') DEFAULT 'paid', url_pdf TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE) ENGINE=InnoDB;`);
    
    await ensureColumn('portfolios', 'competences', 'JSON');
    await ensureColumn('portfolios', 'banner_image_url', 'TEXT');
    await ensureColumn('portfolios', 'banner_color', "VARCHAR(20) DEFAULT '#22c55e'");
    await ensureColumn('portfolios', 'profile_image_url', 'TEXT');
    await ensureColumn('portfolios', 'cv_url', 'TEXT');
    await ensureColumn('portfolios', 'location', 'VARCHAR(191)');
    await ensureColumn('portfolios', 'phone', 'VARCHAR(20)');
    await ensureColumn('portfolios', 'website', 'VARCHAR(191)');
    await ensureColumn('portfolios', 'linkedin_url', 'TEXT');
    await ensureColumn('portfolios', 'github_url', 'TEXT');
    await ensureColumn('portfolios', 'twitter_url', 'TEXT');
    await ensureColumn('portfolios', 'instagram_url', 'TEXT');
    await ensureColumn('portfolios', 'facebook_url', 'TEXT');
    await ensureColumn('portfolios', 'domain', 'VARCHAR(191)');
    await ensureColumn('experiences', 'date_debut', 'VARCHAR(50)');
    await ensureColumn('experiences', 'date_fin', 'VARCHAR(50)');

    console.log('[Database] Tables système opérationnelles.');
  } catch (error) {
    console.error('[Database] Erreur lors de la vérification des tables:', error);
  }
};

const seedPermissions = async () => {
  const perms = [
    { id: 'p_ov', name: 'access_overview', description: 'Accès à la vue d\'ensemble' },
    { id: 'p_us', name: 'access_users', description: 'Gestion des utilisateurs' },
    { id: 'p_rev', name: 'access_revenue', description: 'Gestion des revenus' },
    { id: 'p_log', name: 'access_logs', description: 'Consultation des logs' },
    { id: 'p_rol', name: 'access_roles', description: 'Gestion des rôles et permissions' },
    { id: 'p_pln', name: 'access_plans', description: 'Gestion des plans d\'abonnement' },
    { id: 'p_cli', name: 'access_clients', description: 'Gestion des clients' },
  ];

  for (const p of perms) {
    try {
      const exists = await prisma.permission.findUnique({ where: { name: p.name } });
      if (!exists) {
        await prisma.permission.create({ data: { ...p, statut: 'actif' } });
      }
    } catch (e) {}
  }
};

const seedAdmin = async () => {
  try {
    const adminExists = await prisma.utilisateur.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!adminExists) {
      console.log('[Seed] Aucun admin trouvé. Création de l\'admin par défaut...');
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash('Passer1234', salt);
      
      await prisma.utilisateur.create({
        data: {
          id: 'admin-001',
          nom: 'Admin',
          prenom: 'Portefolia',
          email: 'admin@portefolia.pro',
          mot_de_passe: hashedPassword,
          role: 'ADMIN',
          is_active: true,
          statut: 'actif'
        }
      });
      console.log('[Seed] Admin par défaut créé : admin@portefolia.pro / Passer1234');
    }
  } catch (error) {
    console.error('[Seed] Erreur lors de l\'initialisation de l\'admin:', error);
  }
};

const server = app.listen(PORT, async () => {
  console.log(`[Portefolia Server] Up and running on port ${PORT}`);
  await ensureTables();
  await seedPermissions();
  await seedAdmin();
});

const shutdown = async () => {
  console.log('[Portefolia Server] Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
