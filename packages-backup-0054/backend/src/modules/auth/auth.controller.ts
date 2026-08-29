import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import type { LoginAdminInput } from './auth.dto.js';

export const authController = {
  async loginAdmin(req: Request, res: Response) {
    const risultato = await authService.loginAdmin(req.body as LoginAdminInput);
    res.json(risultato);
  },

  async me(req: Request, res: Response) {
    if (!req.admin) return res.status(401).json({ errore: 'Non autorizzato' });
    res.json({ admin: await authService.datiSessione(req.admin.sub) });
  },
};
