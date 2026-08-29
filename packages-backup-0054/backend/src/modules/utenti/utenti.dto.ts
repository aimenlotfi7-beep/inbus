import { z } from 'zod';

export const upsertUtenteSchema = z.object({
  email: z.string().email(),
  nome: z.string().optional(),
  cognome: z.string().optional(),
  telefono: z.string().optional(),
  codiceFiscale: z.string().optional(),
  dataNascita: z.coerce.date().optional(),
  indirizzo: z.string().optional(),
  citta: z.string().optional(),
  cap: z.string().optional(),
});
export type UpsertUtenteInput = z.infer<typeof upsertUtenteSchema>;
