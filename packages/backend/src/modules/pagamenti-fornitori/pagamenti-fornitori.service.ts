import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { amministratori, busFisici, eventi, fornitori, linee, pagamentiFornitore, speseFornitore, tragitti } from '../../db/schema.js';
import { ConflittoDati, NonTrovato } from '../../shared/errors.js';
import { perFornitore, residuoSpesa, riepilogo, spesaInScadenza, spesaScaduta, statoSpesa, type StatoSpesa } from './calcoli.js';
import type { CreaSpesaInput, AggiornaSpesaInput, PagamentoInput } from './pagamenti-fornitori.dto.js';

/** Pagamenti ai fornitori (proprietario, settembre 2026): l'elenco di
 *  quanto si deve, i dati della fattura e i versamenti fatti, anche in
 *  più volte. Le spese dei bus confermati si allineano da sole
 *  (allineaDaiBus), quelle in più si aggiungono a mano. */

export interface FiltriSpese {
  stato?: StatoSpesa | 'SCADUTE';
  fornitoreId?: string;
  eventoId?: string;
  /** Periodo sulla data di riferimento: scadenza, o data fattura, o creazione. */
  dal?: Date;
  al?: Date;
  testo?: string;
}

export interface SpesaInElenco {
  id: string;
  fornitoreId: string;
  fornitoreNome: string;
  eventoId: string | null;
  eventoArtista: string | null;
  eventoData: string | null;
  busId: string | null;
  origine: 'BUS' | 'MANUALE';
  descrizione: string;
  importo: number;
  pagato: number;
  residuo: number;
  stato: StatoSpesa;
  scaduta: boolean;
  inScadenza: boolean;
  numeroFattura: string | null;
  dataFattura: string | null;
  scadenza: string | null;
  fatturaUrl: string | null;
  note: string | null;
  annullata: boolean;
  numeroPagamenti: number;
}

const giorno = (d: Date | null) => (d ? d.toISOString() : null);
const euro = (n: string | number | null) => Number(n ?? 0);

/** Mezzanotte di oggi: le scadenze si confrontano per giorno, non per ora. */
function inizioOggi(): Date {
  const ora = new Date();
  return new Date(ora.getFullYear(), ora.getMonth(), ora.getDate());
}

/** Tutte le spese con quanto è già stato pagato (una query sola). */
async function leggiSpese(filtri: Pick<FiltriSpese, 'fornitoreId' | 'eventoId' | 'dal' | 'al' | 'testo'>) {
  const dataRiferimento = sql`coalesce(${speseFornitore.scadenza}, ${speseFornitore.dataFattura}, ${speseFornitore.creataIl})`;
  const condizioni = [
    filtri.fornitoreId ? eq(speseFornitore.fornitoreId, filtri.fornitoreId) : undefined,
    filtri.eventoId ? eq(speseFornitore.eventoId, filtri.eventoId) : undefined,
    filtri.dal ? sql`${dataRiferimento} >= ${filtri.dal}` : undefined,
    filtri.al ? sql`${dataRiferimento} <= ${filtri.al}` : undefined,
    filtri.testo
      ? sql`(${speseFornitore.descrizione} ilike ${`%${filtri.testo}%`} or ${fornitori.nome} ilike ${`%${filtri.testo}%`} or coalesce(${speseFornitore.numeroFattura}, '') ilike ${`%${filtri.testo}%`})`
      : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: speseFornitore.id,
      fornitoreId: speseFornitore.fornitoreId,
      fornitoreNome: fornitori.nome,
      eventoId: speseFornitore.eventoId,
      eventoArtista: eventi.artista,
      eventoData: eventi.data,
      busId: speseFornitore.busId,
      origine: speseFornitore.origine,
      descrizione: speseFornitore.descrizione,
      importo: speseFornitore.importo,
      numeroFattura: speseFornitore.numeroFattura,
      dataFattura: speseFornitore.dataFattura,
      scadenza: speseFornitore.scadenza,
      fatturaUrl: speseFornitore.fatturaUrl,
      note: speseFornitore.note,
      annullata: speseFornitore.annullata,
      creataIl: speseFornitore.creataIl,
      pagato: sql<string>`coalesce(sum(${pagamentiFornitore.importo}), '0')`,
      numeroPagamenti: sql<number>`count(${pagamentiFornitore.id})::int`,
    })
    .from(speseFornitore)
    .innerJoin(fornitori, eq(fornitori.id, speseFornitore.fornitoreId))
    .leftJoin(eventi, eq(eventi.id, speseFornitore.eventoId))
    .leftJoin(pagamentiFornitore, eq(pagamentiFornitore.spesaId, speseFornitore.id))
    .where(condizioni.length ? and(...condizioni) : undefined)
    .groupBy(speseFornitore.id, fornitori.nome, eventi.artista, eventi.data)
    .orderBy(desc(sql`coalesce(${speseFornitore.scadenza}, ${speseFornitore.dataFattura}, ${speseFornitore.creataIl})`));
}

export const pagamentiFornitoriService = {
  /** L'elenco, il riepilogo in cima e le voci dei filtri, in un colpo
   *  solo. Il riepilogo è sempre su TUTTE le spese del periodo e del
   *  fornitore scelti, anche quando l'elenco è ristretto a uno stato:
   *  altrimenti filtrando "Da pagare" i totali cambierebbero sotto gli
   *  occhi e non direbbero più quanto si deve davvero. */
  async elenco(filtri: FiltriSpese) {
    await this.allineaDaiBus();
    const righe = await leggiSpese(filtri);
    const oggi = inizioOggi();

    const spese: SpesaInElenco[] = righe.map((r) => {
      const valutata = { importo: euro(r.importo), pagato: euro(r.pagato), annullata: r.annullata, scadenza: r.scadenza };
      return {
        id: r.id,
        fornitoreId: r.fornitoreId,
        fornitoreNome: r.fornitoreNome,
        eventoId: r.eventoId,
        eventoArtista: r.eventoArtista,
        eventoData: giorno(r.eventoData),
        busId: r.busId,
        origine: r.origine,
        descrizione: r.descrizione,
        importo: valutata.importo,
        pagato: valutata.pagato,
        residuo: residuoSpesa(valutata),
        stato: statoSpesa(valutata),
        scaduta: spesaScaduta(valutata, oggi),
        inScadenza: spesaInScadenza(valutata, oggi, 7),
        numeroFattura: r.numeroFattura,
        dataFattura: giorno(r.dataFattura),
        scadenza: giorno(r.scadenza),
        fatturaUrl: r.fatturaUrl,
        note: r.note,
        annullata: r.annullata,
        numeroPagamenti: r.numeroPagamenti,
      };
    });

    const perCalcoli = spese.map((s) => ({
      importo: s.importo, pagato: s.pagato, annullata: s.annullata,
      scadenza: s.scadenza ? new Date(s.scadenza) : null,
      haFattura: !!s.numeroFattura,
      fornitoreId: s.fornitoreId, fornitoreNome: s.fornitoreNome,
    }));

    const filtrate = filtri.stato
      ? spese.filter((s) => (filtri.stato === 'SCADUTE' ? s.scaduta : s.stato === filtri.stato))
      : spese;

    return {
      spese: filtrate,
      riepilogo: riepilogo(perCalcoli, oggi),
      perFornitore: perFornitore(perCalcoli).slice(0, 10),
      filtri: await vociDeiFiltri(),
    };
  },

  async pagamenti(spesaId: string) {
    await trovaSpesa(spesaId);
    return db
      .select({
        id: pagamentiFornitore.id,
        importo: pagamentiFornitore.importo,
        pagatoIl: pagamentiFornitore.pagatoIl,
        metodo: pagamentiFornitore.metodo,
        riferimento: pagamentiFornitore.riferimento,
        note: pagamentiFornitore.note,
        registratoDaNome: amministratori.nome,
      })
      .from(pagamentiFornitore)
      .leftJoin(amministratori, eq(amministratori.id, pagamentiFornitore.registratoDa))
      .where(eq(pagamentiFornitore.spesaId, spesaId))
      .orderBy(asc(pagamentiFornitore.pagatoIl));
  },

  async crea(input: CreaSpesaInput) {
    const [nuova] = await db.insert(speseFornitore).values({
      ...datiSpesa(input),
      fornitoreId: input.fornitoreId,
      descrizione: input.descrizione,
      importo: input.importo.toFixed(2),
      origine: 'MANUALE',
    }).returning();
    return nuova;
  },

  async aggiorna(id: string, input: AggiornaSpesaInput) {
    const spesa = await trovaSpesa(id);
    // L'importo non può scendere sotto quanto è già stato pagato:
    // resterebbe un pagamento senza spesa che lo giustifica.
    if (input.importo !== undefined) {
      const pagato = await sommaPagamenti(id);
      if (input.importo + 0.005 < pagato) {
        throw new ConflittoDati(`Sono già stati registrati pagamenti per ${pagato.toFixed(2)} €: l'importo non può essere più basso.`);
      }
    }
    const [aggiornata] = await db.update(speseFornitore).set({
      ...datiSpesa(input),
      ...(input.descrizione !== undefined ? { descrizione: input.descrizione } : {}),
      ...(input.importo !== undefined ? { importo: input.importo.toFixed(2) } : {}),
      ...(input.annullata !== undefined ? { annullata: input.annullata } : {}),
      aggiornataIl: new Date(),
    }).where(eq(speseFornitore.id, spesa.id)).returning();
    return aggiornata;
  },

  /** Si elimina solo una spesa aggiunta a mano e senza pagamenti: quelle
   *  dei bus tornerebbero comunque al giro successivo, e una spesa già
   *  pagata va tenuta nello storico (semmai si annulla). */
  async elimina(id: string) {
    const spesa = await trovaSpesa(id);
    if (spesa.origine === 'BUS') throw new ConflittoDati('Questa spesa arriva da un bus confermato: si può annullare, non eliminare.');
    if (await sommaPagamenti(id) > 0) throw new ConflittoDati('Ci sono pagamenti registrati: annulla la spesa invece di eliminarla.');
    await db.delete(speseFornitore).where(eq(speseFornitore.id, spesa.id));
  },

  /** Registra un versamento. Il totale pagato non può superare la spesa
   *  (errore invece di un saldo strano), e il controllo sta dentro la
   *  stessa transazione dell'inserimento: due registrazioni insieme non
   *  passano entrambe. */
  async registraPagamento(spesaId: string, input: PagamentoInput, amministratoreId?: string) {
    return db.transaction(async (tx) => {
      const [spesa] = await tx.select().from(speseFornitore).where(eq(speseFornitore.id, spesaId)).for('update').limit(1);
      if (!spesa) throw new NonTrovato('Spesa');
      if (spesa.annullata) throw new ConflittoDati('La spesa è annullata: riattivala prima di registrare un pagamento.');

      const [{ pagato }] = await tx
        .select({ pagato: sql<string>`coalesce(sum(${pagamentiFornitore.importo}), '0')` })
        .from(pagamentiFornitore).where(eq(pagamentiFornitore.spesaId, spesaId));
      const residuo = Number(spesa.importo) - Number(pagato);
      if (input.importo > residuo + 0.005) {
        throw new ConflittoDati(`Restano da pagare ${residuo.toFixed(2)} €: l'importo è troppo alto.`);
      }

      const [nuovo] = await tx.insert(pagamentiFornitore).values({
        spesaId,
        importo: input.importo.toFixed(2),
        pagatoIl: input.pagatoIl,
        metodo: input.metodo,
        riferimento: input.riferimento ?? null,
        note: input.note ?? null,
        registratoDa: amministratoreId ?? null,
      }).returning();
      await tx.update(speseFornitore).set({ aggiornataIl: new Date() }).where(eq(speseFornitore.id, spesaId));
      return nuovo;
    });
  },

  async eliminaPagamento(id: string) {
    const [tolto] = await db.delete(pagamentiFornitore).where(eq(pagamentiFornitore.id, id)).returning();
    if (!tolto) throw new NonTrovato('Pagamento');
  },

  /** I bus confermati con un fornitore e un costo diventano spese da
   *  pagare, senza doverle ricopiare a mano. Finché una spesa non è
   *  stata toccata (nessun pagamento, nessuna fattura) segue il costo
   *  del bus: se il costo cambia in Partenze, cambia anche qui. Dopo,
   *  resta ferma — il numero da pagare è quello della fattura ricevuta. */
  async allineaDaiBus() {
    const righe = await db
      .select({
        busId: busFisici.id,
        riferimento: busFisici.riferimento,
        fornitoreId: busFisici.fornitoreId,
        costo: busFisici.costo,
        eventoId: eventi.id,
        eventoArtista: eventi.artista,
        tragittoNome: tragitti.nome,
        spesaId: speseFornitore.id,
        spesaImporto: speseFornitore.importo,
        spesaOrigine: speseFornitore.origine,
        spesaFornitoreId: speseFornitore.fornitoreId,
        spesaNumeroFattura: speseFornitore.numeroFattura,
        spesaAnnullata: speseFornitore.annullata,
        pagamenti: sql<number>`count(${pagamentiFornitore.id})::int`,
      })
      .from(busFisici)
      .innerJoin(linee, eq(linee.id, busFisici.lineaId))
      .innerJoin(tragitti, eq(tragitti.id, linee.tragittoId))
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .leftJoin(speseFornitore, eq(speseFornitore.busId, busFisici.id))
      .leftJoin(pagamentiFornitore, eq(pagamentiFornitore.spesaId, speseFornitore.id))
      .where(and(isNotNull(busFisici.fornitoreId), isNotNull(busFisici.costo), isNull(eventi.eliminatoIl)))
      .groupBy(busFisici.id, eventi.id, tragitti.nome, speseFornitore.id);

    let create = 0;
    let allineate = 0;
    for (const r of righe) {
      const descrizione = `Bus ${r.riferimento} — ${r.eventoArtista}${r.tragittoNome ? ` · ${r.tragittoNome}` : ''}`;
      if (!r.spesaId) {
        // onConflictDoNothing: se due giri partono insieme (salvataggio di
        // un bus e apertura della schermata) la spesa resta una sola.
        const inserite = await db.insert(speseFornitore).values({
          fornitoreId: r.fornitoreId!,
          eventoId: r.eventoId,
          busId: r.busId,
          origine: 'BUS',
          descrizione,
          importo: Number(r.costo).toFixed(2),
        }).onConflictDoNothing().returning();
        create += inserite.length;
        continue;
      }
      const daToccare = r.spesaOrigine === 'BUS' && !r.spesaAnnullata && !r.spesaNumeroFattura && r.pagamenti === 0;
      const cambiata = Number(r.spesaImporto) !== Number(r.costo) || r.spesaFornitoreId !== r.fornitoreId;
      if (daToccare && cambiata) {
        await db.update(speseFornitore)
          .set({ importo: Number(r.costo).toFixed(2), fornitoreId: r.fornitoreId!, descrizione, aggiornataIl: new Date() })
          .where(eq(speseFornitore.id, r.spesaId));
        allineate++;
      }
    }
    return { create, allineate };
  },
};

/** I campi comuni a creazione e modifica (fattura, evento, note). */
function datiSpesa(input: CreaSpesaInput | AggiornaSpesaInput) {
  return {
    ...(input.eventoId !== undefined ? { eventoId: input.eventoId } : {}),
    ...(input.numeroFattura !== undefined ? { numeroFattura: input.numeroFattura } : {}),
    ...(input.dataFattura !== undefined ? { dataFattura: input.dataFattura } : {}),
    ...(input.scadenza !== undefined ? { scadenza: input.scadenza } : {}),
    ...(input.fatturaUrl !== undefined ? { fatturaUrl: input.fatturaUrl } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
}

async function trovaSpesa(id: string) {
  const [spesa] = await db.select().from(speseFornitore).where(eq(speseFornitore.id, id)).limit(1);
  if (!spesa) throw new NonTrovato('Spesa');
  return spesa;
}

async function sommaPagamenti(spesaId: string): Promise<number> {
  const [{ pagato }] = await db
    .select({ pagato: sql<string>`coalesce(sum(${pagamentiFornitore.importo}), '0')` })
    .from(pagamentiFornitore).where(eq(pagamentiFornitore.spesaId, spesaId));
  return Number(pagato);
}

/** Solo i fornitori e gli eventi che hanno davvero una spesa: i menu a
 *  tendina dei filtri restano corti e senza voci che non filtrano nulla. */
async function vociDeiFiltri() {
  const [perFornitori, perEventi] = await Promise.all([
    db.selectDistinct({ id: fornitori.id, nome: fornitori.nome })
      .from(speseFornitore).innerJoin(fornitori, eq(fornitori.id, speseFornitore.fornitoreId)).orderBy(asc(fornitori.nome)),
    db.selectDistinct({ id: eventi.id, artista: eventi.artista, data: eventi.data })
      .from(speseFornitore).innerJoin(eventi, eq(eventi.id, speseFornitore.eventoId)).orderBy(desc(eventi.data)),
  ]);
  return {
    fornitori: perFornitori,
    eventi: perEventi.map((e) => ({ id: e.id, artista: e.artista, data: e.data.toISOString() })),
  };
}
