import { z } from 'zod';

const campiCoupon = z.object({
  codice: z.string().min(3).transform((v) => v.toUpperCase()),
  tipo: z.enum(['PERCENTUALE', 'FISSO']),
  valore: z.number().positive(),
  usiMax: z.number().int().positive().optional(),
  // nullable PRIMA della conversione: il gestionale manda null quando la
  // data è vuota, e z.coerce.date() trasformava null in 01/01/1970 — il
  // codice nasceva già scaduto e il checkout lo rifiutava.
  validoDal: z.coerce.date().nullable().optional(),
  validoAl: z.coerce.date().nullable().optional(),
  attivo: z.boolean().default(true),
  // Vuoto/assente = valido su tutti gli eventi.
  eventoId: z.string().nullable().optional(),
  // Se impostato, usare questo coupon attribuisce la vendita anche a
  // questo promoter — sconto al cliente e commissione al promoter
  // insieme, con un solo codice.
  promoterId: z.string().nullable().optional(),
  // Compenso PER QUESTO CODICE — se assente, si usa il tasso di
  // default dell'account del promoter. Rilevante solo se promoterId è
  // impostato; compensoFissoPer solo se compensoTipo è FISSO.
  compensoTipo: z.enum(['PERCENTUALE', 'FISSO']).nullable().optional(),
  compensoValore: z.number().positive().nullable().optional(),
  compensoFissoPer: z.enum(['ACQUISTO', 'PASSEGGERO']).nullable().optional(),
  // Voucher personale — assegnato a questo cliente, mai un codice pubblico.
  utenteId: z.string().nullable().optional(),
});

/** Una percentuale oltre 100 (errore di battitura: 150%) porterebbe il
 *  totale sotto zero. Nella modifica il tipo può non arrivare: lì il
 *  controllo lo rifà il servizio con i valori uniti. */
const percentualiValide = (v: { tipo?: 'PERCENTUALE' | 'FISSO'; valore?: number; compensoTipo?: 'PERCENTUALE' | 'FISSO' | null; compensoValore?: number | null }, ctx: z.RefinementCtx) => {
  if (v.tipo === 'PERCENTUALE' && v.valore !== undefined && v.valore > 100) ctx.addIssue({ code: 'custom', path: ['valore'], message: 'Lo sconto in percentuale non può superare il 100%.' });
  if (v.compensoTipo === 'PERCENTUALE' && v.compensoValore != null && v.compensoValore > 100) ctx.addIssue({ code: 'custom', path: ['compensoValore'], message: 'Il compenso in percentuale non può superare il 100%.' });
};

export const creaCouponSchema = campiCoupon.superRefine(percentualiValide);
export type CreaCouponInput = z.infer<typeof creaCouponSchema>;
export const aggiornaCouponSchema = campiCoupon.partial().superRefine(percentualiValide);
