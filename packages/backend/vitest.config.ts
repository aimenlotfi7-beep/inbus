import { defineConfig } from 'vitest/config';
// Solo test "a tavolino" su funzioni pure — niente database, niente
// rete: devono girare in CI in pochi secondi senza configurare nulla.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], environment: 'node' } });
