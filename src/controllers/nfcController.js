import db from '../config/database.js';

export const createNFCOrder = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { portfolio_id, quantity = 1 } = req.body;
    if (!portfolio_id) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'portfolio_id requis' });
    }

    const orderId = `NFC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const totalPrice = Number(quantity) * 15000;

    await connection.query(
      'INSERT INTO nfc_orders (id, utilisateur_id, portfolio_id, quantity, total_price, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [orderId, req.user.id, portfolio_id, quantity, totalPrice, 'pending']
    );

    await connection.commit();

    const [rows] = await db.query('SELECT n.*, p.titre as portfolio_name FROM nfc_orders n LEFT JOIN portfolios p ON n.portfolio_id = p.id WHERE n.id = ?', [orderId]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const getMyNFCOrders = async (req, res, next) => {
  try {
    const [orders] = await db.query('SELECT n.*, p.titre as portfolio_name FROM nfc_orders n LEFT JOIN portfolios p ON n.portfolio_id = p.id WHERE n.utilisateur_id = ? ORDER BY n.created_at DESC', [req.user.id]);
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

export const getNFCOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT n.*, p.titre as portfolio_name FROM nfc_orders n LEFT JOIN portfolios p ON n.portfolio_id = p.id WHERE n.id = ?', [id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    if (order.utilisateur_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export default { createNFCOrder, getMyNFCOrders, getNFCOrderById };
