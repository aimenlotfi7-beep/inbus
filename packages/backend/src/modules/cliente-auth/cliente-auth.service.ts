import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { utenti } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { NonAutorizzato, ConflittoDati, NonTrovato } from '../../shared/errors.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';

export interface TokenCliente {
  tipo: 'cliente'; // marcatore: impedisce che un token admin/tour-leader venga scambiato per uno cliente
  sub: string;
  email: string;
}

const ORE_VALIDITA_TOKEN_VERIFICA = 48;

function generaToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function inviaEmailVerifica(email: string, nome: string, token: string) {
  const link = urlSito(`/verifica-email/${token}`);
  const { templateEmailService } = await import('../template-email/template-email.service.js');
  const { oggetto, html } = await templateEmailService.renderizza('verifica_email', {
    nome,
    link,
    ore_validita: String(ORE_VALIDITA_TOKEN_VERIFICA),
  });
  await inviaEmail({ a: email, oggetto, html });
}

export const clienteAuthService = {
  /** Registrazione — se l'email esiste già ma senza password (un
   *  cliente "vecchio", da prima che servisse un account), la fa
   *  diventare un account vero invece di rifiutarla: altrimenti chi ha
   *  già prenotato in passato resterebbe bloccato fuori per sempre. */
  async registrati(input: { email: string; password: string; nome: string; cognome: string; telefono?: string }) {
    const email = input.email.toLowerCase();
    const [esistente] = await db.select().from(utenti).where(eq(utenti.email, email)).limit(1);
    if (esistente?.passwordHash) throw new ConflittoDati('Esiste già un account con questa email — prova ad accedere, o recupera la password.');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const token = generaToken();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_VERIFICA * 60 * 60 * 1000);

    if (esistente) {
      await db.update(utenti).set({
        passwordHash, nome: input.nome, cognome: input.cognome,
        telefono: input.telefono ?? esistente.telefono,
        emailVerificata: false, tokenVerificaEmail: token, tokenVerificaScadenza: scadenza,
      }).where(eq(utenti.id, esistente.id));
    } else {
      await db.insert(utenti).values({
        email, passwordHash, nome: input.nome, cognome: input.cognome, telefono: input.telefono,
        tokenVerificaEmail: token, tokenVerificaScadenza: scadenza,
      });
    }

    await inviaEmailVerifica(email, input.nome, token);
  },

  /** Il click sul link nell'email — se va a buon fine, accede subito
   *  (non deve rifare login manualmente subito dopo). */
  async verificaEmail(token: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.tokenVerificaEmail, token)).limit(1);
    if (!u) throw new NonTrovato('Link di verifica');
    if (!u.tokenVerificaScadenza || u.tokenVerificaScadenza < new Date()) {
      throw new ConflittoDati('Questo link è scaduto — registrati di nuovo per riceverne uno valido.');
    }

    await db.update(utenti).set({ emailVerificata: true, tokenVerificaEmail: null, tokenVerificaScadenza: null }).where(eq(utenti.id, u.id));
    return this.emettiToken(u.id, u.email);
  },

  async login(email: string, password: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    if (!u || !u.passwordHash) throw new NonAutorizzato('Email o password non corrette.');

    const passwordOk = await bcrypt.compare(password, u.passwordHash);
    if (!passwordOk) throw new NonAutorizzato('Email o password non corrette.');
    if (!u.emailVerificata) throw new ConflittoDati('Devi prima confermare la tua email — controlla la posta (anche lo spam).');

    return this.emettiToken(u.id, u.email);
  },

  /** Rimanda l'email di verifica — utile se il cliente non la trova più
   *  o il link è scaduto. Non conferma né smentisce se l'email esiste
   *  già in modo diverso da questo (stesso messaggio sempre), per non
   *  far scoprire a chiunque quali email sono già registrate. */
  async rimandaVerifica(email: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    if (!u || !u.passwordHash || u.emailVerificata) return; // silenzioso apposta

    const token = generaToken();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_VERIFICA * 60 * 60 * 1000);
    await db.update(utenti).set({ tokenVerificaEmail: token, tokenVerificaScadenza: scadenza }).where(eq(utenti.id, u.id));
    await inviaEmailVerifica(u.email, u.nome ?? '', token);
  },

  emettiToken(utenteId: string, email: string) {
    const payload: TokenCliente = { tipo: 'cliente', sub: utenteId, email };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
    return { token };
  },

  verificaToken(token: string): TokenCliente {
    try {
      const dati = jwt.verify(token, env.JWT_SECRET) as TokenCliente;
      if (dati.tipo !== 'cliente') throw new Error('tipo di token sbagliato');
      return dati;
    } catch {
      throw new NonAutorizzato('Sessione scaduta o non valida, effettua di nuovo il login.');
    }
  },
};
