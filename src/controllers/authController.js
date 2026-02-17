
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import db from '../config/database.js';
import * as mailService from '../services/mailService.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key_123', {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.utilisateur.findUnique({
      where: { id: req.user.id }
    });
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    
    // On masque le mot de passe
    const { mot_de_passe, ...userData } = user;
    res.json({ success: true, data: userData });
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const { nom, prenom, biographie, phone, photo_profil, currentPassword, newPassword } = req.body;
    const user = await prisma.utilisateur.findUnique({ where: { id: req.user.id } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const updateData = {
      nom: nom || user.nom,
      prenom: prenom || user.prenom,
      biographie: biographie !== undefined ? biographie : user.biographie,
      phone: phone !== undefined ? phone : user.phone,
      photo_profil: photo_profil !== undefined ? photo_profil : user.photo_profil
    };

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Le mot de passe actuel est requis pour changer de mot de passe.' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.mot_de_passe);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Le mot de passe actuel est incorrect.' });
      }

      const salt = await bcrypt.genSalt(12);
      updateData.mot_de_passe = await bcrypt.hash(newPassword, salt);
    }

    const updatedUser = await prisma.utilisateur.update({
      where: { id: req.user.id },
      data: updateData
    });

    const { mot_de_passe, ...userData } = updatedUser;
    res.json({ success: true, data: userData });
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { nom, prenom, email, mot_de_passe, planId, paymentRef, paymentMethod } = req.body;

    const exists = await prisma.utilisateur.findUnique({ where: { email } });
    if (exists) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    }

    // Récupérer les infos du plan
    const [plans] = await connection.query('SELECT * FROM plans WHERE id = ?', [planId]);
    const plan = plans[0];
    if (!plan) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Plan invalide' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(mot_de_passe, salt);
    const userId = Math.random().toString(36).substr(2, 9);

    // Déterminer le statut initial
    const isPaidPlan = plan.price_cents > 0;
    const initialActive = !isPaidPlan; // Actif si gratuit, inactif si payant (attente validation)
    const initialStatus = isPaidPlan ? 'en_attente' : 'actif';

    // 1. Créer l'utilisateur
    await connection.query(
      'INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, role, is_active, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, nom, prenom, email, hashedPassword, 'USER', initialActive, initialStatus]
    );

    // 2. Créer l'abonnement
    const subId = Math.random().toString(36).substr(2, 9);
    await connection.query(
      'INSERT INTO subscriptions (id, utilisateur_id, plan_id, status, amount, currency) VALUES (?, ?, ?, ?, ?, ?)',
      [subId, userId, planId, isPaidPlan ? 'trialing' : 'active', plan.price_cents, plan.currency]
    );

    // 3. Si payant, enregistrer la preuve de paiement
    if (isPaidPlan) {
      if (!paymentRef) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Référence de paiement requise pour ce plan' });
      }
      const payId = Math.random().toString(36).substr(2, 9);
      await connection.query(
        'INSERT INTO paiements (id, utilisateur_id, montant, devise, reference, methode, statut) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [payId, userId, plan.price_cents, plan.currency, paymentRef, paymentMethod || 'mobile', 'en_attente']
      );
      
      // Email d'attente
      await mailService.sendPendingValidationEmail(email, prenom, plan.name);
    } else {
      // Email de bienvenue classique
      await mailService.sendWelcomeEmail(email, prenom);
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: isPaidPlan 
        ? "Inscription enregistrée. Votre compte sera activé après validation de votre paiement."
        : "Compte créé avec succès ! Bienvenue.",
      data: {
        id: userId,
        email: email,
        is_active: initialActive,
        token: initialActive ? generateToken(userId) : null
      }
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, mot_de_passe } = req.body;

    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    const isMatch = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    if (!user.is_active) {
      const message = user.statut === 'en_attente' 
        ? "Votre compte est en attente de validation par l'administrateur." 
        : "Votre compte est désactivé. Veuillez contacter le support.";
      return res.status(403).json({ success: false, message });
    }

    await prisma.utilisateur.update({
      where: { id: user.id },
      data: { dernier_login: new Date() }
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role,
        token: generateToken(user.id)
      }
    });
  } catch (error) {
    next(error);
  }
};
