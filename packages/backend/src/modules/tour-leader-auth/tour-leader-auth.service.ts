import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tourLeader } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { ConflittoDati, NonAutorizzato, NonTrovato, VietatoDaiPermessi } from '../../shared/errors.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';

const ORE_VALIDITA_TOKEN_RESET = 2;
/** L'invito a scegliere la password dura di più: il tour leader può
 *  leggere l'email giorni dopo. */
const ORE_VALIDITA_INVITO = 72;

export interface TokenTourLeader {
  tipo: 'tour_leader'; // marcatore: impedisce che un token admin venga scambiato per uno tour leader e viceversa
  sub: string;
  nome: string;
}

/** Le email dei tour leader salvate prima del settembre 2026 possono avere
 *  maiuscole: il confronto è sempre senza maiuscole. */
const stessaEmail = (email: string) => sql`lower(${tourLeader.email}) = ${email.trim().toLowerCase()}`;

const MESSAGGIO_ARCHIVIATO = 'Il tuo accesso alla scansione non è attivo: contatta l\'organizzazione.';

export const tourLeaderAuthService = {
  async login(email: string, password: string) {
    const [tl] = await db.select().from(tourLeader).where(stessaEmail(email)).limit(1);
    if (!tl || !tl.passwordHash) throw new NonAutorizzato('Email o password non corrette');

    const passwordOk = await bcrypt.compare(password, tl.passwordHash);
    if (!passwordOk) throw new NonAutorizzato('Email o password non corrette');
    // Archiviato = senza accesso (deciso dal proprietario, settembre 2026).
    if (tl.stato === 'ARCHIVIATO') throw new VietatoDaiPermessi(MESSAGGIO_ARCHIVIATO);

    const payload: TokenTourLeader = { tipo: 'tour_leader', sub: tl.id, nome: `${tl.nome} ${tl.cognome}` };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
    return { token, nome: payload.nome };
  },

  verificaToken(token: string): TokenTourLeader {
    try {
      const dati = jwt.verify(token, env.JWT_SECRET) as TokenTourLeader;
      if (dati.tipo !== 'tour_leader') throw new Error('tipo di token sbagliato');
      return dati;
    } catch {
      throw new NonAutorizzato('Sessione scaduta o non valida, effettua di nuovo il login');
    }
  },

  /** A ogni richiesta della scansione: il tour leader esiste ancora e non è
   *  stato archiviato dopo l'accesso (il token vale 12 ore). */
  async verificaAncoraAttivo(tourLeaderId: string) {
    const [tl] = await db.select({ stato: tourLeader.stato }).from(tourLeader).where(eq(tourLeader.id, tourLeaderId)).limit(1);
    if (!tl) throw new NonAutorizzato('Sessione scaduta o non valida, effettua di nuovo il login');
    if (tl.stato === 'ARCHIVIATO') throw new VietatoDaiPermessi(MESSAGGIO_ARCHIVIATO);
  },

  /** Accesso alla scansione per un tour leader: un'email con il link per
   *  scegliere la password (regola del progetto: mai password in chiaro,
   *  nemmeno da mandare a mano). Il link vale ORE_VALIDITA_INVITO ore; una
   *  password già scelta resta valida finché non la cambia. Se l'email non
   *  parte, il gestionale mostra il link da mandare in altro modo. */
  async attivaAccesso(tourLeaderId: string) {
    const [tl] = await db.select().from(tourLeader).where(eq(tourLeader.id, tourLeaderId)).limit(1);
    if (!tl) throw new NonTrovato('Tour leader');
    if (tl.stato === 'ARCHIVIATO') {
      throw new ConflittoDati(`${tl.nome} ${tl.cognome} è archiviato: rimettilo su «Attivo» prima di mandargli il link.`);
    }

    const token = crypto.randomBytes(24).toString('hex');
    const scadenza = new Date(Date.now() + ORE_VALIDITA_INVITO * 60 * 60 * 1000);
    await db.update(tourLeader).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(tourLeader.id, tourLeaderId));

    const link = urlSito(`/scansione/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('invito_tour_leader', {
      nome: tl.nome, link, ore_validita: String(ORE_VALIDITA_INVITO), link_accesso: urlSito('/scansione/accedi'),
    });
    const { inviata } = await inviaEmail({ a: tl.email, oggetto, html });
    return { email: tl.email, emailInviata: inviata, link };
  },

  async richiediResetPassword(email: string) {
    const [tl] = await db.select().from(tourLeader).where(stessaEmail(email)).limit(1);
    // Silenzioso apposta, e solo se ha già credenziali attive e non è archiviato.
    if (!tl || !tl.passwordHash || tl.stato === 'ARCHIVIATO') return;

    const token = crypto.randomBytes(24).toString('hex');
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_RESET * 60 * 60 * 1000);
    await db.update(tourLeader).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(tourLeader.id, tl.id));

    const link = urlSito(`/scansione/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('reset_password', {
      nome: tl.nome, link, ore_validita: String(ORE_VALIDITA_TOKEN_RESET),
    });
    await inviaEmail({ a: tl.email, oggetto, html });
  },

  async confermaResetPassword(token: string, nuovaPassword: string) {
    const [tl] = await db.select().from(tourLeader).where(eq(tourLeader.tokenResetPassword, token)).limit(1);
    if (!tl || !tl.tokenResetPasswordScadenza || tl.tokenResetPasswordScadenza < new Date()) {
      throw new NonAutorizzato('Link scaduto o non valido — richiedine uno nuovo.');
    }
    const passwordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.update(tourLeader).set({ passwordHash, tokenResetPassword: null, tokenResetPasswordScadenza: null }).where(eq(tourLeader.id, tl.id));
  },
};
