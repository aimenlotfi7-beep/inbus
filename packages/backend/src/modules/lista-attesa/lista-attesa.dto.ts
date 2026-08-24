import { z } from 'zod';

const partecipanteSchema = z.object({ nome: z.string().min(1), cognome: z.string().min(1) });

export const iscrivitiListaAttesaSchema = z.object({
  eventoId: z.string().min(1),
  tragittoId: z.string().optional(),
  fermataId: z.string().optional(),
  passeggeri: z.number().int().min(1).max(20),
  cliente: z.object({
    email: z.string().email(),
    nome: z.string().min(1),
    cognome: z.string().min(1),
    telefono: z.string().min(4),
  }),
  partecipanti: z.array(partecipanteSchema).default([]),
}).refine(
  (v) => v.partecipanti.length === v.passeggeri - 1,
  { message: 'Il numero di partecipanti aggiuntivi deve essere passeggeri-1.', path: ['partecipanti'] }
);
export type IscrivitiListaAttesaInput = z.infer<typeof iscrivitiListaAttesaSchema>;
