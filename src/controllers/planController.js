
import db from '../config/database.js';

export const getPublicPlans = async (req, res, next) => {
  try {
    const [plans] = await db.query(`
      SELECT id, name, slug, description, price_cents, currency, billing_interval, features 
      FROM plans 
      WHERE deleted_at IS NULL AND is_public = 1 
      ORDER BY price_cents ASC
    `);

    const formattedPlans = plans.map(p => ({
      ...p,
      features: typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []),
      price: p.price_cents === 0 ? "0 F CFA" : `${p.price_cents.toLocaleString()} F CFA`,
      period: p.billing_interval === 'month' ? '/mois' : '/an'
    }));

    res.json({ success: true, data: formattedPlans });
  } catch (error) {
    next(error);
  }
};
