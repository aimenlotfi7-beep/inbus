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

// Un lavoro lanciato "in sottofondo" (smistamento subito dopo una
// prenotazione, avviso a Meta, richieste ai fornitori…) che fallisce senza
// che nessuno raccolga l'errore spegneva TUTTO il server: di serie Node si
// ferma. Lo si scrive nei log e il sito resta acceso per tutti gli altri.
process.on('unhandledRejection', (motivo) => {
  console.error('Lavoro in sottofondo fallito senza gestione (il server resta acceso):', motivo);
});

sincronizzaPermessi()
  .then(() => sincronizzaTemplateEmail())
  .then(() => sincronizzaLayoutBiglietto())
  .then(() => {
    const server = app.listen(env.PORT, () => {
      console.log(`INBUS API in ascolto su http://localhost:${env.PORT} (${env.NODE_ENV})`);
      avviaSchedulerPromemoriaSaldo();
      avviaSchedulerRiordinoEta();
    });
    // A ogni aggiornamento Railway chiede al server vecchio di fermarsi
    // (SIGTERM): prima di uscire si finiscono le richieste già iniziate,
    // così una prenotazione a metà non si interrompe. Al massimo 10 secondi.
    process.once('SIGTERM', () => {
      console.log('Arresto richiesto: finisco le richieste in corso e chiudo.');
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  })
  .catch((err) => {
    console.error('Errore nella sincronizzazione iniziale (permessi/template email):', err);
    process.exit(1);
  });
