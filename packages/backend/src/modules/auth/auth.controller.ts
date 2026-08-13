import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import type { LoginAdminInput } from './auth.dto.js';

export const authController = {
  async loginAdmin(req: Request, res: Response) {
    const risultato = await authService.loginAdmin(req.body as LoginAdminInput);
    res.json(risultato);
  },

  async me(req: Request, res: Response) {
    res.json({ admin: req.admin });
  },
};
