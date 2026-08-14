import { z } from 'zod';

export const loginAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginAdminInput = z.infer<typeof loginAdminSchema>;

export interface TokenPayload {
  sub: string; // id amministratore
  nome: string;
  // Nota: i permessi NON sono nel token (che dura 12h): vengono ricalcolati
  // ad ogni richiesta protetta, così un cambio di permessi/ruolo ha effetto
  // immediato senza dover aspettare che l'utente rifaccia il login.
}
