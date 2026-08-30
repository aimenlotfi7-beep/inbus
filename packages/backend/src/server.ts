import dns from 'node:dns';
import { creaApp } from './app.js';
import { env } from './config/env.js';
import { sincronizzaPermessi } from './shared/permessi-sync.js';
import { sincronizzaTemplateEmail } from './modules/template-email/template-email.service.js';
import { sincronizzaLayoutBiglietto } from './modules/layout-biglietto/layout-biglietto.service.js';
import { avviaSchedulerPromemoriaSaldo, avviaSchedulerRiordinoEta } from './shared/scheduler.js';

// Railway (l'hosting del backend) non ha una rete IPv6 in uscita
// funzionante — le connessioni verso host che rispondono anche in IPv6
// (come smtp.gmail.com) falliscono con "ENETUNREACH" se Node sceglie
// per primo l'indirizzo IPv6. Questa riga dice a Node di preferire
// sempre IPv4 per prima, per qualunque connessione in uscita del
// server (email compresa) — va messa il più presto possibile, prima
// che qualunque altra parte del codice provi a connettersi a qualcosa.
dns.setDefaultResultOrder('ipv4first');

const app = creaApp();

sincronizzaPermessi()
  .then(() => sincronizzaTemplateEmail())
  .then(() => sincronizzaLayoutBiglietto())
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`INBUS API in ascolto su http://localhost:${env.PORT} (${env.NODE_ENV})`);
      avviaSchedulerPromemoriaSaldo();
      avviaSchedulerRiordinoEta();
    });
  })
  .catch((err) => {
    console.error('Errore nella sincronizzazione iniziale (permessi/template email):', err);
    process.exit(1);
  });
