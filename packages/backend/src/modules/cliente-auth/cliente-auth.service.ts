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
  async registrati(input: { email: string; password: string; nome: string; cognome: string; telefono?: string; citta?: string; dataNascita: Date; codiceReferral?: string }) {
    const email = input.email.toLowerCase();
    const [esistente] = await db.select().from(utenti).where(eq(utenti.email, email)).limit(1);
    if (esistente?.passwordHash) throw new ConflittoDati('Esiste già un account con questa email — prova ad accedere, o recupera la password.');

    // "Invita un amico" — solo se questo utente non ha GIÀ un invitante
    // (un utente "fantasma" creato da una prenotazione precedente come
    // ospite potrebbe già averne uno se in futuro si aggiungesse quella
    // via; per ora comunque non può succedere, ma il controllo costa
    // nulla ed evita di "rubare" un invito già assegnato). Il codice
    // sbagliato/inesistente non blocca la registrazione — si ignora e
    // basta, non è un errore da mostrare a chi si registra.
    let invitanteId: string | null = null;
    if (input.codiceReferral && !esistente?.invitatoDaUtenteId) {
      const [invitante] = await db.select({ id: utenti.id }).from(utenti).where(eq(utenti.codiceReferral, input.codiceReferral.toUpperCase())).limit(1);
      if (invitante) invitanteId = invitante.id;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const token = generaToken();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_VERIFICA * 60 * 60 * 1000);

    let idUtente: string;
    if (esistente) {
      await db.update(utenti).set({
        passwordHash, nome: input.nome, cognome: input.cognome,
        telefono: input.telefono ?? esistente.telefono,
        citta: input.citta ?? esistente.citta,
        dataNascita: input.dataNascita,
        emailVerificata: false, tokenVerificaEmail: token, tokenVerificaScadenza: scadenza,
        ...(invitanteId && { invitatoDaUtenteId: invitanteId }),
      }).where(eq(utenti.id, esistente.id));
      idUtente = esistente.id;
    } else {
      const [nuovo] = await db.insert(utenti).values({
        email, passwordHash, nome: input.nome, cognome: input.cognome, telefono: input.telefono, citta: input.citta,
        dataNascita: input.dataNascita,
        tokenVerificaEmail: token, tokenVerificaScadenza: scadenza,
        invitatoDaUtenteId: invitanteId,
      }).returning({ id: utenti.id });
      idUtente = nuovo.id;
    }

    if (invitanteId) {
      const [invitante] = await db.select({ nome: utenti.nome }).from(utenti).where(eq(utenti.id, invitanteId)).limit(1);
      const { creditoService } = await import('../credito/credito.service.js');
      await creditoService.erogaBonusReferralAmico(idUtente, invitante?.nome ?? null).catch(() => {});
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

  /** Modifica i propri dati — MAI l'email (è l'identità dell'account,
   *  cambiarla da qui aprirebbe la porta a errori seri: username
   *  diverso, email di verifica al posto sbagliato). Per cambiare
   *  email serve un flusso a sé, con una nuova verifica dedicata — non
   *  costruito qui, non richiesto. */
  async aggiornaProfilo(utenteId: string, input: { nome: string; cognome: string; telefono?: string; citta?: string; dataNascita: Date }) {
    await db.update(utenti).set({
      nome: input.nome, cognome: input.cognome,
      telefono: input.telefono || null, citta: input.citta || null,
      dataNascita: input.dataNascita,
    }).where(eq(utenti.id, utenteId));
  },

  /** Cancellazione "morbida", richiesta dal cliente stesso — richiede
   *  la password corrente (non basta avere una sessione aperta: un
   *  dispositivo condiviso o dimenticato loggato non deve poter
   *  cancellare l'account di qualcun altro). Non si tocca la riga
   *  utenti (le sue prenotazioni la referenziano, servono per la
   *  contabilità) - si anonimizzano i dati personali modificabili e si
   *  toglie la password, non potrà più accedere. */
  async eliminaAccount(utenteId: string, password: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.id, utenteId)).limit(1);
    if (!u || !u.passwordHash) throw new NonAutorizzato();
    const passwordOk = await bcrypt.compare(password, u.passwordHash);
    if (!passwordOk) throw new NonAutorizzato('Password non corretta.');

    await db.update(utenti).set({
      nome: 'Utente', cognome: 'eliminato', telefono: null, citta: null,
      passwordHash: null, eliminatoIl: new Date(),
      tokenVerificaEmail: null, tokenVerificaScadenza: null,
      tokenResetPassword: null, tokenResetPasswordScadenza: null,
    }).where(eq(utenti.id, utenteId));
  },

  /** D1(b) — checkout ospite con "account implicito". Risolve o crea
   *  l'utente per un acquisto senza login: se l'email non esiste
   *  ancora, ne crea uno nuovo SENZA password (un "fantasma" — può
   *  navigare/comprare, non può ancora accedere). Se esiste già ma
   *  senza password (un fantasma di un acquisto precedente), lo
   *  aggiorna con i dati freschi appena forniti e lo riusa. Se invece
   *  l'email appartiene GIÀ a un account con password, NON prosegue in
   *  silenzio (sarebbe comprare "a nome" di qualcun altro solo
   *  conoscendone l'email) — lancia un errore dedicato che il
   *  frontend intercetta per proporre l'accesso invece di procedere. */
  async trovaOCreaUtenteOspite(input: { email: string; nome: string; cognome: string; telefono?: string; citta?: string; dataNascita: Date }): Promise<{ utenteId: string; nuovo: boolean }> {
    const email = input.email.toLowerCase();
    const [esistente] = await db.select().from(utenti).where(eq(utenti.email, email)).limit(1);

    if (esistente?.passwordHash) {
      throw new ConflittoDati('Questa email ha già un account — accedi per continuare con questo acquisto.');
    }
    if (esistente) {
      await db.update(utenti).set({
        nome: input.nome, cognome: input.cognome,
        telefono: input.telefono || esistente.telefono, citta: input.citta || esistente.citta,
        dataNascita: input.dataNascita,
      }).where(eq(utenti.id, esistente.id));
      return { utenteId: esistente.id, nuovo: false };
    }

    const [nuovo] = await db.insert(utenti).values({
      email, nome: input.nome, cognome: input.cognome, telefono: input.telefono, citta: input.citta,
      dataNascita: input.dataNascita,
      // Niente password, niente emailVerificata — un fantasma non ha
      // ancora un vero account. emailVerificata resta false di
      // default (colonna già così), corretto: non ha ancora
      // dimostrato di controllare quella casella.
    }).returning({ id: utenti.id });
    return { utenteId: nuovo.id, nuovo: true };
  },

  /** Dopo un acquisto da ospite andato a buon fine, invita a
   *  impostare una password — così l'account "implicito" appena creato
   *  diventa un account vero, con accesso al credito fedeltà, alla
   *  lista d'attesa, allo storico viaggi. Riusa lo STESSO meccanismo a
   *  token del reset password (stesso campo, stessa pagina di
   *  conferma) — a differenza di richiediResetPassword() qui NON si
   *  richiede che una password esistesse già (è proprio il contrario:
   *  serve solo quando ancora non c'è). Se il cliente non imposta mai
   *  la password, i suoi ordini restano comunque intatti e raggiungibili
   *  con "traccia la tua prenotazione" — non è un passaggio bloccante. */
  async invitaAImpostarePassword(utenteId: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.id, utenteId)).limit(1);
    if (!u) return;

    const token = generaToken();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_VERIFICA * 60 * 60 * 1000);
    await db.update(utenti).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(utenti.id, u.id));

    const link = urlSito(`/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('benvenuto_ospite', {
      nome: u.nome ?? '', link, ore_validita: String(ORE_VALIDITA_TOKEN_VERIFICA),
    });
    await inviaEmail({ a: u.email, oggetto, html });
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

  /** Richiede il reset — silenzioso apposta se l'email non esiste (non
   *  fa scoprire quali email sono già registrate). */
  async richiediResetPassword(email: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    if (!u || !u.passwordHash) return;

    const token = generaToken();
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_VERIFICA * 60 * 60 * 1000);
    await db.update(utenti).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(utenti.id, u.id));

    const link = urlSito(`/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('reset_password', {
      nome: u.nome ?? '', link, ore_validita: String(ORE_VALIDITA_TOKEN_VERIFICA),
    });
    await inviaEmail({ a: u.email, oggetto, html });
  },

  async confermaResetPassword(token: string, nuovaPassword: string) {
    const [u] = await db.select().from(utenti).where(eq(utenti.tokenResetPassword, token)).limit(1);
    if (!u || !u.tokenResetPasswordScadenza || u.tokenResetPasswordScadenza < new Date()) {
      throw new NonAutorizzato('Link scaduto o non valido — richiedine uno nuovo.');
    }
    const passwordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.update(utenti).set({ passwordHash, tokenResetPassword: null, tokenResetPasswordScadenza: null }).where(eq(utenti.id, u.id));
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
