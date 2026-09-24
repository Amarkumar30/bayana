import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;
  // Dynamic import so nodemailer is optional; if not installed, emails are logged only
  try {
    const nodemailer = await import('nodemailer');
    if (config.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT ?? 587,
        secure: (config.SMTP_PORT ?? 587) === 465,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      });
      logger.info({ host: config.SMTP_HOST }, 'Email transport configured');
    } else {
      // Development: use ethereal.email test account
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      logger.info({ user: testAccount.user }, 'Using Ethereal dev email (preview URLs in logs)');
    }
  } catch (e) {
    logger.warn({ err: e }, 'nodemailer not available – emails will be logged only');
    transporter = null;
  }
  return transporter;
}

/** Sends an email. Falls back to console log if SMTP is not configured. */
export async function sendEmail({ to, subject, text, html }) {
  try {
    const transport = await getTransporter();
    if (!transport) {
      logger.info({ to, subject }, 'EMAIL (no-transport): would have sent email');
      return;
    }
    const info = await transport.sendMail({
      from: config.EMAIL_FROM || `"Bayana" <noreply@bayana.in>`,
      to, subject, text, html,
    });
    // Ethereal preview URL
    try {
      const nodemailer = await import('nodemailer');
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) logger.info({ preview, to, subject }, 'Email sent (Ethereal preview)');
    } catch { /* not ethereal */ }
    logger.info({ messageId: info.messageId, to, subject }, 'Email sent');
  } catch (e) {
    // Never throw – email failure should not break the request
    logger.error({ err: e, to, subject }, 'Failed to send email');
  }
}
