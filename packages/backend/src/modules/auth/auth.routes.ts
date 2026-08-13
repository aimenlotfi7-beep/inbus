import { Router } from 'express';
import { authController } from './auth.controller.js';
import { loginAdminSchema } from './auth.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth } from './auth.middleware.js';

export const authRouter = Router();

authRouter.post('/admin/login', valida(loginAdminSchema), asyncHandler(authController.loginAdmin));
authRouter.get('/me', richiedeAuth, asyncHandler(authController.me));
