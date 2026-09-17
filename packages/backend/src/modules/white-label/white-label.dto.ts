import { z } from 'zod';

const colore = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colore non valido (usa formato #rrggbb)');
const urlOpzionale = z.string().url().nullable().optional();

/** Un testo personalizzato: vuoto = si usa quello di serie. */
const testoOpzionale = z.string().max(200).nullable().optional();

const temaSchema = z.object({
  branding: z.object({
    logoUrl: urlOpzionale,
    logoMobileUrl: urlOpzionale,
    immaginePrincipaleUrl: urlOpzionale,
    heroImageUrl: urlOpzionale,
    posizioneLogo: z.enum(['in-alto-a-sinistra', 'in-alto-al-centro', 'in-alto-a-destra']),
    dimensioneLogoPx: z.number().min(16).max(200),
    sfondoImmagineUrl: urlOpzionale,
    sfondoImmagineModo: z.enum(['copri', 'affianca', 'fisso']),
    sfondoVeloPercentuale: z.number().min(0).max(100),
    faviconUrl: urlOpzionale,
    titoloPagina: testoOpzionale,
  }).partial(),
  colori: z.object({
    sfondo: colore,
    superficie: colore,
    testoPrincipale: colore,
    testoSecondario: colore,
    cta: colore,
    testoCta: colore,
    bordi: colore,
    ctaSecondaria: colore,
    testoCtaSecondaria: colore,
    accento: colore,
    campoSfondo: colore,
    campoTesto: colore,
  }).partial(),
  tipografia: z.object({
    font: z.string().min(1).max(60),
    fontTitoli: z.string().max(60).nullable().optional(),
    dimensioneTitoloPx: z.number().min(12).max(64),
    dimensioneTestoPx: z.number().min(10).max(28),
  }).partial(),
  stile: z.object({
    borderRadiusPx: z.number().min(0).max(40),
    stilePulsanti: z.enum(['pieno', 'contorno', 'arrotondato']),
    altezzaPulsantePx: z.number().min(28).max(80),
    spaziaturaPx: z.number().min(4).max(48),
    ombre: z.boolean(),
    mostraBordi: z.boolean(),
    larghezzaPx: z.number().min(280).max(1200),
  }).partial(),
  layout: z.object({
    tipo: z.enum(['card', 'hero', 'horizontal']),
  }).partial(),
  testi: z.object({
    titolo: testoOpzionale,
    sottotitolo: testoOpzionale,
    pulsante: testoOpzionale,
    piePagina: testoOpzionale,
  }).partial(),
  marchio: z.object({
    mostraOnWay: z.boolean(),
  }).partial(),
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
  }).partial(),
}).partial();

const dominioSchema = z.string().url().refine((u) => {
  try { return !!new URL(u).hostname; } catch { return false; }
}, 'Deve essere un URL completo, es. https://www.esempio.it');

export const creaWhiteLabelSchema = z.object({
  organizzatoreId: z.string().min(1),
  // Uno dei due: white label di un evento, oppure di un bundle.
  eventoId: z.string().min(1).optional(),
  bundleId: z.string().min(1).optional(),
  dominiAutorizzati: z.array(dominioSchema).default([]),
  tema: temaSchema.optional(),
  layoutBigliettoId: z.string().nullable().optional(),
  metaPixelId: z.string().nullable().optional(),
  metaCapiToken: z.string().nullable().optional(),
}).refine((d) => !!d.eventoId !== !!d.bundleId, { message: 'Indica un evento oppure un bundle (uno solo).', path: ['eventoId'] });

export const aggiornaWhiteLabelSchema = z.object({
  attiva: z.boolean().optional(),
  dominiAutorizzati: z.array(dominioSchema).optional(),
  tema: temaSchema.optional(),
  layoutBigliettoId: z.string().nullable().optional(),
  metaPixelId: z.string().nullable().optional(),
  metaCapiToken: z.string().nullable().optional(),
});
