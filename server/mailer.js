import nodemailer from 'nodemailer';
import { db, logActivity } from './db.js';

let transporter = null;

export function mailerMode() {
  return process.env.SMTP_HOST ? 'smtp' : 'outbox';
}

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
  return transporter;
}

/**
 * Kirim email. Tanpa SMTP_HOST, email disimpan ke tabel outbox dan bisa dibaca
 * di dashboard admin (menu Outbox). Jadi alur verifikasi tetap bisa dites.
 */
export async function sendMail({ to, subject, body }) {
  const tx = getTransporter();
  let sent = 0;
  let error = null;
  if (tx) {
    try {
      await tx.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'GLM <no-reply@glm.local>',
        to,
        subject,
        text: body
      });
      sent = 1;
    } catch (e) {
      error = String(e.message || e);
    }
  }
  db.prepare('INSERT INTO outbox (to_email, subject, body, sent, error) VALUES (?,?,?,?,?)').run(
    to,
    subject,
    body,
    sent,
    error
  );
  if (error) logActivity({ action: 'mail.error', detail: `${to}: ${error}` });
  return { sent: !!sent, error, mode: mailerMode() };
}
