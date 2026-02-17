
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_123');

      const user = await prisma.utilisateur.findUnique({
        where: { id: decoded.id }
      });

      if (!user || !user.is_active) {
        return res.status(401).json({ success: false, message: 'Non autorisé, utilisateur inactif' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Session expirée ou invalide' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Non autorisé, pas de token' });
  }
};
