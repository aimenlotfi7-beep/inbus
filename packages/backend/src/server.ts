import { creaApp } from './app.js';
import { env } from './config/env.js';
import { sincronizzaPermessi } from './shared/permessi-sync.js';
import { avviaSchedulerPromemoriaSaldo } from './shared/scheduler.js';

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
