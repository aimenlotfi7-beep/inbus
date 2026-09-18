import { eq, and, isNull, inArray, asc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { whiteLabel, whiteLabelEventi, organizzatoreEventi, organizzatori, eventi, prenotazioni, bundle } from '../../db/schema.js';
import { ConflittoDati, ErroreApplicativo, NonTrovato } from '../../shared/errors.js';
import { inizioOggiRoma } from '../../shared/formato.js';
import { prezzoMinimoEvento } from '../../shared/prezzi.js';
import { normalizzaTema, DEFAULT_WHITE_LABEL_THEME, type WhiteLabelTheme } from './white-label.theme.js';
import { WhiteLabelNonTrovata, OrganizzatoreNonAutorizzato, AssociazioneGiaEsistente } from './white-label.errors.js';
import type { z } from 'zod';
import type { creaWhiteLabelSchema, aggiornaWhiteLabelSchema } from './white-label.dto.js';

function generaPublicWidgetId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------- Eventi della White Label
//
// Proprietario, settembre 2026: una White Label vende uno o più eventi
// scelti uno per uno (whiteLabelEventi). Con uno il cliente va dritto alla
// prenotazione, con due o più sceglie tra le card; ogni evento ha anche il
// suo link e il suo codice (?evento=slug). L'anno dopo si cambia solo
// l'evento: grafica, link e codice incollato dal cliente restano gli stessi.

/** Com'è un evento dell'elenco oggi, per il gestionale. */
export type StatoEventoWhiteLabel = 'in-vendita' | 'vendite-ferme' | 'passato' | 'bozza' | 'cestino';

export interface EventoDellaWhiteLabel {
  id: string;
  slug: string;
  artista: string;
  citta: string;
  data: Date;
  stato: StatoEventoWhiteLabel;
}

function statoEvento(e: { data: Date; bozza: boolean; eliminatoIl: Date | null; venditeFermate: boolean }): StatoEventoWhiteLabel {
  if (e.eliminatoIl) return 'cestino';
  if (e.bozza) return 'bozza';
  if (e.data < inizioOggiRoma()) return 'passato';
  return e.venditeFermate ? 'vendite-ferme' : 'in-vendita';
}

/** Gli eventi dell'elenco di ogni White Label indicata, dal più vicino. */
async function eventiPerWhiteLabel(whiteLabelIds: string[]): Promise<Map<string, EventoDellaWhiteLabel[]>> {
  const perWhiteLabel = new Map<string, EventoDellaWhiteLabel[]>();
  if (whiteLabelIds.length === 0) return perWhiteLabel;
  const righe = await db
    .select({
      whiteLabelId: whiteLabelEventi.whiteLabelId, id: eventi.id, slug: eventi.slug, artista: eventi.artista, citta: eventi.citta,
      data: eventi.data, bozza: eventi.bozza, eliminatoIl: eventi.eliminatoIl, venditeFermate: eventi.venditeFermate,
    })
    .from(whiteLabelEventi)
    .innerJoin(eventi, eq(eventi.id, whiteLabelEventi.eventoId))
    .where(inArray(whiteLabelEventi.whiteLabelId, whiteLabelIds))
    .orderBy(asc(eventi.data));
  for (const r of righe) {
    const voce: EventoDellaWhiteLabel = { id: r.id, slug: r.slug, artista: r.artista, citta: r.citta, data: r.data, stato: statoEvento(r) };
    perWhiteLabel.set(r.whiteLabelId, [...(perWhiteLabel.get(r.whiteLabelId) ?? []), voce]);
  }
  return perWhiteLabel;
}

async function idsEventi(whiteLabelId: string): Promise<string[]> {
  const righe = await db.select({ eventoId: whiteLabelEventi.eventoId }).from(whiteLabelEventi).where(eq(whiteLabelEventi.whiteLabelId, whiteLabelId));
  return righe.map((r) => r.eventoId);
}

type Lettore = Pick<typeof db, 'select' | 'insert'>;

/** Gli eventi scelti devono esistere (non nel cestino); scegliendoli per la
 *  White Label di un organizzatore gli si associano anche (il suo portale e
 *  le sue statistiche li mostrano), senza passare da Organizzatori. */
async function preparaEventi(tx: Lettore, organizzatoreId: string, eventiIds: string[]) {
  if (eventiIds.length === 0) return;
  const trovati = await tx.select({ id: eventi.id }).from(eventi).where(and(inArray(eventi.id, eventiIds), isNull(eventi.eliminatoIl)));
  if (trovati.length !== eventiIds.length) throw new ConflittoDati('Uno degli eventi scelti non esiste più o è nel cestino.');
  await tx.insert(organizzatoreEventi).values(eventiIds.map((eventoId) => ({ organizzatoreId, eventoId }))).onConflictDoNothing();
}

// ---------------------------------------------------------------- Gestionale

async function getRigaCompleta(id: string) {
  // leftJoin sul bundle: una white label vende eventi O un bundle.
  const [riga] = await db
    .select({ whiteLabel, organizzatoreNome: organizzatori.nome, bundleNome: bundle.nome })
    .from(whiteLabel)
    .innerJoin(organizzatori, eq(whiteLabel.organizzatoreId, organizzatori.id))
    .leftJoin(bundle, eq(whiteLabel.bundleId, bundle.id))
    .where(eq(whiteLabel.id, id))
    .limit(1);
  if (!riga) throw new WhiteLabelNonTrovata();
  const elenchi = await eventiPerWhiteLabel([id]);
  return inRisposta(riga.whiteLabel, riga.organizzatoreNome, riga.bundleNome, elenchi.get(id) ?? []);
}

/** La White Label per il gestionale: senza la vecchia colonna evento_id
 *  (ora c'è l'elenco degli eventi). */
function inRisposta(wl: typeof whiteLabel.$inferSelect, organizzatoreNome: string, bundleNome: string | null, elenco: EventoDellaWhiteLabel[]) {
  const { eventoId: _vecchioEvento, ...resto } = wl;
  return { ...resto, tema: normalizzaTema(wl.tema), organizzatoreNome, bundleNome, eventi: elenco };
}

/** Un evento come card della pagina pubblica: i dati per sceglierlo, con il
 *  prezzo vero ("da … €") e la sua prima immagine. */
export interface CardEvento {
  id: string;
  slug: string;
  artista: string;
  data: Date;
  luogo: string;
  citta: string;
  descrizione: string | null;
  immagineUrl: string | null;
  prezzoMinimo: number | null;
}

/** Gli eventi dell'elenco che oggi si possono prenotare, dal più vicino:
 *  come la pagina dell'evento (niente bozze, cestino, passati o senza
 *  tragitti in vendita; "Visibile sul sito" non conta) e senza quelli con
 *  "Ferma vendite". */
async function eventiInVendita(whiteLabelId: string): Promise<CardEvento[]> {
  const { eventiService } = await import('../eventi/eventi.service.js');
  const carte: CardEvento[] = [];
  for (const id of await idsEventi(whiteLabelId)) {
    let e: Awaited<ReturnType<typeof eventiService.getPerWidget>>;
    try {
      e = await eventiService.getPerWidget(id);
    } catch (errore) {
      if (errore instanceof NonTrovato) continue;
      throw errore;
    }
    if (e.venditeFermate) continue;
    const immagine = [...e.immagini].sort((a, b) => a.ordine - b.ordine)[0];
    carte.push({
      id: e.id, slug: e.slug, artista: e.artista, data: e.data, luogo: e.luogo, citta: e.citta, descrizione: e.descrizione,
      immagineUrl: immagine?.url ?? null, prezzoMinimo: prezzoMinimoEvento(e),
    });
  }
  return carte.sort((a, b) => a.data.getTime() - b.data.getTime());
}

export const whiteLabelService = {
  async list() {
    const righe = await db
      .select({ whiteLabel, organizzatoreNome: organizzatori.nome, bundleNome: bundle.nome })
      .from(whiteLabel)
      .innerJoin(organizzatori, eq(whiteLabel.organizzatoreId, organizzatori.id))
      .leftJoin(bundle, eq(whiteLabel.bundleId, bundle.id));
    const elenchi = await eventiPerWhiteLabel(righe.map((r) => r.whiteLabel.id));
    return righe.map((r) => inRisposta(r.whiteLabel, r.organizzatoreNome, r.bundleNome, elenchi.get(r.whiteLabel.id) ?? []));
  },

  getById: getRigaCompleta,

  async create(input: z.infer<typeof creaWhiteLabelSchema>) {
    const eventiIds = [...new Set(input.eventiIds ?? (input.eventoId ? [input.eventoId] : []))];
    if (input.bundleId) {
      // Bundle: l'associazione all'organizzatore è bundle.organizzatoreId
      // (impostata nella scheda Bundle) — gli eventi dentro possono
      // essere di chiunque, come deciso.
      const [b] = await db.select().from(bundle).where(and(eq(bundle.id, input.bundleId), isNull(bundle.eliminatoIl))).limit(1);
      if (!b || b.organizzatoreId !== input.organizzatoreId) throw new OrganizzatoreNonAutorizzato();
      const [gia] = await db.select().from(whiteLabel).where(and(eq(whiteLabel.organizzatoreId, input.organizzatoreId), eq(whiteLabel.bundleId, input.bundleId))).limit(1);
      if (gia) throw new AssociazioneGiaEsistente();
    }

    const temaCompleto: WhiteLabelTheme = input.tema ? normalizzaTema(input.tema) : DEFAULT_WHITE_LABEL_THEME;
    const id = await db.transaction(async (tx) => {
      if (!input.bundleId) await preparaEventi(tx, input.organizzatoreId, eventiIds);
      const [nuova] = await tx.insert(whiteLabel).values({
        organizzatoreId: input.organizzatoreId,
        bundleId: input.bundleId ?? null,
        publicWidgetId: generaPublicWidgetId(),
        dominiAutorizzati: input.dominiAutorizzati,
        tema: temaCompleto,
        layoutBigliettoId: input.layoutBigliettoId ?? null,
        // Prima si perdevano: arrivavano dal modulo ma non si salvavano.
        metaPixelId: input.metaPixelId ?? null,
        metaCapiToken: input.metaCapiToken ?? null,
      }).returning();
      if (!input.bundleId && eventiIds.length > 0) {
        await tx.insert(whiteLabelEventi).values(eventiIds.map((eventoId) => ({ whiteLabelId: nuova.id, eventoId })));
      }
      return nuova.id;
    });
    return getRigaCompleta(id);
  },

  async update(id: string, input: z.infer<typeof aggiornaWhiteLabelSchema>) {
    await getRigaCompleta(id);
    const aggiornamenti: Record<string, unknown> = { aggiornatoIl: new Date() };
    if (input.attiva !== undefined) aggiornamenti.attiva = input.attiva;
    if (input.dominiAutorizzati !== undefined) aggiornamenti.dominiAutorizzati = input.dominiAutorizzati;
    if (input.layoutBigliettoId !== undefined) aggiornamenti.layoutBigliettoId = input.layoutBigliettoId;
    if (input.metaPixelId !== undefined) aggiornamenti.metaPixelId = input.metaPixelId;
    if (input.metaCapiToken !== undefined) aggiornamenti.metaCapiToken = input.metaCapiToken;
    if (input.tema !== undefined) {
      const attuale = await getRigaCompleta(id);
      aggiornamenti.tema = normalizzaTema({ ...attuale.tema, ...input.tema });
    }
    await db.update(whiteLabel).set(aggiornamenti).where(eq(whiteLabel.id, id));
    return getRigaCompleta(id);
  },

  /** Cambia l'elenco degli eventi (aggiungere, togliere, sostituire quello
   *  dell'anno prima): link, codice e grafica restano gli stessi. */
  async impostaEventi(id: string, eventiIds: string[]) {
    const attuale = await getRigaCompleta(id);
    if (attuale.bundleId) throw new ConflittoDati('Questa White Label vende un bundle: i suoi eventi si cambiano nella scheda del bundle.');
    const nuovi = [...new Set(eventiIds)];
    await db.transaction(async (tx) => {
      await preparaEventi(tx, attuale.organizzatoreId, nuovi);
      const daTogliere = attuale.eventi.map((e) => e.id).filter((eventoId) => !nuovi.includes(eventoId));
      if (daTogliere.length > 0) {
        await tx.delete(whiteLabelEventi).where(and(eq(whiteLabelEventi.whiteLabelId, id), inArray(whiteLabelEventi.eventoId, daTogliere)));
      }
      if (nuovi.length > 0) {
        await tx.insert(whiteLabelEventi).values(nuovi.map((eventoId) => ({ whiteLabelId: id, eventoId }))).onConflictDoNothing();
      }
      await tx.update(whiteLabel).set({ aggiornatoIl: new Date() }).where(eq(whiteLabel.id, id));
    });
    return getRigaCompleta(id);
  },

  async rigeneraPublicWidgetId(id: string) {
    await getRigaCompleta(id);
    const nuovoId = generaPublicWidgetId();
    await db.update(whiteLabel).set({ publicWidgetId: nuovoId, aggiornatoIl: new Date() }).where(eq(whiteLabel.id, id));
    return getRigaCompleta(id);
  },

  async remove(id: string) {
    await getRigaCompleta(id);
    // Una prenotazione fatta tramite questo widget lo referenzia
    // direttamente (prenotazioni.white_label_id) — senza questo
    // controllo, eliminare un white-label già usato da un cliente vero
    // fallirebbe con un errore grezzo del database invece di un
    // messaggio comprensibile.
    const [inUso] = await db.select({ id: prenotazioni.id }).from(prenotazioni).where(eq(prenotazioni.whiteLabelId, id)).limit(1);
    if (inUso) throw new ConflittoDati('Questo white-label ha già almeno una prenotazione collegata — non può essere eliminato (disattivalo invece, con l\'interruttore).');
    await db.delete(whiteLabel).where(eq(whiteLabel.id, id));
  },

  // ---------------------------------------------------------------- Pagina pubblica

  /** Quello che serve alla pagina del link e al codice da incollare. Con
   *  gli eventi: le card di quelli in vendita e, se ce n'è uno solo o se
   *  il link ne indica uno (?evento= con lo slug o l'id), quello da aprire
   *  subito. Un evento indicato che non c'è più (tolto, passato) non è un
   *  errore: si vedono le card, così il vecchio link resta buono. */
  async getPubblicaDaWidgetId(publicWidgetId: string, eventoRichiesto?: string) {
    const [riga] = await db.select().from(whiteLabel).where(eq(whiteLabel.publicWidgetId, publicWidgetId)).limit(1);
    if (!riga) throw new WhiteLabelNonTrovata();
    const busta = {
      attiva: riga.attiva,
      tema: normalizzaTema(riga.tema),
      dominiAutorizzati: riga.dominiAutorizzati as string[],
      metaPixelId: riga.metaPixelId, // mai il token, solo l'id — vedi commento sulla colonna
    };

    // Widget di un BUNDLE: stessa busta (attiva/tema/domini), dentro
    // il bundle invece degli eventi — il frontend sceglie il flusso.
    if (riga.bundleId) {
      const { bundleService } = await import('../bundle/bundle.service.js');
      return { ...busta, evento: null, eventi: [], bundle: await bundleService.dettaglioPubblicoPerId(riga.bundleId) };
    }

    const inVendita = await eventiInVendita(riga.id);
    const richiesto = eventoRichiesto ? inVendita.find((e) => e.slug === eventoRichiesto || e.id === eventoRichiesto) : undefined;
    return { ...busta, bundle: null, evento: richiesto ?? (inVendita.length === 1 ? inVendita[0] : null), eventi: inVendita };
  },

  /** Come getPubblicaDaWidgetId, ma con l'id interno della riga — usata SOLO
   *  lato server (nel checkout del widget), mai esposta al pubblico così
   *  com'è: l'id interno serve solo al backend per attribuire la vendita. */
  async getPubblicaConIdInterno(publicWidgetId: string) {
    const [riga] = await db.select().from(whiteLabel).where(eq(whiteLabel.publicWidgetId, publicWidgetId)).limit(1);
    if (!riga) throw new WhiteLabelNonTrovata();
    return riga;
  },

  /** L'evento da prenotare con una White Label di eventi: quello chiesto,
   *  solo se è nel suo elenco; senza richiesta, l'unico dell'elenco. */
  async eventoDellElenco(whiteLabelId: string, eventoRichiesto: unknown): Promise<string> {
    const ids = await idsEventi(whiteLabelId);
    const richiesto = typeof eventoRichiesto === 'string' ? eventoRichiesto : '';
    if (richiesto) {
      if (!ids.includes(richiesto)) throw new NonTrovato('Evento');
      return richiesto;
    }
    if (ids.length === 1) return ids[0];
    throw new ErroreApplicativo('Scegli prima il viaggio da prenotare.', 400, 'EVENTO_DA_SCEGLIERE');
  },

  idsEventi,
};
