import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { amministratori, ruoli } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { NonAutorizzato } from '../../shared/errors.js';
import type { LoginAdminInput, TokenPayload } from './auth.dto.js';
import { permessiEffettivi } from './permessi.service.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';

const ORE_VALIDITA_TOKEN_RESET = 2;

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

  async richiediResetPassword(email: string) {
    const [admin] = await db.select().from(amministratori).where(eq(amministratori.email, email.toLowerCase())).limit(1);
    if (!admin || !admin.attivo) return; // silenzioso apposta

    const token = crypto.randomBytes(24).toString('hex');
    const scadenza = new Date(Date.now() + ORE_VALIDITA_TOKEN_RESET * 60 * 60 * 1000);
    await db.update(amministratori).set({ tokenResetPassword: token, tokenResetPasswordScadenza: scadenza }).where(eq(amministratori.id, admin.id));

    const link = urlSito(`/admin.html#/reimposta-password/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('reset_password', {
      nome: admin.nome, link, ore_validita: String(ORE_VALIDITA_TOKEN_RESET),
    });
    await inviaEmail({ a: admin.email, oggetto, html });
  },

  async confermaResetPassword(token: string, nuovaPassword: string) {
    const [admin] = await db.select().from(amministratori).where(eq(amministratori.tokenResetPassword, token)).limit(1);
    if (!admin || !admin.tokenResetPasswordScadenza || admin.tokenResetPasswordScadenza < new Date()) {
      throw new NonAutorizzato('Link scaduto o non valido — richiedine uno nuovo.');
    }
    const passwordHash = await bcrypt.hash(nuovaPassword, 10);
    await db.update(amministratori).set({ passwordHash, tokenResetPassword: null, tokenResetPasswordScadenza: null }).where(eq(amministratori.id, admin.id));
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
};
