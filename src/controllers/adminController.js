const userModel = require('../models/userModel');
const portfolioModel = require('../models/portfolioModel');
const visiteModel = require('../models/visiteModel');
const commandeModelLocal = require('../models/commandeModel');
const carteModel = require('../models/carteModel');
const paiementModel = require('../models/paiementModel');
const notificationModel = require('../models/notificationModel');
const { pool } = require('../db');
const invoiceModel = require('../models/invoiceModel');
const planModel = require('../models/planModel');
const abonnementModel = require('../models/abonnementModel');
const sendEmail = require('../utils/sendEmail');
const checkoutModel = require('../models/checkoutModel');

async function listUsers(req, res) {
  try {
    // simple pagination
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    // Build filters
    const where = ['u.deleted_at IS NULL'];
    const params = [];
    if (req.query.email) {
      where.push('u.email LIKE ?');
      params.push('%' + req.query.email + '%');
    }
    if (req.query.status) {
      // status: active|inactive
      if (req.query.status === 'active') where.push('u.is_active = 1');
      if (req.query.status === 'inactive') where.push('u.is_active = 0');
    }
    if (req.query.date_from) { where.push('u.date_inscription >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to) { where.push('u.date_inscription <= ?'); params.push(req.query.date_to); }
    if (req.query.plan_id) { where.push('p.id = ?'); params.push(Number(req.query.plan_id)); }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    // fetch users with portfolio counts and latest plan
    const sql = `SELECT u.id,
                    u.nom AS last_name,
                    u.prenom AS first_name,
                    u.email,
                    u.role,
                    u.verified,
                    u.is_active,
                    u.date_inscription AS created_at,
                    (SELECT COUNT(*) FROM portfolios p2 WHERE p2.utilisateur_id = u.id) AS portfolio_count,
                    p.id AS plan_id,
                    p.name AS plan_name,
                    p.slug AS plan_slug,
                    p.price_cents AS plan_price_cents
             FROM utilisateurs u
             LEFT JOIN user_plans latest_up ON latest_up.utilisateur_id = u.id
               AND latest_up.id = (
                 SELECT MAX(up2.id) FROM user_plans up2 WHERE up2.utilisateur_id = u.id
               )
             LEFT JOIN plans p ON p.id = latest_up.plan_id
             ${whereSql}
             ORDER BY u.date_inscription DESC
             LIMIT ? OFFSET ?`;

    params.push(limit, offset);
    const [rows] = await pool.query(sql, params);
    console.debug('admin.listUsers executed', { sql, params, rows_count: (rows || []).length });
    return res.json({ users: rows, page, limit });
  } catch (err) {
    console.error('admin.listUsers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Debug endpoint: returns total users count and last 10 users (non-deleted)
async function usersDebug(req, res) {
  try {
    const [[countRow]] = await pool.query('SELECT COUNT(*) AS cnt FROM utilisateurs WHERE deleted_at IS NULL');
    const count = countRow ? Number(countRow.cnt) : 0;

    const [rows] = await pool.query(
      `SELECT u.id,
              u.nom AS last_name,
              u.prenom AS first_name,
              u.email,
              u.role,
              u.verified,
              u.is_active,
              u.date_inscription AS created_at
       FROM utilisateurs u
       WHERE u.deleted_at IS NULL
       ORDER BY u.date_inscription DESC
       LIMIT 10`
    );

    console.debug('admin.usersDebug', { count, returned: (rows || []).length });
    return res.json({ count, last_users: rows });
  } catch (err) {
    console.error('admin.usersDebug error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Upgrade requests admin ---
async function listUpgrades(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const data = await checkoutModel.list({ page, limit });
    return res.json(data);
  } catch (err) {
    console.error('admin.listUpgrades error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getUpgrade(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const checkout = await checkoutModel.findById(id);
    if (!checkout) return res.status(404).json({ error: 'Not found' });
    // fetch related paiement and commande and plan
    const paiement = await paiementModel.findById(checkout.paiement_id);
    const commande = await commandeModelLocal.findById(checkout.commande_id);
    const plan = await planModel.getPlanById(checkout.plan_id);
    return res.json({ checkout, paiement, commande, plan });
  } catch (err) {
    console.error('admin.getUpgrade error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function approveUpgrade(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { reference = null, payment_method = null, image_paiement = null } = req.body;
    const checkout = await checkoutModel.findById(id);
    if (!checkout) return res.status(404).json({ error: 'Not found' });

    // update paiement record with reference/method/image and mark as paid
    try {
      // update paiement details by creating a new paiement update path: here we call updateStatus
      if (reference || payment_method || image_paiement) {
        // Note: paiementModel.createPaiement creates new paiements; updateStatus only updates statut
        // We'll directly update the row to set reference and image if present
        await (async () => {
          const updates = [];
          const params = [];
          if (reference) { updates.push('reference_transaction = ?'); params.push(reference); }
          if (payment_method) { updates.push('moyen_paiement = ?'); params.push(payment_method); }
          if (image_paiement) { updates.push('image_paiement = ?'); params.push(image_paiement); }
          updates.push('statut = ?'); params.push('confirmed');
          params.push(checkout.paiement_id);
          const sql = `UPDATE paiements SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
          await pool.query(sql, params);
        })();
      } else {
        await paiementModel.updateStatus(checkout.paiement_id, 'confirmed');
      }
    } catch (e) {
      console.warn('approveUpgrade: could not update paiement details', e.message || e);
    }

    // mark checkout as approved
    await checkoutModel.updateStatus(checkout.id, 'approved');


    // subscribe user to plan
    await planModel.subscribeUser({ utilisateur_id: checkout.utilisateur_id, plan_id: checkout.plan_id, status: 'active', payment_reference: reference || null });

    // mark the user active now that payment is approved
    try {
      await userModel.setActive(checkout.utilisateur_id, true);
    } catch (e) {
      console.warn('approveUpgrade: could not set user active', e.message || e);
    }

    // update commande status
    await commandeModelLocal.updateStatus(checkout.commande_id, 'En_traitement');

    // Optionally send email to user
    try {
      const user = await userModel.findById(checkout.utilisateur_id);

      // Fetch related details for the email: old plan, new plan, paiement, abonnement
      let oldPlan = null;
      try {
        const ups = await planModel.listUserPlans(checkout.utilisateur_id);
        if (ups && ups.length) oldPlan = ups[0];
      } catch (e) { oldPlan = null; }

      const newPlan = await planModel.getPlanById(checkout.plan_id);
      const paiement = checkout.paiement_id ? await paiementModel.findById(checkout.paiement_id) : null;
      let abonnement = null;
      try { if (checkout.abonnement_id) abonnement = await abonnementModel.findById(checkout.abonnement_id); } catch (e) { abonnement = null; }

      // Normalize price fields for display
      const normalizePlanForDisplay = (p) => {
        if (!p) return { name: null, price: 0, currency: p && p.currency ? p.currency : 'F CFA', features: [] };
        const price = p.price_cents ? Number(p.price_cents) / 100 : (p.price ? Number(p.price) : 0);
        const features = Array.isArray(p.features) ? p.features : (typeof p.features === 'string' ? p.features.split(',').map(s => s.trim()) : []);
        return { ...p, price, currency: p.currency || 'F CFA', features };
      };

      const oldPlanDisplay = normalizePlanForDisplay(oldPlan);
      const newPlanDisplay = normalizePlanForDisplay(newPlan);

      const loginUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
      const userName = `${user?.prenom || user?.first_name || ''} ${user?.nom || user?.last_name || ''}`.trim();

      const body = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmation de mise à niveau - Portefolia</title>
    <style>
        /* Styles pour l'email d'upgrade */
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 20px;
            background-color: #f9fafb;
        }
        
        .upgrade-container {
            max-width: 650px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
            overflow: hidden;
        }
        
        .upgrade-header {
            background: linear-gradient(135deg, #28A745 0%, #20c997 100%);
            color: white;
            padding: 50px 40px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .upgrade-header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            right: -50%;
            bottom: -50%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
            background-size: 30px 30px;
            opacity: 0.3;
        }
        
        .logo-container {
            margin-bottom: 25px;
            position: relative;
            z-index: 1;
        }
        
        .logo {
            max-height: 70px;
            width: auto;
        }
        
        .upgrade-title {
            margin: 15px 0 10px 0;
            font-size: 32px;
            font-weight: 800;
            position: relative;
            z-index: 1;
        }
        
        .upgrade-subtitle {
            margin: 0;
            opacity: 0.95;
            font-size: 18px;
            font-weight: 300;
            position: relative;
            z-index: 1;
        }
        
        .upgrade-content {
            padding: 50px 40px;
        }
        
        .greeting-section {
            margin-bottom: 40px;
            text-align: center;
        }
        
        .user-name {
            color: #28A745;
            font-size: 28px;
            font-weight: 700;
            margin: 15px 0;
            background: linear-gradient(135deg, #28A745, #20c997);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .upgrade-icon {
            font-size: 80px;
            margin: 20px 0;
            background: linear-gradient(135deg, #28A745, #20c997);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .upgrade-message {
            font-size: 18px;
            color: #4b5563;
            line-height: 1.8;
            text-align: center;
            max-width: 500px;
            margin: 0 auto 40px;
        }
        
        .plans-comparison {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 30px;
            margin: 50px 0;
            position: relative;
        }
        
        .plans-comparison::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: linear-gradient(to bottom, transparent, #28A745, transparent);
            transform: translateX(-50%);
        }
        
        .plan-card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            border: 2px solid #e5e7eb;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .plan-card.old {
            border-color: #d1d5db;
        }
        
        .plan-card.new {
            border-color: #28A745;
            border-width: 3px;
            box-shadow: 0 6px 25px rgba(40, 167, 69, 0.15);
        }
        
        .plan-badge {
            position: absolute;
            top: 15px;
            right: 15px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .badge-old {
            background: #f3f4f6;
            color: #6b7280;
        }
        
        .badge-new {
            background: linear-gradient(135deg, #28A745, #20c997);
            color: white;
        }
        
        .plan-name {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 10px 0;
            color: #1f2937;
        }
        
        .plan-price {
            font-size: 36px;
            font-weight: 800;
            margin: 15px 0;
            color: #28A745;
        }
        
        .plan-price.old {
            color: #6b7280;
            text-decoration: line-through;
            opacity: 0.7;
        }
        
        .plan-price span {
            font-size: 16px;
            font-weight: 400;
            color: #6b7280;
        }
        
        .plan-features {
            margin: 25px 0;
            padding: 0;
            list-style: none;
        }
        
        .plan-features li {
            padding: 8px 0;
            color: #4b5563;
            display: flex;
            align-items: flex-start;
        }
        
        .plan-features li::before {
            content: '✓';
            color: #28A745;
            font-weight: bold;
            margin-right: 10px;
            flex-shrink: 0;
        }
        
        .plan-features.old li::before {
            color: #9ca3af;
        }
        
        .plan-features li.disabled {
            color: #9ca3af;
        }
        
        .plan-features li.disabled::before {
            content: '✗';
            color: #ef4444;
        }
        
        .upgrade-benefits {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border-radius: 12px;
            padding: 35px;
            margin: 50px 0;
            border-left: 5px solid #28A745;
        }
        
        .benefits-title {
            color: #065f46;
            margin-top: 0;
            font-size: 22px;
        }
        
        .benefits-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 25px;
        }
        
        .benefit-item {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
        }
        
        .benefit-icon {
            font-size: 32px;
            margin-bottom: 15px;
            color: #28A745;
        }
        
        .benefit-item h4 {
            margin: 0 0 10px 0;
            color: #1f2937;
        }
        
        .activation-details {
            background: #f8fafc;
            border-radius: 10px;
            padding: 25px;
            margin: 40px 0;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .detail-row:last-child {
            border-bottom: none;
        }
        
        .detail-label {
            color: #6b7280;
            font-weight: 500;
        }
        
        .detail-value {
            color: #1f2937;
            font-weight: 600;
        }
        
        .detail-value.highlight {
            color: #28A745;
            font-weight: 700;
        }
        
        .cta-section {
            text-align: center;
            margin: 50px 0 30px;
        }
        
        .explore-btn {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            padding: 18px 45px;
            background: linear-gradient(135deg, #28A745, #20c997);
            color: white;
            text-decoration: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 700;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px rgba(40, 167, 69, 0.25);
        }
        
        .explore-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 35px rgba(40, 167, 69, 0.35);
        }
        
        .next-steps {
            margin: 40px 0;
            padding: 30px;
            background: #f8fafc;
            border-radius: 10px;
        }
        
        .next-steps h3 {
            color: #1f2937;
            text-align: center;
            margin-top: 0;
        }
        
        .steps-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 25px;
        }
        
        .step-item {
            text-align: center;
            padding: 20px;
        }
        
        .step-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            background: #28A745;
            color: white;
            border-radius: 50%;
            font-weight: 700;
            margin-bottom: 15px;
        }
        
        .upgrade-footer {
            text-align: center;
            padding: 40px;
            background: #f8fafc;
            border-top: 1px solid #e5e7eb;
        }
        
        .contact-info {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 40px;
            margin: 30px 0;
        }
        
        .contact-item {
            text-align: center;
            min-width: 180px;
        }
        
        @media (max-width: 768px) {
            .upgrade-content {
                padding: 30px 20px;
            }
            
            .plans-comparison {
                grid-template-columns: 1fr;
                gap: 20px;
            }
            
            .plans-comparison::before {
                display: none;
            }
            
            .benefits-grid {
                grid-template-columns: 1fr;
            }
            
            .contact-info {
                flex-direction: column;
                gap: 20px;
            }
            
            .explore-btn {
                padding: 16px 30px;
                font-size: 16px;
                width: 100%;
                box-sizing: border-box;
                justify-content: center;
            }
            
            .detail-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="upgrade-container">
        <!-- En-tête avec logo -->
        <div class="upgrade-header">
            <div class="logo-container">
                <!-- Remplacer src par l'URL de votre logo -->
                <img src="https://example.com/logo.png" alt="Portefolia Logo" class="logo">
                <h1 class="upgrade-title">Mise à niveau confirmée ! 🎉</h1>
                <p class="upgrade-subtitle">Votre formule a été améliorée avec succès</p>
            </div>
        </div>
        
        <!-- Contenu principal -->
        <div class="upgrade-content">
            <!-- Salutation personnalisée -->
            <div class="greeting-section">
                <div class="upgrade-icon">🚀</div>
                <div class="user-name">${user.prenom || user.nom || 'Cher client'}</div>
                <p class="upgrade-message">
                    Félicitations ! Votre demande de mise à niveau a été approuvée par notre équipe.
                    Votre compte est désormais activé avec la nouvelle formule.
                </p>
            </div>
            
            <!-- Comparaison des plans -->
            <div class="plans-comparison">
                <!-- Ancien plan -->
                <div class="plan-card old">
                    <div class="plan-badge badge-old">Ancienne formule</div>
                    <h3 class="plan-name">${oldPlan?.name || 'Formule Basique'}</h3>
                    <div class="plan-price old">${oldPlan?.price || '0'} ${oldPlan?.currency || 'F CFA'}<span>/mois</span></div>
                    <ul class="plan-features old">
                        ${(oldPlan?.features || [
                            '1 portfolio maximum',
                            'Analytics basiques',
                            'Support par email',
                            'Stockage limité',
                            'Pas de carte NFC'
                        ]).map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>
                
                <!-- Nouveau plan -->
                <div class="plan-card new">
                    <div class="plan-badge badge-new">Nouvelle formule</div>
                    <h3 class="plan-name">${newPlan?.name || 'Formule Premium'}</h3>
                    <div class="plan-price">${newPlan?.price || '0'} ${newPlan?.currency || 'F CFA'}<span>/mois</span></div>
                    <ul class="plan-features">
                        ${(newPlan?.features || [
                            'Portfolios illimités',
                            'Analytics avancés',
                            'Support prioritaire',
                            'Stockage étendu',
                            'Carte NFC incluse',
                            'Domaines personnalisés',
                            'Statistiques détaillées',
                            'Intégrations API'
                        ]).map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                </div>
            </div>
            
            <!-- Détails d'activation -->
            <div class="activation-details">
                <h3 style="color: #1f2937; margin-top: 0; text-align: center;">📋 Détails de l'activation</h3>
                <div class="detail-row">
                    <span class="detail-label">Date d'activation :</span>
                    <span class="detail-value highlight">${new Date().toLocaleDateString('fr-FR', { 
                        weekday: 'long',
                        day: 'numeric', 
                        month: 'long', 
                        year: 'numeric' 
                    })}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Prochaine facturation :</span>
                    <span class="detail-value">${(() => {
                        const nextDate = new Date();
                        nextDate.setMonth(nextDate.getMonth() + 1);
                        return nextDate.toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric' 
                        });
                    })()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Montant de l'upgrade :</span>
                    <span class="detail-value highlight">${(() => {
                        const oldPrice = parseFloat(oldPlan?.price || 0);
                        const newPrice = parseFloat(newPlan?.price || 0);
                        return (newPrice - oldPrice) + ' ' + (newPlan?.currency || 'F CFA');
                    })()} / mois</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Référence de paiement :</span>
                  <span class="detail-value">${paiement?.reference_transaction || paiement?.reference || reference || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Montant payé :</span>
                  <span class="detail-value highlight">${(paiement?.montant || paiement?.montant_total || newPlanDisplay.price) + ' ' + (paiement?.currency || newPlanDisplay.currency || 'F CFA')}</span>
                </div>
            </div>
            
            <!-- Avantages de l'upgrade -->
            <div class="upgrade-benefits">
                <h3 class="benefits-title">✨ Vos nouveaux avantages</h3>
                <div class="benefits-grid">
                    <div class="benefit-item">
                        <div class="benefit-icon">🎨</div>
                        <h4>Portfolios Illimités</h4>
                        <p style="color: #6b7280; font-size: 14px;">Créez autant de portfolios que vous souhaitez</p>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">📊</div>
                        <h4>Analytics Avancés</h4>
                        <p style="color: #6b7280; font-size: 14px;">Suivez les performances détaillées</p>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">🚀</div>
                        <h4>Support Prioritaire</h4>
                        <p style="color: #6b7280; font-size: 14px;">Réponses rapides de notre équipe</p>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">🔗</div>
                        <h4>Carte NFC Incluse</h4>
                        <p style="color: #6b7280; font-size: 14px;">Partagez votre profil en un tap</p>
                    </div>
                </div>
            </div>
            
            <!-- Prochaines étapes -->
            <div class="next-steps">
                <h3>🚀 Comment profiter au maximum de votre nouvelle formule ?</h3>
                <div class="steps-grid">
                    <div class="step-item">
                        <div class="step-number">1</div>
                        <h4>Explorez les nouvelles fonctionnalités</h4>
                        <p style="color: #6b7280; font-size: 14px;">Découvrez tout ce que vous pouvez faire maintenant</p>
                    </div>
                    <div class="step-item">
                        <div class="step-number">2</div>
                        <h4>Créez vos portfolios supplémentaires</h4>
                        <p style="color: #6b7280; font-size: 14px;">Profitez de la possibilité de créer plusieurs portfolios</p>
                    </div>
                    <div class="step-item">
                        <div class="step-number">3</div>
                        <h4>Configurez vos statistiques</h4>
                        <p style="color: #6b7280; font-size: 14px;">Activez le suivi avancé de vos performances</p>
                    </div>
                    <div class="step-item">
                        <div class="step-number">4</div>
                        <h4>Commander votre carte NFC</h4>
                        <p style="color: #6b7280; font-size: 14px;">Profitez de votre carte NFC gratuite</p>
                    </div>
                </div>
            </div>
            
            <!-- Bouton d'action principal -->
            <div class="cta-section">
                <a href="${loginUrl || process.env.FRONTEND_URL || 'http://localhost:5173'}" class="explore-btn">
                    <span>🚀 Découvrir ma nouvelle formule</span>
                </a>
                <p style="color: #6b7280; margin-top: 20px;">
                    Accédez directement à votre tableau de bord pour commencer
                </p>
            </div>
            
            <!-- Ressources supplémentaires -->
            <div style="text-align: center; margin: 40px 0;">
                <h4 style="color: #4b5563; margin-bottom: 20px;">📚 Ressources utiles</h4>
                <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 15px;">
                    <a href="https://help.portefolia.com/premium-features" style="color: #28A745; text-decoration: none; padding: 8px 16px; border: 1px solid #28A745; border-radius: 6px;">
                        Guide des fonctionnalités Premium
                    </a>
                    <a href="https://help.portefolia.com/nfc-cards" style="color: #28A745; text-decoration: none; padding: 8px 16px; border: 1px solid #28A745; border-radius: 6px;">
                        Commander ma carte NFC
                    </a>
                    <a href="https://help.portefolia.com/analytics" style="color: #28A745; text-decoration: none; padding: 8px 16px; border: 1px solid #28A745; border-radius: 6px;">
                        Maîtriser les analytics
                    </a>
                </div>
            </div>
        </div>
        
        <!-- Pied de page -->
        <div class="upgrade-footer">
            <div class="contact-info">
                <div class="contact-item">
                    <strong>🎯 Support Premium</strong><br>
                    <a href="tel:+33123456789" style="color: #28A745; text-decoration: none;">+33 1 23 45 67 89</a><br>
                    <a href="mailto:premium@portefolia.com" style="color: #28A745;">premium@portefolia.com</a>
                </div>
                
                <div class="contact-item">
                    <strong>💡 Assistance 24/7</strong><br>
                    Support prioritaire inclus<br>
                    Réponse sous 2 heures
                </div>
                
                <div class="contact-item">
                    <strong>📞 Contact général</strong><br>
                    <a href="mailto:support@portefolia.com" style="color: #28A745;">support@portefolia.com</a><br>
                    Centre d'aide en ligne
                </div>
            </div>
            
            <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px;">
                <strong>Important :</strong> Votre nouvelle formule est activée immédiatement. Le prochain prélèvement aura lieu à la date de renouvellement.<br>
                Vous pouvez modifier votre formule à tout moment depuis votre tableau de bord.
            </p>
            
            <p style="margin: 25px 0 0 0; color: #4b5563;">
                Bienvenue dans l'expérience Premium !<br>
                <strong>L'équipe Portefolia</strong><br>
                Nous sommes là pour votre succès
            </p>
            
            <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Portefolia. Tous droits réservés.<br>
                <a href="https://portefolia.com/terms" style="color: #9ca3af;">Conditions générales</a> • 
                <a href="https://portefolia.com/privacy" style="color: #9ca3af;">Confidentialité</a> • 
                <a href="https://portefolia.com/premium-terms" style="color: #9ca3af;">Conditions Premium</a>
            </p>
        </div>
    </div>
</body>
</html>`;
      await sendEmail(user.email, 'Mise à niveau acceptée', body);
    } catch (e) {
      console.warn('approveUpgrade: failed to send email', e.message || e);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.approveUpgrade error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function listPendingUsers(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id,
                u.nom AS last_name,
                u.prenom AS first_name,
                u.email,
                u.role,
                u.date_inscription AS created_at,
                u.verified,
                u.is_active,
                p.id AS plan_id,
                p.name AS plan_name,
                p.slug AS plan_slug,
                p.price_cents AS plan_price_cents
       FROM utilisateurs u
       LEFT JOIN (
         SELECT up.utilisateur_id, up.plan_id FROM user_plans up
         WHERE up.id IN (
           SELECT MAX(id) FROM user_plans up2 WHERE up2.utilisateur_id = up.utilisateur_id
         )
       ) latest_up ON latest_up.utilisateur_id = u.id
       LEFT JOIN plans p ON p.id = latest_up.plan_id
         WHERE (u.verified = FALSE OR u.verified = 0) OR (u.is_active = FALSE OR u.is_active = 0)
       ORDER BY u.date_inscription DESC`
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error('admin.listPendingUsers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function listCommandes(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const [rows] = await pool.query('SELECT * FROM commandes ORDER BY date_commande DESC LIMIT ? OFFSET ?', [limit, offset]);
    return res.json({ commandes: rows, page, limit });
  } catch (err) {
    console.error('admin.listCommandes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Revenue / Finance ---
async function revenueSummary(req, res) {
  try {
    // total revenue (confirmed or paid)
    const [tot] = await pool.query(`SELECT COALESCE(SUM(montant),0) AS total_revenue FROM paiements WHERE statut IN ('confirmed','paid')`);
    const totalRevenue = tot && tot[0] ? Number(tot[0].total_revenue) : 0;

    // today's revenue
    const [todayRow] = await pool.query(`SELECT COALESCE(SUM(montant),0) AS today_revenue FROM paiements WHERE statut IN ('confirmed','paid') AND DATE(created_at) = CURRENT_DATE()`);
    const todayRevenue = todayRow && todayRow[0] ? Number(todayRow[0].today_revenue) : 0;

    // this month
    const [monthRow] = await pool.query(`SELECT COALESCE(SUM(montant),0) AS month_revenue FROM paiements WHERE statut IN ('confirmed','paid') AND DATE_FORMAT(created_at,'%Y-%m') = DATE_FORMAT(CURRENT_DATE(), '%Y-%m')`);
    const monthRevenue = monthRow && monthRow[0] ? Number(monthRow[0].month_revenue) : 0;

    // this year
    const [yearRow] = await pool.query(`SELECT COALESCE(SUM(montant),0) AS year_revenue FROM paiements WHERE statut IN ('confirmed','paid') AND YEAR(created_at) = YEAR(CURRENT_DATE())`);
    const yearRevenue = yearRow && yearRow[0] ? Number(yearRow[0].year_revenue) : 0;

    // monthly breakdown (last 12 months)
    const [monthly] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COALESCE(SUM(montant),0) AS revenue
      FROM paiements
      WHERE statut IN ('confirmed','paid') AND created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `);

    return res.json({ totalRevenue, todayRevenue, monthRevenue, yearRevenue, monthly: monthly || [] });
  } catch (err) {
    console.error('admin.revenueSummary error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function revenueByUser(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT u.id AS user_id, u.nom AS last_name, u.prenom AS first_name, u.email,
             COUNT(p.id) AS payments_count,
             COALESCE(SUM(p.montant),0) AS total_amount,
             MAX(p.created_at) AS last_payment_at
      FROM paiements p
      LEFT JOIN commandes c ON c.id = p.commande_id
      LEFT JOIN utilisateurs u ON u.id = c.utilisateur_id
      WHERE p.statut IN ('confirmed','paid')
      GROUP BY u.id
      ORDER BY total_amount DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return res.json({ users: rows || [], page, limit });
  } catch (err) {
    console.error('admin.revenueByUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Simple Server-Sent Events (SSE) endpoint to push revenue summary periodically
async function revenueStream(req, res) {
  try {
    // set headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    let stopped = false;

    req.on('close', () => { stopped = true; });

    const sendSummary = async () => {
      try {
        const [tot] = await pool.query(`SELECT COALESCE(SUM(montant),0) AS total_revenue FROM paiements WHERE statut IN ('confirmed','paid')`);
        const totalRevenue = tot && tot[0] ? Number(tot[0].total_revenue) : 0;
        const payload = { totalRevenue, timestamp: Date.now() };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        console.warn('revenueStream send error', e.message || e);
      }
    };

    // send initial
    await sendSummary();

    // periodic updates every 10 seconds
    const iv = setInterval(async () => {
      if (stopped) {
        clearInterval(iv);
        return;
      }
      await sendSummary();
    }, 10000);

  } catch (err) {
    console.error('admin.revenueStream error:', err);
    // cannot send JSON error because headers set; just end
    try { res.end(); } catch (e) {}
  }
}

async function getUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    const user = await userModel.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    // include portfolio_count
    const [rows] = await pool.query('SELECT COUNT(*) AS portfolio_count FROM portfolios WHERE utilisateur_id = ?', [id]);
    user.portfolio_count = rows && rows[0] ? rows[0].portfolio_count : 0;
    // include latest plan
    try {
      const ups = await planModel.listUserPlans(id);
      user.current_plan = ups && ups.length ? ups[0] : null;
      user.plan_history = ups || [];
    } catch (e) {
      user.current_plan = null;
      user.plan_history = [];
    }
    return res.json({ user });
  } catch (err) {
    console.error('admin.getUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function activateUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    await userModel.setActive(id, true);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.activateUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deactivateUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    await userModel.setActive(id, false);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.deactivateUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    // Soft delete
    await userModel.deleteUser(id);
    return res.json({ ok: true, soft_deleted: true });
  } catch (err) {
    console.error('admin.deleteUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Permanently delete - restricted to system admins (require RBAC 'system:admin' or super_admin)
async function permanentDeleteUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    // ensure caller is super_admin or has system:admin permission - RBAC middleware should enforce this
    await userModel.hardDeleteUser(id);
    return res.json({ ok: true, deleted: true });
  } catch (err) {
    console.error('admin.permanentDeleteUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    const patch = {};
    const allowed = ['nom', 'prenom', 'email', 'photo_profil', 'biographie', 'role'];
    allowed.forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No valid fields provided' });
    const keys = Object.keys(patch);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const vals = keys.map(k => patch[k]);
    vals.push(id);
    await pool.query(`UPDATE utilisateurs SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, vals);
    const updated = await userModel.findById(id);
    return res.json({ user: updated });
  } catch (err) {
    console.error('admin.updateUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getUserPlans(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    const ups = await planModel.listUserPlans(id);
    return res.json({ plans: ups || [] });
  } catch (err) {
    console.error('admin.getUserPlans error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function changeUserPlan(req, res) {
  try {
    const id = Number(req.params.id);
    const { plan_id = null, start_date = null, end_date = null, status = 'active', payment_reference = null } = req.body;
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    // Close previous active plan(s)
    try {
      await pool.query('UPDATE user_plans SET end_date = CURRENT_TIMESTAMP, status = ? WHERE utilisateur_id = ? AND (status = ? OR status = ?)', ['cancelled', id, 'active', 'pending']);
    } catch (e) { console.warn('changeUserPlan: could not close previous plans', e.message || e); }

    const newSub = await planModel.subscribeUser({ utilisateur_id: id, plan_id, start_date, end_date, status, payment_reference });
    // ensure user active if activating plan
    if (status === 'active') { try { await userModel.setActive(id, true); } catch (e) {} }
    return res.json({ ok: true, subscription: newSub });
  } catch (err) {
    console.error('admin.changeUserPlan error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getUserCartes(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    // join commandes -> cartes_nfc
    const [rows] = await pool.query(`SELECT c.*, cmd.id AS commande_id, cmd.utilisateur_id
      FROM cartes_nfc c
      JOIN commandes cmd ON cmd.id = c.commande_id
      WHERE cmd.utilisateur_id = ?`, [id]);
    // map to desired shape
    const cartes = (rows || []).map(r => ({ id: r.id, uid_nfc: r.uid_nfc, lien_portfolio: r.lien_portfolio, design: r.design, statut: r.statut, commande_id: r.commande_id }));
    return res.json({ cartes });
  } catch (err) {
    console.error('admin.getUserCartes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function verifyUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    await userModel.verifyUser(id);
    // Optionally send a notification/email to the user - kept minimal here
    return res.json({ ok: true, message: 'Utilisateur validé' });
  } catch (err) {
    console.error('admin.verifyUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Admin confirms payment and validates a user: generate invoice, create subscription (optional), verify user and send invoice email
async function confirmPaymentAndValidate(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    let { plan_id = null, amount = 0, currency = 'XOF', reference = null, payment_method = null, image_paiement = null } = req.body;

    // generate a reference if none provided
    if (!reference) {
      reference = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // normalize amount: if plan specified and amount is falsy, derive from plan price
    if (plan_id && (!amount || Number(amount) === 0)) {
      try {
        const plan = await planModel.getPlanById(plan_id);
        if (plan) {
          // plan.price_cents stored in cents; convert to major unit
          amount = (Number(plan.price_cents || 0) / 100);
        }
      } catch (e) {
        // ignore
      }
    }

    // fetch user's previous plan (if any) for email details
    let previousPlan = null;
    try {
      const ups = await planModel.listUserPlans(id);
      if (Array.isArray(ups) && ups.length > 0) {
        previousPlan = ups[0];
      }
    } catch (e) {
      // ignore
    }

    // mark user as verified
    await userModel.verifyUser(id);
    // mark user as active (payment validated)
    try {
      await userModel.setActive(id, true);
    } catch (e) {
      console.warn('confirmPaymentAndValidate: could not set user active', e.message || e);
    }

    // create invoice record
    const invoice = await invoiceModel.createInvoice({ utilisateur_id: id, plan_id, amount, currency, reference, status: 'paid' });

    // create subscription if plan provided
    let subscription = null;
    if (plan_id) {
      subscription = await planModel.subscribeUser({ utilisateur_id: id, plan_id, start_date: null, end_date: null, status: 'active', payment_reference: reference, metadata: { invoice_id: invoice.id } });
    }

    // Create a commande record for bookkeeping and attach a paiement record
    let commande = null;
    let paiement = null;
    try {
      const numeroCommande = `CMD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      commande = await commandeModelLocal.createCommande({ utilisateur_id: id, numero_commande: numeroCommande, montant_total: amount, statut: 'En_traitement' });
        try {
        const moyen = payment_method || 'manual';
        paiement = await paiementModel.createPaiement({ commande_id: commande.id, montant: amount, moyen_paiement: moyen, statut: 'paid', reference_transaction: reference, image_paiement });
      } catch (e) {
        console.warn('Could not create paiement record:', e.message || e);
      }
    } catch (e) {
      console.warn('Could not create commande/paiement:', e.message || e);
    }

    // send invoice email to user
    const user = await userModel.findById(id);
    const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/auth`;
    // build rich email body with all references
    const prevPlanHtml = previousPlan ? `
      <li>Plan précédent: ${previousPlan.name || previousPlan.nom || '—'}</li>
      <li>Prix précédent: ${(Number(previousPlan.price_cents||0)/100).toLocaleString()} ${previousPlan.currency || 'XOF'}</li>
      <li>Début: ${previousPlan.start_date || ''}</li>
      <li>Statut précédent: ${previousPlan.status || previousPlan.state || '—'}</li>
    ` : `<li>Plan précédent: Aucun</li>`;

    const planHtml = plan_id ? (async () => {
      try {
        const p = await planModel.getPlanById(plan_id);
        return `
          <li>Plan demandé: ${p?.name || p?.nom || '—'}</li>
          <li>Prix demandé: ${(Number(p?.price_cents||0)/100).toLocaleString()} ${p?.currency || 'XOF'}</li>
        `;
      } catch (e) {
        return `<li>Plan demandé: ${plan_id}</li>`;
      }
    })() : `<li>Plan demandé: Aucun</li>`;

    // resolve planHtml promise if necessary
    let planHtmlResolved = '';
    if (plan_id) {
      try { planHtmlResolved = await planHtml; } catch (e) { planHtmlResolved = `<li>Plan demandé: ${plan_id}</li>`; }
    }

    const commandeHtml = commande ? `
      <li>Commande: #${commande.numero_commande || commande.id}</li>
      <li>Commande ID: ${commande.id}</li>
    ` : '<li>Commande: —</li>';

    const paiementHtml = paiement ? `
      <li>Paiement ID: ${paiement.id}</li>
      <li>Montant payé: ${paiement.montant || amount} ${currency}</li>
      <li>Méthode: ${paiement.moyen_paiement || payment_method || 'manual'}</li>
      <li>Référence transaction: ${paiement.reference_transaction || reference || '—'}</li>
      <li>Reçu: ${paiement.image_paiement ? `<a href="${paiement.image_paiement}">Voir le reçu</a>` : '—'}</li>
    ` : '<li>Paiement: —</li>';

    const subscriptionHtml = subscription ? `
      <li>Subscription ID: ${subscription.id}</li>
      <li>Statut subscription: ${subscription.status || subscription.state || 'active'}</li>
    ` : '<li>Subscription: créee si applicable</li>';

    const emailBody = `
      <p>Bonjour ${user.prenom || user.nom || ''},</p>
      <p>Nous confirmons la réception de votre demande de mise à niveau et du paiement associé. L'administration a validé votre demande.</p>
      <h3>Détails utilisateur</h3>
      <ul>
        <li>Utilisateur: ${user.prenom || ''} ${user.nom || ''} (${user.email})</li>
        <li>Utilisateur ID: ${user.id}</li>
      </ul>

      <h3>Plans</h3>
      <ul>
        ${prevPlanHtml}
        ${planHtmlResolved}
      </ul>

      <h3>Facture & Paiement</h3>
      <ul>
        <li>Facture ID: ${invoice.id}</li>
        <li>Montant facturé: ${amount} ${currency}</li>
        <li>Référence facture/paiement: ${reference}</li>
        ${commandeHtml}
        ${paiementHtml}
      </ul>

      <h3>Abonnement</h3>
      <ul>
        ${subscriptionHtml}
      </ul>

      <p>Vous pouvez vous connecter ici: <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Si vous avez des questions, contactez le support.</p>
      <p>Cordialement,<br/>L'équipe Portefolia</p>
    `;

    try {
      // send via configured provider (use MAILTRAP SMTP by setting EMAIL_PROVIDER=smtp and SMTP_* env vars)
      await sendEmail(user.email, 'Confirmation de paiement et facture', emailBody, { text: `Facture ${invoice.id} - ${amount} ${currency}` });
    } catch (err) {
      console.error('Failed to send invoice email:', err);
    }

    return res.json({ ok: true, invoice: invoice, subscription, commande, paiement });
  } catch (err) {
    console.error('admin.confirmPaymentAndValidate error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Portfolios admin ---
async function listPortfolios(req, res) {
  try {
    const userIdFilter = req.query.user_id ? String(req.query.user_id) : null;
    if (userIdFilter) {
      // Return portfolios for a specific utilisateur_id (no pagination)
      const rows = await portfolioModel.findByUser(userIdFilter);
      return res.json({ portfolios: rows });
    }

    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const include = (req.query.include || '').toString();
    const sort = (req.query.sort || '').toString();

    let orderClause = 'p.date_creation DESC';
    if (sort === 'user') orderClause = 'u.prenom ASC, u.nom ASC';
    else if (sort === 'views') orderClause = '(SELECT COUNT(*) FROM visites v WHERE v.portfolio_id = p.id) DESC';

    // fetch portfolios with visit counts and owner info
    const [rows] = await pool.query(
      `SELECT p.*, u.email AS owner_email, u.nom AS owner_nom, u.prenom AS owner_prenom,
              (SELECT COUNT(*) FROM visites v WHERE v.portfolio_id = p.id) AS views_count
       FROM portfolios p
       LEFT JOIN utilisateurs u ON u.id = p.utilisateur_id
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`, [limit, offset]
    );

    // attach owner object and (optionally) owner plan info
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

    for (const r of rows) {
      r.owner = {
        id: r.utilisateur_id,
        first_name: r.owner_prenom || null,
        last_name: r.owner_nom || null,
        email: r.owner_email || null,
      };
      const plan = plansByOwner[r.utilisateur_id] || null;
      r.owner_plan = plan ? { id: plan.id, slug: plan.slug || null, name: plan.name || null } : null;
      r.plan_name = plan ? (plan.name || plan.slug) : null;
      if (r.owner && r.owner_plan) r.owner.plan_name = r.plan_name;

    }

    // If include=stats, compute aggregated stats and distributions
    if (include.includes('stats')) {
      const total = rows.length;
      const deletedCount = rows.filter(r => r.deleted_at).length || 0;
      const isPublic = (p) => (p?.is_public === true || p?.is_public === 1 || p?.est_public === 1);
      const publicCount = rows.filter((p) => isPublic(p) && !p.deleted_at).length || 0;
      const privateCount = rows.filter((p) => !isPublic(p) && !p.deleted_at).length || 0;
      const totalViews = rows.reduce((acc, r) => acc + (Number(r.views_count || 0) || 0), 0);
      const activeCount = total - deletedCount;
      const avgViews = activeCount > 0 ? Math.round(totalViews / activeCount) : 0;

      const byPlan = rows.reduce((acc, r) => {
        const slug = (r.owner_plan && (r.owner_plan.slug || r.owner_plan.name)) ? (r.owner_plan.slug || r.owner_plan.name) : 'Gratuit';
        acc[slug] = (acc[slug] || 0) + 1;
        return acc;
      }, {});

      const byDomain = rows.reduce((acc, r) => {
        const domain = r.custom_domain || r.domain_name || 'default';
        acc[domain] = (acc[domain] || 0) + 1;
        return acc;
      }, {});

      const byUser = rows.reduce((acc, r) => {
        const uid = r.utilisateur_id || 'unknown';
        const name = `${r.owner?.first_name || ''} ${r.owner?.last_name || ''}`.trim() || r.owner?.email || uid;
        if (!acc[uid]) acc[uid] = { count: 0, name };
        acc[uid].count += 1;
        return acc;
      }, {});

      const topPerforming = [...rows].sort((a, b) => (Number(b.views_count || 0) - Number(a.views_count || 0))).slice(0, 10);

      return res.json({ portfolios: rows, page, limit, stats: {
        total,
        public: publicCount,
        private: privateCount,
        deleted: deletedCount,
        totalViews,
        avgViews,
        byPlan,
        byDomain,
        byUser,
        growth30d: 0,
        topPerforming,
      } });
    }

    return res.json({ portfolios: rows, page, limit });
  } catch (err) {
    console.error('admin.listPortfolios error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getPortfolio(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const p = await portfolioModel.findByIdWithRelations(id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    // gather visits last 30 days count
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM visites WHERE portfolio_id = ? AND date_visite >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)', [id]);
    p.visit_count_30d = rows && rows[0] ? rows[0].cnt : 0;
    return res.json({ portfolio: p });
  } catch (err) {
    console.error('admin.getPortfolio error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updatePortfolioAdmin(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const updated = await portfolioModel.updatePortfolio(id, req.body);
    return res.json({ portfolio: updated });
  } catch (err) {
    console.error('admin.updatePortfolio error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deletePortfolio(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    await pool.query('DELETE FROM portfolios WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.deletePortfolio error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function featurePortfolio(req, res) {
  try {
    const id = Number(req.params.id);
    const featured = req.body.featured === true;
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    // We'll use a simple boolean column featured (create if not exists)
    try {
      await pool.query("ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE");
    } catch (err) {
      // ignore
    }
    await pool.query('UPDATE portfolios SET featured = ? WHERE id = ?', [featured ? 1 : 0, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.featurePortfolio error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Commandes admin ---
async function adminListCommandes(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    // filters: status, user_id, date_from, date_to
    const where = [];
    const params = [];
    if (req.query.status) { where.push('statut = ?'); params.push(req.query.status); }
    if (req.query.user_id) { where.push('utilisateur_id = ?'); params.push(Number(req.query.user_id)); }
    if (req.query.date_from) { where.push('date_commande >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to) { where.push('date_commande <= ?'); params.push(req.query.date_to); }
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const [rows] = await pool.query(`SELECT * FROM commandes ${whereSql} ORDER BY date_commande DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return res.json({ commandes: rows, page, limit });
  } catch (err) {
    console.error('admin.adminListCommandes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function adminGetCommande(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const commande = await commandeModelLocal.findById(id);
    if (!commande) return res.status(404).json({ error: 'Not found' });
    const cards = await pool.query('SELECT * FROM cartes_nfc WHERE commande_id = ?', [commande.id]);
    return res.json({ commande, cards: cards && cards[0] ? cards[0] : [] });
  } catch (err) {
    console.error('admin.adminGetCommande error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function adminUpdateCommandeStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { statut } = req.body;
    if (!id || !statut) return res.status(400).json({ error: 'Invalid payload' });
    const updated = await commandeModelLocal.updateStatus(id, statut);
    return res.json({ commande: updated });
  } catch (err) {
    console.error('admin.adminUpdateCommandeStatus error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Generate a simple invoice HTML for a commande (fallback, no PDF rendering)
async function getCommandeInvoicePdf(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid commande id' });
    const commande = await commandeModelLocal.findById(id);
    if (!commande) return res.status(404).json({ error: 'Not found' });
    const [cardsRows] = await pool.query('SELECT * FROM cartes_nfc WHERE commande_id = ?', [commande.id]);
    const user = await userModel.findById(commande.utilisateur_id);

    const logoUrl = (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '') + '/lovable-uploads/logo_portefolia_remove_bg.png';

    const itemsHtml = (cardsRows && cardsRows[0] ? cardsRows[0] : []).map((c) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd">${c.id}</td>
        <td style="padding:8px;border:1px solid #ddd">${c.design || '—'}</td>
        <td style="padding:8px;border:1px solid #ddd">${c.uid_nfc || '—'}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html>
      <head><meta charset="utf-8"><title>Facture ${commande.numero_commande || commande.id}</title></head>
      <body style="font-family:Arial,Helvetica,sans-serif;color:#222">
        <div style="max-width:800px;margin:0 auto">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div><img src="${logoUrl}" alt="logo" style="height:60px;object-fit:contain"/></div>
            <div style="text-align:right"><h2>Facture</h2><div>Commande: ${commande.numero_commande || commande.id}</div><div>Date: ${commande.date_commande || ''}</div></div>
          </div>
          <hr/>
          <h3>Client</h3>
          <div>${user ? `${user.prenom || ''} ${user.nom || ''} &lt;${user.email || ''}&gt;` : '—'}</div>
          <h3>Détails</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th style="padding:8px;border:1px solid #ddd">ID</th>
                <th style="padding:8px;border:1px solid #ddd">Design</th>
                <th style="padding:8px;border:1px solid #ddd">UID NFC</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || '<tr><td colspan="3" style="padding:8px;border:1px solid #ddd">Aucun item</td></tr>'}
            </tbody>
          </table>
          <h3>Total: ${commande.montant_total || '0'}</h3>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('admin.getCommandeInvoicePdf error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Cartes admin ---
async function listCartes(req, res) {
  try {
    const q = await carteModel.findAll({ page: req.query.page, limit: req.query.limit, statut: req.query.statut, commande_id: req.query.commande_id });
    return res.json(q);
  } catch (err) {
    console.error('admin.listCartes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getCarte(req, res) {
  try {
    const id = Number(req.params.id);
    const c = await carteModel.findById(id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    return res.json({ carte: c });
  } catch (err) {
    console.error('admin.getCarte error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function assignUidCarte(req, res) {
  try {
    const id = Number(req.params.id);
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const updated = await carteModel.assignUid(id, uid);
    return res.json({ carte: updated });
  } catch (err) {
    console.error('admin.assignUidCarte error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function setCarteStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { statut } = req.body;
    if (!statut) return res.status(400).json({ error: 'statut required' });
    const updated = await carteModel.setStatus(id, statut);
    return res.json({ carte: updated });
  } catch (err) {
    console.error('admin.setCarteStatus error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteCarte(req, res) {
  try {
    const id = Number(req.params.id);
    await carteModel.deleteCarte(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.deleteCarte error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Paiements admin ---
async function listPaiements(req, res) {
  try {
    const status = req.query.status || null;
    const user_id = req.query.user_id || null;
    const q = await paiementModel.list({ page: req.query.page, limit: req.query.limit, status, user_id });
    return res.json(q);
  } catch (err) {
    console.error('admin.listPaiements error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Admin: upcoming abonnements (next N days)
async function listAbonnementsUpcoming(req, res) {
  try {
    const days = Math.max(Number(req.query.days) || 30, 1);
    const [rows] = await pool.query(`
      SELECT a.*, u.id AS user_id, u.prenom, u.nom, u.email, p.name AS plan_name
      FROM abonnements a
      LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
      LEFT JOIN plans p ON p.id = a.plan_id
      WHERE a.statut IN ('active','pending')
        AND a.end_date IS NOT NULL
        AND a.end_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL ? DAY)
      ORDER BY a.end_date ASC
    `, [days]);
    return res.json({ abonnements: rows || [] });
  } catch (err) {
    console.error('admin.listAbonnementsUpcoming error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getPaiement(req, res) {
  try {
    const id = Number(req.params.id);
    const p = await paiementModel.findById(id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    return res.json({ paiement: p });
  } catch (err) {
    console.error('admin.getPaiement error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updatePaiementStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const updated = await paiementModel.updateStatus(id, status);
    return res.json({ paiement: updated });
  } catch (err) {
    console.error('admin.updatePaiementStatus error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Notifications admin ---
async function listNotifications(req, res) {
  try {
    const q = await notificationModel.list({ page: req.query.page, limit: req.query.limit });
    return res.json(q);
  } catch (err) {
    console.error('admin.listNotifications error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function createNotification(req, res) {
  try {
    const { user_id = null, titre, message, meta = null, send = false } = req.body;
    if (!titre || !message) return res.status(400).json({ error: 'titre and message required' });
    const n = await notificationModel.createNotification({ user_id, titre, message, meta });
    if (send) {
      // mock sending: mark sent and log
      await notificationModel.markSent(n.id);
      console.log('Mock send notification', n.id, 'to', user_id);
    }
    return res.status(201).json({ notification: n });
  } catch (err) {
    console.error('admin.createNotification error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Invoices admin ---
async function listInvoices(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = (page - 1) * limit;

    // filters: q (reference, email, id), reference, user_email, date_from, date_to
    const where = [];
    const params = [];
    if (req.query.reference) { where.push('i.reference = ?'); params.push(req.query.reference); }
    if (req.query.user_email) { where.push('u.email LIKE ?'); params.push('%' + req.query.user_email + '%'); }
    if (req.query.date_from) { where.push('i.created_at >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to) { where.push('i.created_at <= ?'); params.push(req.query.date_to); }
    if (req.query.q) {
      where.push('(i.reference LIKE ? OR u.email LIKE ? OR i.id = ?)');
      params.push('%' + req.query.q + '%', '%' + req.query.q + '%', Number(req.query.q) || 0);
    }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

    // total count for pagination
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS cnt FROM invoices i LEFT JOIN utilisateurs u ON u.id = i.utilisateur_id ${whereSql}`, params);
    const total = countRow ? Number(countRow.cnt || 0) : 0;

    const sql = `SELECT i.*, u.email AS user_email, u.prenom AS user_first, u.nom AS user_last, p.name AS plan_name
       FROM invoices i
       LEFT JOIN utilisateurs u ON u.id = i.utilisateur_id
       LEFT JOIN plans p ON p.id = i.plan_id
       ${whereSql}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`;

    const [rows] = await pool.query(sql, params.concat([limit, offset]));
    return res.json({ invoices: rows || [], page, limit, total });
  } catch (err) {
    console.error('admin.listInvoices error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getInvoiceById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const inv = await invoiceModel.findById(id);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    const [rows] = await pool.query('SELECT id, email, nom, prenom FROM utilisateurs WHERE id = ? LIMIT 1', [inv.utilisateur_id]);
    inv.user = rows && rows[0] ? rows[0] : null;
    if (inv.plan_id) {
      try { const p = await planModel.getPlanById(inv.plan_id); inv.plan = p; } catch (e) { inv.plan = null; }
    }
    return res.json({ invoice: inv });
  } catch (err) {
    console.error('admin.getInvoiceById error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getInvoiceByReference(req, res) {
  try {
    const ref = req.query.reference;
    if (!ref) return res.status(400).json({ error: 'reference required' });
    const [rows] = await pool.query('SELECT * FROM invoices WHERE reference = ? LIMIT 1', [ref]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const inv = rows[0];
    return res.json({ invoice: inv });
  } catch (err) {
    console.error('admin.getInvoiceByReference error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Return a simple HTML representation of the invoice (front-end can open and print to PDF)
async function getInvoiceHtml(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send('Invalid id');
    const inv = await invoiceModel.findById(id);
    if (!inv) return res.status(404).send('Not found');
    const [rows] = await pool.query('SELECT id, email, nom, prenom FROM utilisateurs WHERE id = ? LIMIT 1', [inv.utilisateur_id]);
    const user = rows && rows[0] ? rows[0] : { email: '—', nom: '', prenom: '' };
    const invoiceNumber = `INV-${new Date(inv.created_at || inv.createdAt || Date.now()).toISOString().slice(0,7).replace('-','')}-${inv.id}`;
    const amount = (Number(inv.amount || inv.montant || 0));
    const currency = inv.currency || 'XOF';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Facture ${invoiceNumber}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}h1{color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd}</style></head><body><h1>Facture ${invoiceNumber}</h1><p>Date: ${new Date(inv.created_at || inv.createdAt || Date.now()).toLocaleString('fr-FR')}</p><h2>Client</h2><p>${user.prenom || ''} ${user.nom || ''}<br/>${user.email || ''}</p><h2>Détails</h2><table><tr><th>Description</th><th>Montant</th></tr><tr><td>Facture #${inv.id}${inv.plan_id ? ' — plan ' + (inv.plan_id) : ''}</td><td style="text-align:right">${amount.toLocaleString('fr-FR')} ${currency}</td></tr><tr><td style="text-align:right;font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${amount.toLocaleString('fr-FR')} ${currency}</td></tr></table><p>Référence: ${inv.reference || '—'}</p><p>Merci pour votre paiement.</p></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('admin.getInvoiceHtml error:', err);
    return res.status(500).send('Server error');
  }
}

// Generate PDF for invoice (uses puppeteer if available). Returns PDF binary.
async function getInvoicePdf(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send('Invalid id');
    // reuse HTML generation
    const inv = await invoiceModel.findById(id);
    if (!inv) return res.status(404).send('Not found');

    // build same HTML as getInvoiceHtml
    const [rows] = await pool.query('SELECT id, email, nom, prenom FROM utilisateurs WHERE id = ? LIMIT 1', [inv.utilisateur_id]);
    const user = rows && rows[0] ? rows[0] : { email: '—', nom: '', prenom: '' };
    const invoiceNumber = `INV-${new Date(inv.created_at || inv.createdAt || Date.now()).toISOString().slice(0,7).replace('-','')}-${inv.id}`;
    const amount = (Number(inv.amount || inv.montant || 0));
    const currency = inv.currency || 'XOF';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Facture ${invoiceNumber}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}h1{color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd}</style></head><body><h1>Facture ${invoiceNumber}</h1><p>Date: ${new Date(inv.created_at || inv.createdAt || Date.now()).toLocaleString('fr-FR')}</p><h2>Client</h2><p>${user.prenom || ''} ${user.nom || ''}<br/>${user.email || ''}</p><h2>Détails</h2><table><tr><th>Description</th><th>Montant</th></tr><tr><td>Facture #${inv.id}${inv.plan_id ? ' — plan ' + (inv.plan_id) : ''}</td><td style="text-align:right">${amount.toLocaleString('fr-FR')} ${currency}</td></tr><tr><td style="text-align:right;font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${amount.toLocaleString('fr-FR')} ${currency}</td></tr></table><p>Référence: ${inv.reference || '—'}</p><p>Merci pour votre paiement.</p></body></html>`;

    // Try to use puppeteer if installed
    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${inv.id}.pdf"`);
      return res.send(pdfBuffer);
    } catch (e) {
      console.warn('puppeteer not available or failed, falling back to HTML:', e.message || e);
      // fallback: return HTML as text with content-type that browser can render
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
  } catch (err) {
    console.error('admin.getInvoicePdf error:', err);
    return res.status(500).send('Server error');
  }
}

// Generate PDF for a commande (order) with company logo embedded
async function getCommandeInvoicePdf(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send('Invalid id');

    const [rows] = await pool.query('SELECT c.*, u.email, u.nom, u.prenom FROM commandes c LEFT JOIN utilisateurs u ON u.id = c.utilisateur_id WHERE c.id = ? LIMIT 1', [id]);
    const cmd = rows && rows[0] ? rows[0] : null;
    if (!cmd) return res.status(404).send('Not found');

    // fetch related cartes for details (if any)
    const [cartes] = await pool.query('SELECT id, uid_nfc, lien_portfolio, statut FROM cartes_nfc WHERE commande_id = ?', [id]);

    const orderNumber = `CMD-${new Date(cmd.date_commande || Date.now()).toISOString().slice(0,10).replace(/-/g,'')}-${cmd.id}`;
    const amount = Number(cmd.montant_total || 0);
    const currency = 'F CFA';
    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    // prefer public upload path if available
    const logoUrl = `${baseUrl}/lovable-uploads/logo_portefolia_remove_bg.png`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Facture ${orderNumber}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}h1{color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd}header{display:flex;align-items:center;gap:16px;margin-bottom:20px}header img{height:60px}</style></head><body><header><img src="${logoUrl}" alt="Logo"/><div><h1>Facture ${orderNumber}</h1><div>Date: ${new Date(cmd.date_commande || Date.now()).toLocaleString('fr-FR')}</div></div></header><h2>Client</h2><p>${cmd.prenom || ''} ${cmd.nom || ''}<br/>${cmd.email || ''}</p><h2>Détails</h2><table><tr><th>Description</th><th>Montant</th></tr><tr><td>Commande #${cmd.id}</td><td style="text-align:right">${amount.toLocaleString('fr-FR')} ${currency}</td></tr><tr><td style="text-align:right;font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${amount.toLocaleString('fr-FR')} ${currency}</td></tr></table>`
      + (cartes && cartes.length ? `<h3 class="mt-4">Cartes associées (${cartes.length})</h3><ul>${cartes.map(cc=>`<li>UID: ${cc.uid_nfc || '—'} — statut: ${cc.statut || '—'}</li>`).join('')}</ul>` : '')
      + `<p>Référence commande: ${cmd.numero_commande || '—'}</p><p>Merci pour votre confiance.</p></body></html>`;

    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="commande-${cmd.id}.pdf"`);
      return res.send(pdfBuffer);
    } catch (e) {
      console.warn('puppeteer not available or failed for commande PDF, returning HTML fallback', e.message || e);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
  } catch (err) {
    console.error('admin.getCommandeInvoicePdf error:', err);
    return res.status(500).send('Server error');
  }
}

// --- Admin users (super-admin management) ---
const bcrypt = require('bcrypt');
const adminUserModel = require('../models/adminUserModel');

async function listAdminUsers(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT a.id, a.email, a.full_name, a.role_id, r.name AS role_name, a.is_active, a.created_at
       FROM admin_users a
       LEFT JOIN roles r ON r.id = a.role_id
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`, [limit, offset]
    );
    return res.json({ admins: rows || [], page, limit });
  } catch (err) {
    console.error('admin.listAdminUsers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function createAdminUser(req, res) {
  try {
    const { full_name, email, password, role_id = null, is_active = true } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await adminUserModel.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already exists', field: 'email' });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query('INSERT INTO admin_users (email, password_hash, full_name, role_id, is_active) VALUES (?, ?, ?, ?, ?)', [email, hash, full_name, role_id, is_active ? 1 : 0]);
    const created = await adminUserModel.findById(result.insertId);
    if (created) delete created.password_hash;
    return res.status(201).json({ admin: created });
  } catch (err) {
    console.error('admin.createAdminUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateAdminUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { full_name, email, password, role_id, is_active } = req.body;
    const patch = [];
    const params = [];
    if (full_name !== undefined) { patch.push('full_name = ?'); params.push(full_name); }
    if (email !== undefined) { patch.push('email = ?'); params.push(email); }
    if (role_id !== undefined) { patch.push('role_id = ?'); params.push(role_id); }
    if (is_active !== undefined) { patch.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      patch.push('password_hash = ?'); params.push(hash);
    }
    if (patch.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    const sql = `UPDATE admin_users SET ${patch.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await pool.query(sql, params);
    const updated = await adminUserModel.findById(id);
    if (updated) delete updated.password_hash;
    return res.json({ admin: updated });
  } catch (err) {
    console.error('admin.updateAdminUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteAdminUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    // remove admin user
    await pool.query('DELETE FROM admin_users WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.deleteAdminUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Public roles listing (used by frontend to populate role select)
async function listRoles(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, name, description FROM roles ORDER BY id ASC');
    return res.json({ roles: rows || [] });
  } catch (err) {
    console.error('admin.listRoles error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  listUsers, listCommandes, getUser, activateUser, deactivateUser, deleteUser, permanentDeleteUser,
  updateUser, getUserPlans, changeUserPlan, getUserCartes,
  listPortfolios, getPortfolio, updatePortfolioAdmin, deletePortfolio, featurePortfolio,
  adminListCommandes, adminGetCommande, adminUpdateCommandeStatus,
  listCartes, getCarte, assignUidCarte, setCarteStatus, deleteCarte,
  listPaiements, getPaiement, updatePaiementStatus,
  listNotifications, createNotification
};
// export getUserSessions
module.exports.getUserSessions = getUserSessions;
// attach invoice endpoints
module.exports.listInvoices = listInvoices;
module.exports.getInvoiceById = getInvoiceById;
module.exports.getInvoiceByReference = getInvoiceByReference;
module.exports.getInvoiceHtml = getInvoiceHtml;
module.exports.getInvoicePdf = getInvoicePdf;
module.exports.getCommandeInvoicePdf = getCommandeInvoicePdf;

// Export verifyUser so admin route can access it
module.exports.verifyUser = verifyUser;

// Export pending user list and confirm-payment handler
module.exports.listPendingUsers = listPendingUsers;
module.exports.confirmPaymentAndValidate = confirmPaymentAndValidate;

// Expose upgrade management endpoints
module.exports.listUpgrades = listUpgrades;
module.exports.getUpgrade = getUpgrade;
module.exports.approveUpgrade = approveUpgrade;

// --- Analytics / Reports ---
async function totals(req, res) {
  try {
    const [[u]] = await pool.query('SELECT COUNT(*) AS total_users FROM utilisateurs');
    const [[p]] = await pool.query('SELECT COUNT(*) AS total_portfolios FROM portfolios');
    const [[c]] = await pool.query('SELECT COUNT(*) AS total_commandes FROM commandes');
    const [[cards]] = await pool.query('SELECT COUNT(*) AS total_cartes FROM cartes_nfc');
    return res.json({ total_users: u.total_users, total_portfolios: p.total_portfolios, total_commandes: c.total_commandes, total_cartes: cards.total_cartes });
  } catch (err) {
    console.error('admin.totals error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function monthlyVisits(req, res) {
  try {
    // visits per month for last 12 months
    const [rows] = await pool.query(`
      SELECT DATE_FORMAT(date_visite, '%Y-%m') AS month, COUNT(*) AS visits
      FROM visites
      WHERE date_visite >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `);
    return res.json({ visits: rows });
  } catch (err) {
    console.error('admin.monthlyVisits error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function monthlyRevenue(req, res) {
  try {
    // Aggregate revenue from both commandes and invoices to include admin-generated invoices
    const [rows] = await pool.query(`
      SELECT month, SUM(amount) AS revenue FROM (
        SELECT DATE_FORMAT(date_commande, '%Y-%m') AS month, montant_total AS amount
        FROM commandes
        WHERE date_commande >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
        UNION ALL
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, amount AS amount
        FROM invoices
        WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      ) t
      GROUP BY month
      ORDER BY month ASC
    `);
    return res.json({ revenue: rows });
  } catch (err) {
    console.error('admin.monthlyRevenue error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Return sessions for a given user (from `sessions` table) — admin only
async function getUserSessions(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const limit = Math.min(Number(req.query.limit) || 200, 2000);
    // sessions table may vary in column names; return rows as-is for admin UI
    const [rows] = await pool.query('SELECT * FROM sessions WHERE utilisateur_id = ? ORDER BY created_at DESC LIMIT ?', [id, limit]);
    return res.json({ sessions: rows || [] });
  } catch (err) {
    console.error('admin.getUserSessions error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function exportCommandesCsv(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM commandes ORDER BY date_commande DESC');
    // simple CSV
    const keys = Object.keys(rows[0] || {});
    const csv = [keys.join(',')].concat(rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="commandes.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('admin.exportCommandesCsv error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function exportInvoicesCsv(req, res) {
  try {
    const [rows] = await pool.query('SELECT i.*, u.email AS user_email, u.prenom AS user_first, u.nom AS user_last FROM invoices i LEFT JOIN utilisateurs u ON u.id = i.utilisateur_id ORDER BY i.created_at DESC');
    const keys = Object.keys(rows[0] || {});
    const csv = [keys.join(',')].concat(rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('admin.exportInvoicesCsv error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- Webhooks ---
async function paymentWebhook(req, res) {
  try {
    // Basic mock webhook receiver. In production verify signatures.
    const payload = req.body;
    console.log('Received payment webhook:', payload);
    // Example: update paiement status by reference
    if (payload && payload.reference && payload.status) {
      await pool.query('UPDATE paiements SET statut = ? WHERE reference_transaction = ?', [payload.status, payload.reference]);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('paymentWebhook error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Append to exports
module.exports.totals = totals;
module.exports.monthlyVisits = monthlyVisits;
module.exports.monthlyRevenue = monthlyRevenue;
module.exports.exportCommandesCsv = exportCommandesCsv;
module.exports.paymentWebhook = paymentWebhook;

// export revenue endpoints
module.exports.revenueSummary = revenueSummary;
module.exports.revenueByUser = revenueByUser;
module.exports.statsPlatform = statsPlatform;
module.exports.statsPlansDistribution = statsPlansDistribution;
module.exports.statsUsers = statsUsers;
module.exports.statsPortfolios = statsPortfolios;
module.exports.statsCommandes = statsCommandes;
module.exports.dashboardStats = dashboardStats;

// --- Additional stats endpoints used by frontend /api/admin/stats/* ---
async function statsPlatform(req, res) {
  try {
    // Count visits by user_agent heuristic (mobile vs desktop)
    const [totRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM visites`);
    const total = totRows && totRows[0] ? Number(totRows[0].cnt) : 0;
    const [mobRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM visites WHERE user_agent LIKE '%Mobile%' OR user_agent LIKE '%Android%' OR user_agent LIKE '%iPhone%'`);
    const mobile = mobRows && mobRows[0] ? Number(mobRows[0].cnt) : 0;
    const desktop = Math.max(0, total - mobile);
    return res.json({ stats: { web: desktop, mobile, desktop }, total });
  } catch (err) {
    console.error('admin.statsPlatform error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function statsPlansDistribution(req, res) {
  try {
    // Count active user_plans per plan
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.slug, COALESCE(COUNT(up.id),0) AS users_count
      FROM plans p
      LEFT JOIN user_plans up ON up.plan_id = p.id
      GROUP BY p.id
      ORDER BY users_count DESC
    `);
    return res.json({ distribution: rows || [] });
  } catch (err) {
    console.error('admin.statsPlansDistribution error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function statsUsers(req, res) {
  try {
    const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM utilisateurs WHERE deleted_at IS NULL');
    const [[activeRow]] = await pool.query('SELECT COUNT(*) AS active FROM utilisateurs WHERE is_active = 1 AND deleted_at IS NULL');
    const [[pendingRow]] = await pool.query("SELECT COUNT(*) AS pending FROM utilisateurs WHERE is_active = 0 AND deleted_at IS NULL");
    return res.json({ total: Number(totalRow.total || 0), active: Number(activeRow.active || 0), pending: Number(pendingRow.pending || 0) });
  } catch (err) {
    console.error('admin.statsUsers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function statsPortfolios(req, res) {
  try {
    const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM portfolios WHERE deleted_at IS NULL');
    const [[publicRow]] = await pool.query('SELECT COUNT(*) AS pub FROM portfolios WHERE (est_public = 1 OR est_public = TRUE) AND deleted_at IS NULL');
    const [[viewsRow]] = await pool.query('SELECT COALESCE(COUNT(*),0) AS total_views FROM visites');
    return res.json({ total: Number(totalRow.total || 0), public: Number(publicRow.pub || 0), totalViews: Number(viewsRow.total_views || 0) });
  } catch (err) {
    console.error('admin.statsPortfolios error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function statsCommandes(req, res) {
  try {
    const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM commandes');
    const [byStatus] = await pool.query('SELECT statut, COUNT(*) AS cnt FROM commandes GROUP BY statut');
    return res.json({ total: Number(totalRow.total || 0), byStatus: byStatus || [] });
  } catch (err) {
    console.error('admin.statsCommandes error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Aggregated dashboard stats endpoint
async function dashboardStats(req, res) {
  try {
    const [revTot] = await pool.query(`SELECT COALESCE(SUM(montant),0) AS total_revenue FROM paiements WHERE statut IN ('confirmed','paid','Réussi')`);
    const [[usersRow]] = await pool.query('SELECT COUNT(*) AS users FROM utilisateurs WHERE deleted_at IS NULL');
    const [[portRow]] = await pool.query('SELECT COUNT(*) AS portfolios FROM portfolios WHERE deleted_at IS NULL');
    const totalRevenue = revTot && revTot[0] ? Number(revTot[0].total_revenue) : 0;
    return res.json({ totalRevenue, users: Number(usersRow.users || 0), portfolios: Number(portRow.portfolios || 0) });
  } catch (err) {
    console.error('admin.dashboardStats error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
module.exports.revenueStream = revenueStream;
module.exports.exportInvoicesCsv = exportInvoicesCsv;

// Debug endpoint export
module.exports.usersDebug = usersDebug;
// Upcoming abonnements
module.exports.listAbonnementsUpcoming = listAbonnementsUpcoming;

// Admin users & roles exports
module.exports.listAdminUsers = listAdminUsers;
module.exports.createAdminUser = createAdminUser;
module.exports.updateAdminUser = updateAdminUser;
module.exports.deleteAdminUser = deleteAdminUser;
module.exports.listRoles = listRoles;

