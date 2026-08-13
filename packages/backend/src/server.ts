import { creaApp } from './app.js';
import { env } from './config/env.js';

const app = creaApp();

app.listen(env.PORT, () => {
  console.log(`INBUS API in ascolto su http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
