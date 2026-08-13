import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { amministratori } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { NonAutorizzato } from '../../shared/errors.js';
import type { LoginAdminInput, TokenPayload } from './auth.dto.js';

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

    const payload: TokenPayload = { sub: admin.id, ruolo: admin.ruolo, nome: admin.nome };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });

    return { token, admin: { id: admin.id, nome: admin.nome, email: admin.email, ruolo: admin.ruolo } };
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
