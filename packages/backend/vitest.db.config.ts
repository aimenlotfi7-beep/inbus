import { defineConfig } from 'vitest/config';
import { indirizzoDatabaseDiProva } from './test/database-di-prova.js';

// Test con il database vero: prenotazioni, coupon, saldo, rimborsi,
// smistamento, accessi. Girano su un database di prova ("..._test", su questo
// computer o nel giro di GitHub), mai su quello di produzione, e nessuna email
// parte davvero. `npm run test:db`.
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    globalSetup: ['./test/prepara-database.ts'],
    setupFiles: ['./test/controllo-database.ts'],
    // Un file alla volta: condividono lo stesso database e lo svuotano.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC', // come il server su Railway
      DATABASE_URL: indirizzoDatabaseDiProva(),
      JWT_SECRET: 'segreto-solo-per-i-test-automatici',
      CORS_ORIGIN: 'http://localhost:5173',
      FRONTEND_URL: 'http://localhost:5173',
      ACCONTO_FISSO_EUR: '10',
      GIORNI_SCADENZA_SALDO: '15',
      // Vuote apposta: niente email, niente file caricati durante i test.
      RESEND_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
      R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET_NAME: '',
    },
  },
});
