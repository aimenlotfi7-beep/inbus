import { creaApp } from './app.js';
import { env } from './config/env.js';
import { sincronizzaPermessi } from './shared/permessi-sync.js';

const app = creaApp();

sincronizzaPermessi()
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`INBUS API in ascolto su http://localhost:${env.PORT} (${env.NODE_ENV})`);
    });
  })
  .catch((err) => {
    console.error('Errore nella sincronizzazione dei permessi:', err);
    process.exit(1);
  });
