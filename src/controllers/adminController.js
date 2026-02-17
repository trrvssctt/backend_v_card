
import prisma from '../config/prisma.js';
import db from '../config/database.js';
import bcrypt from 'bcryptjs';
import * as mailService from '../services/mailService.js';

export const getGlobalStats = async (req, res, next) => {
  try {
    const totalUsers = await prisma.utilisateur.count({ where: { deleted_at: null } });
    const activePortfolios = await prisma.portfolio.count({ where: { est_public: true, deleted_at: null } });
    
    // Revenue incluant abonnements ET commandes NFC validées
    const [revRes] = await db.query(`
      SELECT 
        (SELECT COALESCE(SUM(montant), 0) FROM paiements WHERE statut = 'succes') +
        (SELECT COALESCE(SUM(total_price), 0) FROM nfc_orders WHERE status != 'pending') as totalRevenue
    `);

    const recentUsers = await prisma.utilisateur.findMany({ take: 5, orderBy: { created_at: 'desc' } });

    res.json({
      success: true,
      data: {
        totalUsers,
        activePortfolios,
        totalRevenue: revRes[0].totalRevenue || 0,
        recentUsers
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getUpgradeRequests = async (req, res, next) => {
  try {
    const [requests] = await db.query(`
      SELECT 
        p.id as payment_id, p.montant, p.devise, p.reference, p.methode, p.created_at,
        u.id as user_id, u.nom, u.prenom, u.email,
        pl.name as plan_name, pl.id as plan_id
      FROM paiements p
      JOIN utilisateurs u ON p.utilisateur_id = u.id
      JOIN subscriptions s ON u.id = s.utilisateur_id
      JOIN plans pl ON s.plan_id = pl.id
      WHERE p.statut = 'en_attente' AND p.methode != 'NFC_ORDER'
      ORDER BY p.created_at DESC
    `);
    
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_pending,
        COALESCE(SUM(montant), 0) as total_pending_amount,
        (SELECT COUNT(*) FROM paiements WHERE statut = 'succes' AND methode != 'NFC_ORDER') as total_validated
      FROM paiements 
      WHERE statut = 'en_attente' AND methode != 'NFC_ORDER'
    `);

    res.json({ 
      success: true, 
      data: {
        requests,
        stats: stats[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const approveUpgrade = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { paymentId } = req.params;
    await connection.beginTransaction();

    // 1. Récupérer les détails du paiement pour identifier l'utilisateur
    const [payments] = await connection.query('SELECT * FROM paiements WHERE id = ? AND statut = "en_attente"', [paymentId]);
    const payment = payments[0];
    if (!payment) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Paiement non trouvé ou déjà traité.' });
    }

    const userId = payment.utilisateur_id;

    // 2. Valider le paiement
    await connection.query('UPDATE paiements SET statut = "succes" WHERE id = ?', [paymentId]);

    // 3. Valider la facture correspondante (la plus récente en attente)
    await connection.query('UPDATE invoices SET status = "paid" WHERE utilisateur_id = ? AND status = "pending" ORDER BY created_at DESC LIMIT 1', [userId]);

    // 4. Activer l'abonnement (On passe tout abonnement lié à l'utilisateur en 'active')
    await connection.query('UPDATE subscriptions SET status = "active" WHERE utilisateur_id = ?', [userId]);

    // 5. Activer l'utilisateur s'il était en attente ou inactif pour qu'il puisse se connecter
    await connection.query('UPDATE utilisateurs SET statut = "actif", is_active = 1 WHERE id = ?', [userId]);

    // Récupérer les infos pour l'email
    const [u] = await connection.query('SELECT email, prenom FROM utilisateurs WHERE id = ?', [userId]);
    
    await connection.commit();

    // Notification client par email (asynchrone)
    if (u[0]) {
      mailService.sendAccountActivatedEmail(u[0].email, u[0].prenom).catch(err => {
        console.error("[AdminController] Erreur envoi mail activation:", err);
      });
    }

    res.json({ success: true, message: 'Upgrade validé avec succès. L\'utilisateur est désormais premium.' });
  } catch (error) {
    await connection.rollback();
    console.error('[AdminController] Erreur critique lors de l\'approbation de l\'upgrade:', error);
    next(error);
  } finally {
    connection.release();
  }
};

export const getAllNFCOrders = async (req, res, next) => {
  try {
    const [orders] = await db.query(`
      SELECT n.*, u.nom, u.prenom, u.email, p.titre as portfolio_name
      FROM nfc_orders n
      JOIN utilisateurs u ON n.utilisateur_id = u.id
      JOIN portfolios p ON n.portfolio_id = p.id
      ORDER BY n.created_at DESC
    `);
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

export const updateNFCOrderStatus = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const { status, tracking_number, cancel_reason } = req.body;

    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT n.*, u.email, u.prenom FROM nfc_orders n JOIN utilisateurs u ON n.utilisateur_id = u.id WHERE n.id = ?', [id]);
    const order = rows[0];

    if (!order) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    // Ensure optional columns exist (harmless on MySQL 8+; ignored on older versions)
    try {
      await connection.query('ALTER TABLE nfc_orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(255) DEFAULT NULL');
      await connection.query('ALTER TABLE nfc_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT DEFAULT NULL');
    } catch (e) {
      // ignore; continue
    }

    // Cancellation flow: allowed only before shipment
    if (status === 'cancelled') {
      if (order.status === 'shipped' || order.status === 'delivered') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Impossible d'annuler une commande déjà expédiée ou livrée." });
      }
      if (!cancel_reason || cancel_reason.trim() === '') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Motif d'annulation requis." });
      }
      await connection.query('UPDATE nfc_orders SET status = ?, cancel_reason = ? WHERE id = ?', [status, cancel_reason.trim(), id]);
    } else {
      // Normal transitions: store tracking number when provided
      await connection.query('UPDATE nfc_orders SET status = ?, tracking_number = ? WHERE id = ?', [status, tracking_number || null, id]);
    }

    // Insert payment when moving from pending -> production/shipped
    if (order.status === 'pending' && (status === 'production' || status === 'shipped')) {
      const payId = Math.random().toString(36).substr(2, 9);
      await connection.query(
        'INSERT INTO paiements (id, utilisateur_id, montant, devise, reference, methode, statut) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [payId, order.utilisateur_id, order.total_price, 'F CFA', `NFC-PAY-${order.id}`, 'NFC_ORDER', 'succes']
      );
    }

    await connection.commit();

    if (status !== 'pending') {
      mailService.sendNFCOrderUpdateEmail(order.email, order.prenom, order.id, status).catch(console.error);
    }

    res.json({ success: true, message: 'Statut logistique mis à jour' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const [users] = await db.query(`
      SELECT 
          u.id, u.nom, u.prenom, u.email, u.role, u.is_active, u.statut, u.created_at, u.created_by, u.photo_profil, u.phone, u.biographie,
          COUNT(DISTINCT p.id) as portfolios_count,
          CAST(COALESCE(SUM(v.views_count), 0) AS UNSIGNED) as total_views,
          (
            SELECT pl.name 
            FROM subscriptions s2 
            JOIN plans pl ON s2.plan_id = pl.id 
            WHERE s2.utilisateur_id = u.id AND s2.status IN ('active', 'trialing') 
            ORDER BY s2.start_date DESC LIMIT 1
          ) as plan_name,
          (SELECT COUNT(*) FROM paiements WHERE utilisateur_id = u.id AND statut = 'succes') as payments_count,
          (SELECT COUNT(*) FROM nfc_orders WHERE utilisateur_id = u.id) as orders_count,
          (SELECT COALESCE(SUM(montant), 0) FROM paiements WHERE utilisateur_id = u.id AND statut = 'succes') as total_spent,
          (SELECT GROUP_CONCAT(DISTINCT r.name) FROM utilisateur_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.utilisateur_id = u.id) as role_names
      FROM utilisateurs u
      LEFT JOIN portfolios p ON u.id = p.utilisateur_id AND p.deleted_at IS NULL
      LEFT JOIN (
          SELECT portfolio_id, COUNT(*) as views_count 
          FROM visites 
          GROUP BY portfolio_id
      ) v ON p.id = v.portfolio_id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

export const getUserDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.utilisateur.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    const portfolios = await prisma.portfolio.findMany({ where: { utilisateur_id: id, deleted_at: null } });
    const [views] = await db.query(`SELECT p.titre, COUNT(v.id) as count FROM portfolios p LEFT JOIN visites v ON p.id = v.portfolio_id WHERE p.utilisateur_id = ? AND p.deleted_at IS NULL GROUP BY p.id`, [id]);
    const [sub] = await db.query(`SELECT s.*, p.name as plan_name FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.utilisateur_id = ? AND s.status IN ('active', 'trialing') LIMIT 1`, [id]);
    const [payments] = await db.query('SELECT * FROM paiements WHERE utilisateur_id = ? ORDER BY created_at DESC', [id]);
    const [invoices] = await db.query('SELECT * FROM invoices WHERE utilisateur_id = ? ORDER BY created_at DESC', [id]);
    const [nfc_orders] = await db.query('SELECT * FROM nfc_orders WHERE utilisateur_id = ? ORDER BY created_at DESC', [id]);
    res.json({ success: true, data: { user, portfolios, portfolioViews: views, subscription: sub[0] || null, payments, invoices, nfc_orders } });
  } catch (error) { next(error); }
};

export const createClient = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { nom, prenom, email, mot_de_passe } = req.body;
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(mot_de_passe, salt);
    const userId = Math.random().toString(36).substr(2, 9);
    await connection.query('INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, role, is_active, statut, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, nom, prenom, email, hashedPassword, 'USER', true, 'actif', req.user.id]);
    await connection.commit();
    res.status(201).json({ success: true });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
};

export const createAdmin = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { nom, prenom, email, mot_de_passe, roleIds } = req.body;
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(mot_de_passe, salt);
    const userId = Math.random().toString(36).substr(2, 9);
    await connection.query('INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, role, is_active, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [userId, nom, prenom, email, hashedPassword, 'ADMIN', true, 'actif']);
    if (roleIds && roleIds.length > 0) {
      const values = roleIds.map(rId => [userId, rId]);
      await connection.query('INSERT INTO utilisateur_roles (utilisateur_id, role_id) VALUES ?', [values]);
    }
    await connection.commit();
    res.status(201).json({ success: true });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
};

export const updateAdmin = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { nom, prenom, email, roleIds, statut } = req.body;
    await connection.query('UPDATE utilisateurs SET nom = ?, prenom = ?, email = ?, statut = ? WHERE id = ?', [nom, prenom, email, statut, id]);
    await connection.query('DELETE FROM utilisateur_roles WHERE utilisateur_id = ?', [id]);
    if (roleIds && roleIds.length > 0) {
      const values = roleIds.map(rId => [id, rId]);
      await connection.query('INSERT INTO utilisateur_roles (utilisateur_id, role_id) VALUES ?', [values]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
};

export const getAllPlans = async (req, res, next) => {
  try {
    const [plans] = await db.query(`SELECT p.*, COUNT(s.id) as subscriber_count FROM plans p LEFT JOIN subscriptions s ON p.id = s.plan_id AND s.status = 'active' WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.price_cents ASC`);
    const formatted = plans.map(p => ({ ...p, features: typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []), is_public: !!p.is_public }));
    res.json({ success: true, data: formatted });
  } catch (error) { next(error); }
};

export const createPlan = async (req, res, next) => {
  try {
    const { name, slug, description, price_cents, features } = req.body;
    await db.query('INSERT INTO plans (id, name, slug, description, price_cents, features) VALUES (?, ?, ?, ?, ?, ?)', [Math.random().toString(36).substr(2, 9), name, slug, description, price_cents, JSON.stringify(features || [])]);
    res.status(201).json({ success: true });
  } catch (error) { next(error); }
};

export const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, price_cents, currency, billing_interval, is_public, features } = req.body;
    await db.query('UPDATE plans SET name = ?, slug = ?, description = ?, price_cents = ?, currency = ?, billing_interval = ?, is_public = ?, features = ? WHERE id = ?', [name, slug, description, price_cents, currency, billing_interval, is_public, JSON.stringify(features || []), id]);
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE plans SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const getPermissions = async (req, res, next) => {
  try { const perms = await prisma.permission.findMany({ where: { statut: 'actif' } }); res.json({ success: true, data: perms }); } catch (error) { next(error); }
};

export const getRoles = async (req, res, next) => {
  try {
    const [roles] = await db.query(`SELECT r.*, GROUP_CONCAT(p.name) as permission_codes FROM roles r LEFT JOIN role_permissions rp ON r.id = rp.role_id LEFT JOIN permissions p ON rp.permission_id = p.id WHERE r.deleted_at IS NULL GROUP BY r.id`);
    const formatted = roles.map(r => ({ ...r, permissions: r.permission_codes ? r.permission_codes.split(',') : [] }));
    res.json({ success: true, data: formatted });
  } catch (error) { next(error); }
};

export const createRole = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { name, description, permissionIds } = req.body;
    const roleId = Math.random().toString(36).substr(2, 9);
    await connection.query('INSERT INTO roles (id, name, description, statut) VALUES (?, ?, ?, ?)', [roleId, name, description, 'actif']);
    if (permissionIds && permissionIds.length > 0) {
      const values = permissionIds.map(pId => [roleId, pId]);
      await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
    }
    await connection.commit();
    res.status(201).json({ success: true });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { statut, is_active } = req.body;
    await db.query('UPDATE utilisateurs SET statut = ?, is_active = ? WHERE id = ?', [statut, is_active, id]);
    if (statut === 'actif' || is_active === true) {
      const [u] = await db.query('SELECT email, prenom FROM utilisateurs WHERE id = ?', [id]);
      if (u[0]) mailService.sendAccountActivatedEmail(u[0].email, u[0].prenom).catch(console.error);
    }
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const getAllPayments = async (req, res, next) => {
  try { const payments = await prisma.paiement.findMany({ orderBy: { created_at: 'desc' } }); res.json({ success: true, data: payments }); } catch (error) { next(error); }
};


export const updateRole = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { name, description, permissionIds } = req.body;

    await connection.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id]);
    await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    
    if (permissionIds && permissionIds.length > 0) {
      const values = permissionIds.map(pId => [id, pId]);
      await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};