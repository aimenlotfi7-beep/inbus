import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { whiteLabel, organizzatoreEventi, organizzatori, eventi } from '../../db/schema.js';
import { normalizzaTema, DEFAULT_WHITE_LABEL_THEME, type WhiteLabelTheme } from './white-label.theme.js';
import { WhiteLabelNonTrovata, OrganizzatoreNonAutorizzato, AssociazioneGiaEsistente } from './white-label.errors.js';
import type { z } from 'zod';
import type { creaWhiteLabelSchema, aggiornaWhiteLabelSchema } from './white-label.dto.js';

function generaPublicWidgetId(): string {
  return crypto.randomBytes(16).toString('hex');
}

async function getRigaCompleta(id: string) {
  const [riga] = await db
    .select({
      whiteLabel,
      organizzatoreNome: organizzatori.nome,
      eventoArtista: eventi.artista,
    })
    .from(whiteLabel)
    .innerJoin(organizzatori, eq(whiteLabel.organizzatoreId, organizzatori.id))
    .innerJoin(eventi, eq(whiteLabel.eventoId, eventi.id))
    .where(eq(whiteLabel.id, id))
    .limit(1);
  if (!riga) throw new WhiteLabelNonTrovata();
  return {
    ...riga.whiteLabel,
    tema: normalizzaTema(riga.whiteLabel.tema),
    organizzatoreNome: riga.organizzatoreNome,
    eventoArtista: riga.eventoArtista,
  };
}

export const whiteLabelService = {
  async list() {
    const righe = await db
      .select({
        whiteLabel,
        organizzatoreNome: organizzatori.nome,
        eventoArtista: eventi.artista,
      })
      .from(whiteLabel)
      .innerJoin(organizzatori, eq(whiteLabel.organizzatoreId, organizzatori.id))
      .innerJoin(eventi, eq(whiteLabel.eventoId, eventi.id));
    return righe.map((r) => ({ ...r.whiteLabel, tema: normalizzaTema(r.whiteLabel.tema), organizzatoreNome: r.organizzatoreNome, eventoArtista: r.eventoArtista }));
  },

  getById: getRigaCompleta,

  async perEvento(eventoId: string) {
    const righe = await db
      .select({ whiteLabel, organizzatoreNome: organizzatori.nome })
      .from(whiteLabel)
      .innerJoin(organizzatori, eq(whiteLabel.organizzatoreId, organizzatori.id))
      .where(eq(whiteLabel.eventoId, eventoId));
    return righe.map((r) => ({ ...r.whiteLabel, tema: normalizzaTema(r.whiteLabel.tema), organizzatoreNome: r.organizzatoreNome }));
  },

  async create(input: z.infer<typeof creaWhiteLabelSchema>) {
    const [associazione] = await db
      .select()
      .from(organizzatoreEventi)
      .where(and(eq(organizzatoreEventi.organizzatoreId, input.organizzatoreId), eq(organizzatoreEventi.eventoId, input.eventoId)))
      .limit(1);
    if (!associazione) throw new OrganizzatoreNonAutorizzato();

    const [giaEsistente] = await db
      .select()
      .from(whiteLabel)
      .where(and(eq(whiteLabel.organizzatoreId, input.organizzatoreId), eq(whiteLabel.eventoId, input.eventoId)))
      .limit(1);
    if (giaEsistente) throw new AssociazioneGiaEsistente();

    const temaCompleto: WhiteLabelTheme = input.tema ? normalizzaTema(input.tema) : DEFAULT_WHITE_LABEL_THEME;

    const [nuova] = await db.insert(whiteLabel).values({
      organizzatoreId: input.organizzatoreId,
      eventoId: input.eventoId,
      publicWidgetId: generaPublicWidgetId(),
      dominiAutorizzati: input.dominiAutorizzati,
      tema: temaCompleto,
    }).returning();
    return getRigaCompleta(nuova.id);
  },

  async update(id: string, input: z.infer<typeof aggiornaWhiteLabelSchema>) {
    await getRigaCompleta(id);
    const aggiornamenti: Record<string, unknown> = { aggiornatoIl: new Date() };
    if (input.attiva !== undefined) aggiornamenti.attiva = input.attiva;
    if (input.dominiAutorizzati !== undefined) aggiornamenti.dominiAutorizzati = input.dominiAutorizzati;
    if (input.tema !== undefined) {
      const attuale = await getRigaCompleta(id);
      aggiornamenti.tema = normalizzaTema({ ...attuale.tema, ...input.tema });
    }
    await db.update(whiteLabel).set(aggiornamenti).where(eq(whiteLabel.id, id));
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
    await db.delete(whiteLabel).where(eq(whiteLabel.id, id));
  },

  async getPubblicaDaWidgetId(publicWidgetId: string) {
    const [riga] = await db
      .select({ whiteLabel, evento: eventi })
      .from(whiteLabel)
      .innerJoin(eventi, eq(whiteLabel.eventoId, eventi.id))
      .where(eq(whiteLabel.publicWidgetId, publicWidgetId))
      .limit(1);
    if (!riga) throw new WhiteLabelNonTrovata();

    return {
      attiva: riga.whiteLabel.attiva,
      tema: normalizzaTema(riga.whiteLabel.tema),
      dominiAutorizzati: riga.whiteLabel.dominiAutorizzati as string[],
      evento: {
        id: riga.evento.id,
        slug: riga.evento.slug,
        artista: riga.evento.artista,
        data: riga.evento.data,
        luogo: riga.evento.luogo,
        citta: riga.evento.citta,
        descrizione: riga.evento.descrizione,
      },
    };
  },

  /** Come getPubblicaDaWidgetId, ma con l'id interno della riga e
   *  l'eventoId veri — usata SOLO lato server (nel checkout del
   *  widget), mai esposta al pubblico così com'è: qui dentro non c'è
   *  nulla di sensibile, ma l'id interno non serve al widget stesso,
   *  solo al backend per attribuire correttamente la vendita. */
  async getPubblicaConIdInterno(publicWidgetId: string) {
    const [riga] = await db.select().from(whiteLabel).where(eq(whiteLabel.publicWidgetId, publicWidgetId)).limit(1);
    if (!riga) throw new WhiteLabelNonTrovata();
    return riga;
  },
};
