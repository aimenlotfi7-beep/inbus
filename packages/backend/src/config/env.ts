import 'dotenv/config';
import { z } from 'zod';

// Tutta l'app legge le variabili d'ambiente SOLO da qui: se manca qualcosa
// di obbligatorio, il server si rifiuta di partire con un errore chiaro,
// invece di fallire in modo confuso più avanti.
const schemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL mancante nel file .env'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve avere almeno 16 caratteri'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ACCONTO_FISSO_EUR: z.coerce.number().default(10),
  GIORNI_SCADENZA_SALDO: z.coerce.number().default(15),
});

const parsed = schemaEnv.safeParse(process.env);

if (!parsed.success) {
  console.error('Configurazione .env non valida:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
