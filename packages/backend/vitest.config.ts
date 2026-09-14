import { defineConfig } from 'vitest/config';

// Test "a tavolino" su funzioni pure — niente database, niente
// rete: devono girare in CI in pochi secondi senza configurare nulla.
// L'indirizzo del database qui sotto non esiste apposta: alcune funzioni pure
// stanno in file che aprono il database, e così non possono mai raggiungerne
// uno vero. I test con il database: vitest.db.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.db.test.ts', 'node_modules/**'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC', // come il server su Railway
      DATABASE_URL: 'postgres://nessuno:nessuno@127.0.0.1:9/nessun_database_test',
      JWT_SECRET: 'segreto-solo-per-i-test-automatici',
      RESEND_API_KEY: '', SMTP_HOST: '',
    },
  },
});
