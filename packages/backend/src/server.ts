import dns from 'node:dns';
import { creaApp } from './app.js';
import { env } from './config/env.js';
import { sincronizzaPermessi } from './shared/permessi-sync.js';
import { avviaSchedulerPromemoriaSaldo } from './shared/scheduler.js';

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
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`INBUS API in ascolto su http://localhost:${env.PORT} (${env.NODE_ENV})`);
      avviaSchedulerPromemoriaSaldo();
    });
  })
  .catch((err) => {
    console.error('Errore nella sincronizzazione dei permessi:', err);
    process.exit(1);
  });
