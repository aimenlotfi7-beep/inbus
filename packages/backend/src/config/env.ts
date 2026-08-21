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
  // Resend: metodo preferito per mandare email, perché usa una normale
  // richiesta web (porta 443) invece della porta SMTP tradizionale —
  // che su Railway risulta bloccata in uscita. Se presente, viene usato
  // al posto di SMTP.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  // Archiviazione file veri (immagini, PDF) su Cloudflare R2 — compatibile
  // con l'API di Amazon S3, ma senza costi per il traffico in uscita.
  // Tutte facoltative: se mancano, il caricamento file non è disponibile
  // (il gestionale continua comunque a funzionare a link, come prima).
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(), // es. https://file.tuodominio.it oppure l'URL pubblico del bucket
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
