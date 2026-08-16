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
  // Tutte facoltative: se SMTP_HOST manca, le email non partono davvero
  // (il link viene solo stampato nei log del server), il resto continua
  // a funzionare normalmente.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Base per costruire i link cliccabili nelle email (es. completamento
  // lista d'attesa, saldo). Se non impostata, usa CORS_ORIGIN.
  FRONTEND_URL: z.string().optional(),
});

const parsed = schemaEnv.safeParse(process.env);

if (!parsed.success) {
  console.error('Configurazione .env non valida:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
