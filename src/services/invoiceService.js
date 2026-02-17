
import prisma from '../config/prisma.js';

/**
 * Génère une facture pour un utilisateur.
 * @param {string} userId - ID de l'utilisateur.
 * @param {number} amount - Montant de la facture.
 * @param {string} planName - Nom du plan associé.
 */
export const generateInvoice = async (userId, amount, planName) => {
  try {
    const reference = `FAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const invoice = await prisma.invoice.create({
      data: {
        id: Math.random().toString(36).substr(2, 9),
        utilisateur_id: userId,
        amount: amount,
        currency: 'F CFA',
        reference: reference,
        status: 'paid',
        created_at: new Date()
      }
    });

    console.log(`[InvoiceService] Facture générée avec succès : ${reference}`);
    return invoice;
  } catch (error) {
    console.error('[InvoiceService] Erreur lors de la génération de la facture :', error);
    throw error;
  }
};
