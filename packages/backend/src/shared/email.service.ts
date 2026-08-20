import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import dns from 'node:dns/promises';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { env } from '../config/env.js';

let resend: Resend | null = null;
let transporterSmtp: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

/**
 * Riserva SMTP, usata solo se Resend non è configurato — utile per lo
 * sviluppo in locale, dove SMTP normale funziona senza problemi. Su
 * Railway, in produzione, la porta SMTP tradizionale risulta bloccata
 * in uscita (verificato: gli stessi tentativi che funzionano in locale
 * restano appesi fino al timeout lassù) — per questo Resend, che manda
 * le email tramite una normale richiesta web, è il metodo preferito.
 */
async function getTransporterSmtp() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!transporterSmtp) {
    let host = env.SMTP_HOST;
    try {
      const indirizzi = await dns.resolve4(env.SMTP_HOST);
      if (indirizzi[0]) host = indirizzi[0];
    } catch {
      // Se la risoluzione IPv4 fallisce, ripiega sul nome host normale.
    }
    const opzioni: SMTPTransport.Options = {
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      servername: env.SMTP_HOST,
    } as SMTPTransport.Options;
    transporterSmtp = nodemailer.createTransport(opzioni);
  }
  return transporterSmtp;
}

/** URL pubblico del sito, per costruire i link nelle email (es.
 *  "https://inbus-eosin.vercel.app/finalizza/xyz"). */
export function urlSito(percorso: string) {
  const base = (env.FRONTEND_URL || env.CORS_ORIGIN).replace(/\/$/, '');
  return `${base}${percorso.startsWith('/') ? '' : '/'}${percorso}`;
}

/**
 * Invia un'email. Prova prima Resend (se configurato — metodo
 * preferito), poi SMTP come riserva. Se nessuno dei due è configurato,
 * non fallisce: stampa il contenuto nei log del server, così il resto
 * del flusso (lista d'attesa, promemoria saldo) continua a funzionare
 * anche prima di aver collegato un vero account email.
 */
export async function inviaEmail({ a, oggetto, html, allegati }: {
  a: string; oggetto: string; html: string;
  allegati?: { nomeFile: string; contenuto: Buffer; tipo: string }[];
}): Promise<{ inviata: boolean }> {
  const r = getResend();
  if (r) {
    try {
      const { error } = await r.emails.send({
        from: env.RESEND_FROM || 'INBUS <onboarding@resend.dev>',
        to: a,
        subject: oggetto,
        html,
        attachments: allegati?.map((al) => ({ filename: al.nomeFile, content: al.contenuto, content_type: al.tipo })),
      });
      if (error) throw error;
      return { inviata: true };
    } catch (err) {
      console.error(`Invio email (Resend) a ${a} fallito:`, err);
      return { inviata: false };
    }
  }

  const t = await getTransporterSmtp();
  if (!t) {
    console.log(`\n[EMAIL NON INVIATA — né Resend né SMTP configurati]\nA: ${a}\nOggetto: ${oggetto}\n${html.replace(/<[^>]+>/g, ' ').trim()}\n`);
    return { inviata: false };
  }
  try {
    await t.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: a,
      subject: oggetto,
      html,
      attachments: allegati?.map((al) => ({ filename: al.nomeFile, content: al.contenuto, contentType: al.tipo })),
    });
    return { inviata: true };
  } catch (err) {
    console.error(`Invio email (SMTP) a ${a} fallito:`, err);
    return { inviata: false };
  }
}
