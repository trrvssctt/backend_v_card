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
const sendEmail = require('../utils/sendEmail');
const checkoutModel = require('../models/checkoutModel');

async function listUsers(req, res) {
  try {
    // simple pagination
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    // fetch users with portfolio counts
    const [rows] = await pool.query(
      `SELECT u.id,
              u.nom AS last_name,
              u.prenom AS first_name,
              u.email,
              u.role,
              u.verified,
              u.is_active,
              u.date_inscription AS created_at,
              (SELECT COUNT(*) FROM portfolios p WHERE p.utilisateur_id = u.id) AS portfolio_count,
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
       ORDER BY u.date_inscription DESC
       LIMIT ? OFFSET ?`, [limit, offset]
    );
    return res.json({ users: rows, page, limit });
  } catch (err) {
    console.error('admin.listUsers error:', err);
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
      const body = `<p>Bonjour ${user.prenom || user.nom || ''},</p><p>Votre demande de mise à niveau a été approuvée par l'administration. Votre compte est désormais à la nouvelle formule.</p>`;
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
    await userModel.deleteUser(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin.deleteUser error:', err);
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
    const loginUrl = `${process.env.APP_URL || 'https://backend-v-card.onrender.com'}/auth`;
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
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    // fetch portfolios with visit counts and owner info
    const [rows] = await pool.query(
      `SELECT p.*, u.email AS owner_email, u.nom AS owner_nom, u.prenom AS owner_prenom,
              (SELECT COUNT(*) FROM visites v WHERE v.portfolio_id = p.id) AS visit_count
       FROM portfolios p
       LEFT JOIN utilisateurs u ON u.id = p.utilisateur_id
       ORDER BY p.date_creation DESC
       LIMIT ? OFFSET ?`, [limit, offset]
    );
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
    const q = await paiementModel.list({ page: req.query.page, limit: req.query.limit });
    return res.json(q);
  } catch (err) {
    console.error('admin.listPaiements error:', err);
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

module.exports = {
  listUsers, listCommandes, getUser, activateUser, deactivateUser, deleteUser,
  listPortfolios, getPortfolio, updatePortfolioAdmin, deletePortfolio, featurePortfolio,
  adminListCommandes, adminGetCommande, adminUpdateCommandeStatus,
  listCartes, getCarte, assignUidCarte, setCarteStatus, deleteCarte,
  listPaiements, getPaiement, updatePaiementStatus,
  listNotifications, createNotification
};

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
module.exports.revenueStream = revenueStream;

