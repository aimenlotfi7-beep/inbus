import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/** URL pubblico del sito, per costruire i link nelle email (es.
 *  "https://inbus-eosin.vercel.app/finalizza/xyz"). */
export function urlSito(percorso: string) {
  const base = (env.FRONTEND_URL || env.CORS_ORIGIN).replace(/\/$/, '');
  return `${base}${percorso.startsWith('/') ? '' : '/'}${percorso}`;
}

/**
 * Invia un'email. Se SMTP non è configurato (SMTP_HOST/USER/PASS
 * mancanti), non fallisce: stampa il contenuto nei log del server, così
 * il resto del flusso (lista d'attesa, promemoria saldo) continua a
 * funzionare anche prima di aver collegato un vero account email — utile
 * per testare, o per chi preferisce mandare i link a mano per ora.
 */
export async function inviaEmail({ a, oggetto, html }: { a: string; oggetto: string; html: string }): Promise<{ inviata: boolean }> {
  const t = getTransporter();
  if (!t) {
    console.log(`\n[EMAIL NON INVIATA — SMTP non configurato]\nA: ${a}\nOggetto: ${oggetto}\n${html.replace(/<[^>]+>/g, ' ').trim()}\n`);
    return { inviata: false };
  }
  try {
    await t.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to: a, subject: oggetto, html });
    return { inviata: true };
  } catch (err) {
    console.error(`Invio email a ${a} fallito:`, err);
    return { inviata: false };
  }
}
