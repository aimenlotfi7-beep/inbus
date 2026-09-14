import { vi } from 'vitest';
import { controllaDatabaseDiProva } from './database-di-prova.js';
import { posta } from './posta.js';

// Prima di ogni file di test, prima che il codice apra il database: se per
// qualunque motivo l'indirizzo non è quello di prova, ci si ferma qui.
controllaDatabaseDiProva(process.env.DATABASE_URL);

// Nessuna email parte davvero durante i test: si raccolgono in "posta".
vi.mock('../src/shared/email.service.js', async (originale) => ({
  ...(await originale<typeof import('../src/shared/email.service.js')>()),
  inviaEmail: vi.fn(async (email: (typeof posta)[number]) => {
    posta.push(email);
    return { inviata: true };
  }),
}));
