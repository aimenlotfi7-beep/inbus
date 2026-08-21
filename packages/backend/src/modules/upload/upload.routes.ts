import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { uploadService } from './upload.service.js';
import { richiedeAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../../shared/http.js';
import { ErroreApplicativo } from '../../shared/errors.js';

// In memoria (non su disco): il file passa dritto verso R2, non resta
// mai salvato sul server — più semplice e più sicuro (niente file
// dimenticati in giro se qualcosa va storto a metà).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

export const uploadRouter = Router();
uploadRouter.use(richiedeAuth);

uploadRouter.get('/stato', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ attivo: uploadService.attivo() });
}));

uploadRouter.post('/', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ErroreApplicativo('Nessun file ricevuto.');
  const url = await uploadService.carica(req.file.buffer, req.file.mimetype);
  res.json({ url });
}));
