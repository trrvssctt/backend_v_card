
import prisma from '../config/prisma.js';
import db from '../config/database.js';

export const upgradePlan = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { planId, paymentMethod, paymentRef } = req.body;
    const userId = req.user.id;

    await connection.beginTransaction();

    // 1. Récupérer les infos du plan
    const [plans] = await connection.query('SELECT * FROM plans WHERE id = ?', [planId]);
    const plan = plans[0];
    if (!plan) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Plan invalide' });
    }

    // 2. Créer l'enregistrement de paiement en attente
    const payId = Math.random().toString(36).substr(2, 9);
    await connection.query(
      'INSERT INTO paiements (id, utilisateur_id, montant, devise, reference, methode, statut) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [payId, userId, plan.price_cents, plan.currency, paymentRef, paymentMethod, 'en_attente']
    );

    // 3. Créer la facture en attente
    const invId = Math.random().toString(36).substr(2, 9);
    const invRef = `FAC-UPG-${Date.now()}-${userId.substring(0, 4).toUpperCase()}`;
    await connection.query(
      'INSERT INTO invoices (id, utilisateur_id, amount, currency, reference, status) VALUES (?, ?, ?, ?, ?, ?)',
      [invId, userId, plan.price_cents, plan.currency, invRef, 'pending']
    );

    // 4. Mettre à jour la souscription existante ou en créer une nouvelle en statut 'trialing'
    const [subs] = await connection.query('SELECT id FROM subscriptions WHERE utilisateur_id = ? LIMIT 1', [userId]);
    if (subs.length > 0) {
      await connection.query(
        "UPDATE subscriptions SET plan_id = ?, status = 'trialing', amount = ?, currency = ? WHERE id = ?",
        [planId, plan.price_cents, plan.currency, subs[0].id]
      );
    } else {
      const subId = Math.random().toString(36).substr(2, 9);
      await connection.query(
        "INSERT INTO subscriptions (id, utilisateur_id, plan_id, status, amount, currency) VALUES (?, ?, ?, ?, ?, ?)",
        [subId, userId, planId, 'trialing', plan.price_cents, plan.currency]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Votre demande d\'upgrade a été envoyée et est en attente de validation.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const getMyInvoices = async (req, res, next) => {
  try {
    const [invoices] = await db.query(
      `SELECT i.*, p.name as plan_name 
       FROM invoices i 
       LEFT JOIN subscriptions s ON i.utilisateur_id = s.utilisateur_id
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE i.utilisateur_id = ? 
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
};
