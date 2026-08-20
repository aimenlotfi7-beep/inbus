import nodemailer from 'nodemailer';
import dns from 'node:dns/promises';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { env } from '../config/env.js';

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

/**
 * Crea (una sola volta) il collegamento email. Railway non ha una rete
 * IPv6 in uscita funzionante — e si è visto che dire a nodemailer
 * "usa IPv4" (family:4) NON basta: quell'opzione non viene davvero
 * applicata dal modulo che apre la connessione (verificato nel codice
 * della libreria). L'unico modo affidabile è risolvere l'indirizzo
 * IPv4 di Gmail NOI STESSI, e collegarci direttamente a quell'IP
 * invece che al nome "smtp.gmail.com" (che il sistema potrebbe
 * comunque risolvere in IPv6). Il nome host vero va comunque passato
 * a parte (servername), altrimenti il certificato di sicurezza non
 * risulterebbe valido per un IP nudo.
 */
async function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!transporter) {
    let host = env.SMTP_HOST;
    try {
      const indirizzi = await dns.resolve4(env.SMTP_HOST);
      if (indirizzi[0]) host = indirizzi[0];
    } catch {
      // Se la risoluzione IPv4 fallisce per qualche motivo, ripiega sul
      // nome host normale — meglio provare (e magari fallire più avanti
      // con lo stesso vecchio errore) che bloccare tutto qui.
    }
    const opzioni: SMTPTransport.Options = {
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // Ci colleghiamo a un indirizzo IP nudo (risolto sopra), quindi
      // nodemailer non saprebbe più a quale nome host verificare il
      // certificato di sicurezza — va detto esplicitamente qui, non
      // dentro "tls" (lì non viene letto per questo scopo).
      servername: env.SMTP_HOST,
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
export async function inviaEmail({ a, oggetto, html, allegati }: {
  a: string; oggetto: string; html: string;
  allegati?: { nomeFile: string; contenuto: Buffer; tipo: string }[];
}): Promise<{ inviata: boolean }> {
  const t = await getTransporter();
  if (!t) {
    console.log(`\n[EMAIL NON INVIATA — SMTP non configurato]\nA: ${a}\nOggetto: ${oggetto}\n${html.replace(/<[^>]+>/g, ' ').trim()}\n`);
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
    console.error(`Invio email a ${a} fallito:`, err);
    return { inviata: false };
  }
}
