import { z } from 'zod';

export const loginAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginAdminInput = z.infer<typeof loginAdminSchema>;

export interface TokenPayload {
  sub: string; // id amministratore
  ruolo: 'AMMINISTRATORE' | 'OPERATORE' | 'COLLABORATORE';
  nome: string;
}
