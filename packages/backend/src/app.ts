import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { gestoreErrori } from './shared/http.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { eventiRouter } from './modules/eventi/eventi.routes.js';
import { prenotazioniRouter } from './modules/prenotazioni/prenotazioni.routes.js';
import { utentiRouter } from './modules/utenti/utenti.routes.js';
import { pagineRouter, contenutiRouter } from './modules/pagine/pagine.routes.js';
import { couponRouter } from './modules/coupon/coupon.routes.js';
import { fornitoriRouter } from './modules/fornitori/fornitori.routes.js';
import { tragittiRouter } from './modules/tragitti/tragitti.routes.js';
import { promoterRouter } from './modules/promoter/promoter.routes.js';
import { tourLeaderRouter } from './modules/tourleader/tourleader.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { amministratoriRouter } from './modules/amministratori/amministratori.routes.js';
import { statisticheRouter } from './modules/statistiche/statistiche.routes.js';
import { ruoliRouter } from './modules/ruoli/ruoli.routes.js';
import { impostazioniRouter } from './modules/impostazioni/impostazioni.routes.js';
import { categorieRouter } from './modules/categorie/categorie.routes.js';
import { listaAttesaRouter } from './modules/lista-attesa/lista-attesa.routes.js';
import { offerteRouter } from './modules/offerte/offerte.routes.js';
import { campagneRouter } from './modules/campagne/campagne.routes.js';
import { sitemapRouter } from './modules/sitemap/sitemap.routes.js';

export function creaApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Ogni modulo espone il proprio Router, stesso pattern per tutti.
  app.use('/api/auth', authRouter);
  app.use('/api/eventi', eventiRouter);
  app.use('/api/prenotazioni', prenotazioniRouter);
  app.use('/api/utenti', utentiRouter);
  app.use('/api/pagine', pagineRouter);
  app.use('/api/contenuti', contenutiRouter);
  app.use('/api/coupon', couponRouter);
  app.use('/api/fornitori', fornitoriRouter);
  app.use('/api/tragitti', tragittiRouter);
  app.use('/api/promoter', promoterRouter);
  app.use('/api/tour-leader', tourLeaderRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/amministratori', amministratoriRouter);
  app.use('/api/statistiche', statisticheRouter);
  app.use('/api/ruoli', ruoliRouter);
  app.use('/api/impostazioni', impostazioniRouter);
  app.use('/api/categorie', categorieRouter);
  app.use('/api/lista-attesa', listaAttesaRouter);
  app.use('/api/offerte', offerteRouter);
  app.use('/api/campagne', campagneRouter);
  app.use('/', sitemapRouter);

  // Il gestore errori DEVE essere l'ultimo middleware registrato.
  app.use(gestoreErrori);

  return app;
}
