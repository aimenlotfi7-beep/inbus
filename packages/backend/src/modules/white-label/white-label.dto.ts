import { z } from 'zod';

const colore = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colore non valido (usa formato #rrggbb)');
const urlOpzionale = z.string().url().nullable().optional();

const temaSchema = z.object({
  branding: z.object({
    logoUrl: urlOpzionale,
    logoMobileUrl: urlOpzionale,
    immaginePrincipaleUrl: urlOpzionale,
    heroImageUrl: urlOpzionale,
    posizioneLogo: z.enum(['in-alto-a-sinistra', 'in-alto-al-centro', 'in-alto-a-destra']),
    dimensioneLogoPx: z.number().min(16).max(200),
  }),
  colori: z.object({
    sfondo: colore,
    superficie: colore,
    testoPrincipale: colore,
    testoSecondario: colore,
    cta: colore,
    testoCta: colore,
    bordi: colore,
  }),
  tipografia: z.object({
    font: z.string().min(1),
    dimensioneTitoloPx: z.number().min(12).max(64),
    dimensioneTestoPx: z.number().min(10).max(28),
  }),
  stile: z.object({
    borderRadiusPx: z.number().min(0).max(40),
    stilePulsanti: z.enum(['pieno', 'contorno', 'arrotondato']),
    altezzaPulsantePx: z.number().min(28).max(80),
    spaziaturaPx: z.number().min(4).max(48),
  }),
  layout: z.object({
    tipo: z.enum(['card', 'hero', 'horizontal']),
  }),
  elementiVisibili: z.object({
    logo: z.boolean(),
    immagine: z.boolean(),
    titolo: z.boolean(),
    data: z.boolean(),
    percorso: z.boolean(),
    fermate: z.boolean(),
    prezzo: z.boolean(),
    disponibilita: z.boolean(),
    descrizione: z.boolean(),
    cta: z.boolean(),
    informazioni: z.boolean(),
  }),
}).partial();

const dominioSchema = z.string().url().refine((u) => {
  try { return !!new URL(u).hostname; } catch { return false; }
}, 'Deve essere un URL completo, es. https://www.esempio.it');

export const creaWhiteLabelSchema = z.object({
  organizzatoreId: z.string().min(1),
  eventoId: z.string().min(1),
  dominiAutorizzati: z.array(dominioSchema).default([]),
  tema: temaSchema.optional(),
});

export const aggiornaWhiteLabelSchema = z.object({
  attiva: z.boolean().optional(),
  dominiAutorizzati: z.array(dominioSchema).optional(),
  tema: temaSchema.optional(),
});
