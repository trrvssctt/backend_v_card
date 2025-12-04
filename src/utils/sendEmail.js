// utilitaire minimal pour envoyer un email. Remplace par Sendgrid/Mailgun en prod.
const nodemailer = require('nodemailer');

module.exports = async function sendEmail(to, subject, body, opts = {}) {
  // If SMTP env vars are present, use SMTP by default (convenient for Mailtrap).
  const hasSmtp = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
  const provider = process.env.EMAIL_PROVIDER || (hasSmtp ? 'smtp' : 'console');

  if (provider === 'console') {
    console.log('--- sendEmail (console) ---');
    console.log('to:', to);
    console.log('subject:', subject);
    console.log('body:', body);
    console.log('opts:', opts);
    console.log('---------------------------');
    return;
  }

  if (provider === 'smtp') {
    // Expect SMTP env vars (Mailtrap compatible)
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM || 'no-reply@example.com';

    if (!host || !user || !pass) {
      throw new Error('sendEmail: SMTP configuration missing (SMTP_HOST/SMTP_USER/SMTP_PASS)');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      auth: { user, pass },
      secure: port === 465
    });

    const mailOptions = {
      from,
      to,
      subject,
      html: body,
      text: opts.text || undefined,
      attachments: opts.attachments || undefined
    };

    const info = await transporter.sendMail(mailOptions);
    // log some details for debugging in dev
    console.log('sendEmail: message sent', { messageId: info.messageId, accepted: info.accepted });
    return info;
  }

  throw new Error('sendEmail: unknown provider');
};
