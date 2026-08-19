import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { env } from '../config/env.js';

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!transporter) {
    const opzioni: SMTPTransport.Options = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // Railway non ha una rete IPv6 in uscita funzionante: forziamo la
      // connessione a usare solo IPv4, direttamente qui (non basta
      // un'impostazione generale di Node, va detto anche al modulo che
      // apre davvero la connessione). "family" esiste davvero in
      // nodemailer anche se i tipi ufficiali non la elencano qui.
      family: 4,
    } as SMTPTransport.Options;
    transporter = nodemailer.createTransport(opzioni);
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
