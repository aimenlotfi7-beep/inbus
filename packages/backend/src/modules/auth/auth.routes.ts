import { Router } from 'express';
import { z } from 'zod';
import { authController } from './auth.controller.js';
import { authService } from './auth.service.js';
import { loginAdminSchema } from './auth.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth } from './auth.middleware.js';

export const authRouter = Router();

authRouter.post('/admin/login', valida(loginAdminSchema), asyncHandler(authController.loginAdmin));
authRouter.post('/admin/richiedi-reset', valida(z.object({ email: z.string().email() })), asyncHandler(async (req, res) => {
  await authService.richiediResetPassword(req.body.email);
  res.json({ ok: true });
}));
authRouter.post('/admin/reset-password', valida(z.object({ token: z.string(), password: z.string().min(8, 'La password deve avere almeno 8 caratteri.') })), asyncHandler(async (req, res) => {
  await authService.confermaResetPassword(req.body.token, req.body.password);
  res.json({ ok: true });
}));
authRouter.get('/me', richiedeAuth, asyncHandler(authController.me));
