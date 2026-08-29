import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { amministratori, ruoli } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { NonAutorizzato } from '../../shared/errors.js';
import type { LoginAdminInput, TokenPayload } from './auth.dto.js';
import { permessiEffettivi } from './permessi.service.js';

export const authService = {
  async loginAdmin(input: LoginAdminInput) {
    const [admin] = await db
      .select()
      .from(amministratori)
      .where(eq(amministratori.email, input.email.toLowerCase()))
      .limit(1);

    if (!admin || !admin.attivo) {
      throw new NonAutorizzato('Email o password non corrette');
    }

    const passwordOk = await bcrypt.compare(input.password, admin.passwordHash);
    if (!passwordOk) {
      throw new NonAutorizzato('Email o password non corrette');
    }

    const payload: TokenPayload = { sub: admin.id, nome: admin.nome };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });

    return { token, admin: await this.datiSessione(admin.id) };
  },

  /** Dati che il frontend usa per sapere chi è l'utente e cosa può fare:
   *  usati sia dopo il login sia da /api/auth/me (quando l'utente ricarica
   *  la pagina senza rifare login). Sempre calcolati "a caldo" dal DB, mai
   *  cachati nel token, così i permessi sono sempre aggiornati. */
  async datiSessione(amministratoreId: string) {
    const [admin] = await db.select().from(amministratori).where(eq(amministratori.id, amministratoreId)).limit(1);
    if (!admin) throw new NonAutorizzato();
    const [ruolo] = await db.select().from(ruoli).where(eq(ruoli.id, admin.ruoloId)).limit(1);
    const eff = await permessiEffettivi(admin.id);

    return {
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      ruoloId: admin.ruoloId,
      ruoloNome: ruolo?.nome ?? null,
      owner: eff.owner,
      permessi: eff.owner ? ['*'] : Array.from(eff.permessi),
    };
  },

  verificaToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    } catch {
      throw new NonAutorizzato('Sessione scaduta o non valida, effettua di nuovo il login');
    }
  },

  async hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  },
};
