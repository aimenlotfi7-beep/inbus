import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tourLeader } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { NonAutorizzato, NonTrovato } from '../../shared/errors.js';

export interface TokenTourLeader {
  tipo: 'tour_leader'; // marcatore: impedisce che un token admin venga scambiato per uno tour leader e viceversa
  sub: string;
  nome: string;
}

export const tourLeaderAuthService = {
  async login(email: string, password: string) {
    const [tl] = await db.select().from(tourLeader).where(eq(tourLeader.email, email.toLowerCase())).limit(1);
    if (!tl || !tl.passwordHash) throw new NonAutorizzato('Email o password non corrette');

    const passwordOk = await bcrypt.compare(password, tl.passwordHash);
    if (!passwordOk) throw new NonAutorizzato('Email o password non corrette');

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

  /** Genera una password casuale leggibile (per quando l'amministratore
   *  attiva l'accesso a un tour leader) e la salva già con l'hash — la
   *  password in chiaro viene restituita UNA volta sola, per essere
   *  comunicata al tour leader (via email o a voce), non viene mai più
   *  recuperabile dopo. */
  async attivaAccesso(tourLeaderId: string) {
    const [tl] = await db.select().from(tourLeader).where(eq(tourLeader.id, tourLeaderId)).limit(1);
    if (!tl) throw new NonTrovato('Tour leader');

    const passwordChiaro = crypto.randomBytes(6).toString('base64url'); // es. "aB3xQ9-kL"
    const passwordHash = await bcrypt.hash(passwordChiaro, 10);
    await db.update(tourLeader).set({ passwordHash }).where(eq(tourLeader.id, tourLeaderId));

    return { email: tl.email, password: passwordChiaro };
  },
};
