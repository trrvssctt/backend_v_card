
import nodemailer from 'nodemailer';

// Configuration du transporteur SMTP avec les identifiants Mailtrap fournis
const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "923bd1746c596a",
    pass: "dac5da38ed6051"
  }
});

/**
 * Envoie un email de bienvenue à un nouvel utilisateur.
 */
export const sendWelcomeEmail = async (email, firstName) => {
  console.log(`[MailService] Tentative d'envoi d'email de bienvenue à ${email}`);
  
  const mailOptions = {
    from: '"Portefolia" <noreply@portefolia.pro>',
    to: email,
    subject: 'Bienvenue sur Portefolia !',
    text: `Bonjour ${firstName}, bienvenue sur Portefolia. Votre vitrine professionnelle est prête !`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #22c55e; text-align: center;">Bienvenue sur Portefolia, ${firstName} !</h2>
        <p>Nous sommes ravis de vous compter parmi nous.</p>
        <p>Votre compte a été créé avec succès. Vous pouvez dès maintenant commencer à construire votre portfolio intelligent.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="http://localhost:3000/login" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Me connecter</a>
        </div>
        <p>L'équipe Portefolia</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[MailService] Email de bienvenue envoyé : ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[MailService] Erreur lors de l'envoi de l'email à ${email}:`, error);
    return false;
  }
};

/**
 * Envoie un email informant que l'inscription payante est en attente de validation.
 */
export const sendPendingValidationEmail = async (email, firstName, planName) => {
  console.log(`[MailService] Envoi email d'attente de validation à ${email}`);
  
  const mailOptions = {
    from: '"Portefolia" <noreply@portefolia.pro>',
    to: email,
    subject: 'Inscription Portefolia - Confirmation de réception',
    text: `Bonjour ${firstName}, votre inscription au plan ${planName} a bien été reçue et est en cours de validation.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #22c55e; text-align: center;">Presque prêt, ${firstName} !</h2>
        <p>Merci d'avoir choisi Portefolia et le plan <strong>${planName}</strong>.</p>
        <p>Nous avons bien reçu votre demande d'inscription ainsi que votre référence de paiement.</p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 20px 0;">
           <p style="margin: 0; font-size: 14px; font-weight: bold; color: #374151;">Votre compte est actuellement en cours de validation par nos administrateurs.</p>
           <p style="margin: 5px 0 0 0; font-size: 13px; color: #6b7280;">Vous recevrez un email de confirmation dès que votre accès sera activé (généralement sous 24h).</p>
        </div>
        <p>À très bientôt sur votre nouvelle vitrine professionnelle !</p>
        <br>
        <p>L'équipe Portefolia</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`[MailService] Erreur validation email:`, error);
    return false;
  }
};

/**
 * Envoie un email lors de la validation du compte par l'administrateur.
 */
export const sendAccountActivatedEmail = async (email, firstName) => {
  console.log(`[MailService] Envoi email d'activation de compte à ${email}`);
  
  const mailOptions = {
    from: '"Portefolia" <noreply@portefolia.pro>',
    to: email,
    subject: 'Votre compte Portefolia est activé !',
    text: `Félicitations ${firstName}, votre compte a été validé. Vous pouvez maintenant vous connecter.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #22c55e; text-align: center;">Bonne nouvelle, ${firstName} !</h2>
        <p>Votre compte Portefolia a été validé avec succès par nos administrateurs.</p>
        <p>Tous les services associés à votre plan sont désormais actifs. Vous pouvez commencer à construire votre avenir professionnel dès maintenant.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="http://localhost:3000/login" style="background-color: #22c55e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Accéder à ma console</a>
        </div>
        <p>Merci pour votre patience et votre confiance.</p>
        <br>
        <p>L'équipe Portefolia</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`[MailService] Erreur email activation:`, error);
    return false;
  }
};

/**
 * Envoie une facture par email.
 */
export const sendInvoiceEmail = async (email, invoiceUrl) => {
  const mailOptions = {
    from: '"Facturation Portefolia" <billing@portefolia.pro>',
    to: email,
    subject: 'Votre facture Portefolia est disponible',
    text: `Bonjour, votre facture est disponible à l'adresse suivante : ${invoiceUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #22c55e;">Votre facture</h2>
        <p>Bonjour,</p>
        <p>Merci pour votre confiance. Votre facture est désormais disponible en ligne.</p>
        <p><a href="${invoiceUrl}" style="background-color: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Consulter ma facture</a></p>
        <br>
        <p>L'équipe Portefolia</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[MailService] Facture envoyée : ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[MailService] Erreur lors de l'envoi de la facture à ${email}:`, error);
    return false;
  }

  
};

export const sendNFCOrderUpdateEmail = async (email, firstName, orderId, status) => {
  const statusLabels = {
    production: 'mise en production',
    shipped: 'expédiée',
    delivered: 'livrée'
  };

  const mailOptions = {
    from: '"Portefolia Logistique" <nfc@portefolia.pro>',
    to: email,
    subject: `Suivi de votre commande ${orderId} - Portefolia`,
    html: `
      <div style="font-family: sans-serif; padding: 30px; border: 1px solid #e2e8f0; border-radius: 20px;">
        <h2 style="color: #16a34a;">Bonne nouvelle, ${firstName} !</h2>
        <p>Votre commande de carte NFC <b>${orderId}</b> est désormais <b>${statusLabels[status]}</b>.</p>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px;">Status actuel : <span style="text-transform: uppercase; font-weight: bold; color: #16a34a;">${status}</span></p>
        </div>
        <p>Vous recevrez une nouvelle notification dès la prochaine étape.</p>
        <p>Merci de votre confiance,<br>L'équipe logistique Portefolia</p>
      </div>
    `
  };
  try { await transporter.sendMail(mailOptions); return true; } catch (e) { return false; }
};


