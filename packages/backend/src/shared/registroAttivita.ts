import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/client.js';
import { amministratori, logAttivita } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/** Il nome della sezione del gestionale per il primo pezzo dell'indirizzo. */
const SEZIONI: Record<string, string> = {
  eventi: 'Eventi', prenotazioni: 'Prenotazioni', utenti: 'Clienti', pagine: 'Pagine', contenuti: 'Contenuti',
  coupon: 'Coupon', fornitori: 'Fornitori', preventivi: 'Preventivi', bundle: 'Bundle', tour: 'Tour',
  'percorsi-salvati': 'Percorsi salvati', promoter: 'Promoter', organizzatori: 'Organizzatori', admin: 'White Label e commissioni',
  comunicazioni: 'Comunicazioni', 'tour-leader': 'Tour leader', 'tour-leader-auth': 'Tour leader', chat: 'Chat',
  amministratori: 'Amministratori', ruoli: 'Ruoli', impostazioni: 'Impostazioni', 'template-email': 'Testo email',
  upload: 'File caricati', 'layout-biglietto': 'Layout biglietto', 'richieste-rimborso': 'Rimborsi', variazioni: 'Variazioni',
  categorie: 'Generi', 'categorie-evento': 'Categorie', 'fermate-anagrafica': 'Fermate', 'lista-attesa': "Lista d'attesa",
  offerte: 'Offerte', campagne: 'Campagne',
};

const VERBI: Record<string, string> = { POST: 'Azione', PUT: 'Modifica', PATCH: 'Modifica', DELETE: 'Eliminazione' };

/** Chiamate di sola lettura anche se usano POST: non sono modifiche. */
const SOLO_LETTURA = /anteprima|\/valida$|\/calcola|login|logout|reset-password|reimposta/;

/** Registro attività del gestionale (Amministratori → Log attività recenti):
 *  ogni modifica riuscita fatta con un'utenza del gestionale lascia una riga
 *  con chi, cosa e quando. Prima la tabella c'era ma nessuno la scriveva.
 *  Non blocca mai la risposta e non lancia mai. */
export function registroAttivita(req: Request, res: Response, next: NextFunction) {
  if (!VERBI[req.method]) return next();
  const percorso = req.originalUrl.split('?')[0];
  if (SOLO_LETTURA.test(percorso)) return next();
  res.on('finish', () => {
    if (!req.admin || res.statusCode >= 400) return;
    const pezzi = percorso.replace(/^\/api\//, '').split('/');
    const sezione = SEZIONI[pezzi[0]] ?? pezzi[0];
    const verbo = req.method === 'POST' && pezzi.length === 1 ? 'Creazione' : VERBI[req.method];
    void (async () => {
      try {
        const [admin] = await db.select({ nome: amministratori.nome }).from(amministratori).where(eq(amministratori.id, req.admin!.sub)).limit(1);
        await db.insert(logAttivita).values({
          amministratoreId: req.admin!.sub,
          azione: `${verbo} — ${sezione}`,
          dettaglio: `${admin?.nome ?? 'Utenza'}: ${req.method} ${percorso}`,
        });
      } catch (err) {
        console.error('[registro attività] riga non scritta:', err);
      }
    })();
  });
  next();
}
