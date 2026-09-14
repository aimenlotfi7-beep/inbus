import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { fornitori, preventiviRichieste, preventiviRisposte } from '../../db/schema.js';
import { ConflittoDati } from '../../shared/errors.js';
import { formattaEuro } from '../../shared/formato.js';
import { leggiNotificaNonScelti } from '../impostazioni/impostazioni.routes.js';
import { inviaEmailModello, tragittoConEvento, variabiliTragitto } from './email-fornitori.js';

/** Preventivi per UN bus (deciso dal proprietario, settembre 2026): si
 *  chiedono quando nasce la proposta da confermare, il fornitore scelto
 *  diventa il fornitore di quel bus. Ogni bus può avere un fornitore
 *  diverso; la quotazione del tragitto serve solo a fare i prezzi.
 *
 *  Qui le parti che toccano la conferma della proposta (eventi.service) e
 *  la nascita delle proposte (linee-da-confermare.service). */

type Scrittore = Pick<typeof db, 'select' | 'update'>;

const stesseFermate = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** La risposta scelta per confermare una proposta: deve essere una risposta
 *  a un preventivo per QUESTA proposta, ancora aperto. */
export async function rispostaPerProposta(lettore: Pick<typeof db, 'select'>, rispostaId: string, propostaId: string) {
  const [riga] = await lettore.select({
    rispostaId: preventiviRisposte.id, prezzo: preventiviRisposte.prezzo, postiBus: preventiviRisposte.postiBus,
    fornitoreId: preventiviRichieste.fornitoreId, scopo: preventiviRichieste.scopo, lineaId: preventiviRichieste.lineaId, chiusaIl: preventiviRichieste.chiusaIl,
  }).from(preventiviRisposte)
    .innerJoin(preventiviRichieste, eq(preventiviRichieste.id, preventiviRisposte.richiestaId))
    .where(eq(preventiviRisposte.id, rispostaId)).limit(1);
  if (!riga || riga.scopo !== 'BUS' || riga.lineaId !== propostaId || riga.chiusaIl) {
    throw new ConflittoDati('Questo preventivo non vale più per questo bus: ricarica la pagina.');
  }
  return riga;
}

/** Alla conferma della proposta: la tornata di preventivi si chiude e la
 *  risposta scelta (se c'è) resta legata al bus. Da chiamare nella stessa
 *  transazione della conferma, PRIMA di togliere la proposta. */
export async function chiudiPreventiviBus(tx: Scrittore, propostaId: string, busId: string, rispostaId?: string): Promise<{ richiesteIds: string[] }> {
  const aperte = await tx.select({ id: preventiviRichieste.id }).from(preventiviRichieste)
    .where(and(eq(preventiviRichieste.lineaId, propostaId), eq(preventiviRichieste.scopo, 'BUS'), isNull(preventiviRichieste.chiusaIl)));
  if (aperte.length === 0) return { richiesteIds: [] };
  const richiesteIds = aperte.map((r) => r.id);
  await tx.update(preventiviRichieste).set({ chiusaIl: new Date() }).where(inArray(preventiviRichieste.id, richiesteIds));
  if (rispostaId) await tx.update(preventiviRisposte).set({ busId }).where(eq(preventiviRisposte.id, rispostaId));
  return { richiesteIds };
}

/** Dopo la conferma: al fornitore scelto la mail "preventivo scelto", a chi
 *  ha risposto e non è stato scelto "non scelto" (se attivo in
 *  Impostazioni). Non lancia mai. */
export async function avvisaFornitoriBus(input: { tragittoId: string; nomeBus: string; richiesteIds: string[]; rispostaSceltaId?: string }): Promise<{ sceltoAvvisato: boolean | null; nonSceltiAvvisati: number }> {
  const esito = { sceltoAvvisato: null as boolean | null, nonSceltiAvvisati: 0 };
  if (input.richiesteIds.length === 0) return esito;
  try {
    const { tragitto, evento } = await tragittoConEvento(input.tragittoId);
    const variabili = { ...variabiliTragitto(tragitto, evento), bus: input.nomeBus };
    const risposte = await db.select({ rispostaId: preventiviRisposte.id, prezzo: preventiviRisposte.prezzo, fornitoreId: preventiviRichieste.fornitoreId })
      .from(preventiviRisposte)
      .innerJoin(preventiviRichieste, eq(preventiviRichieste.id, preventiviRisposte.richiestaId))
      .where(inArray(preventiviRisposte.richiestaId, input.richiesteIds));
    const fornitoriIds = [...new Set(risposte.map((r) => r.fornitoreId))];
    const righeFornitori = fornitoriIds.length ? await db.select().from(fornitori).where(inArray(fornitori.id, fornitoriIds)) : [];
    const emailDi = (id: string) => righeFornitori.find((f) => f.id === id)?.email ?? null;

    const scelta = risposte.find((r) => r.rispostaId === input.rispostaSceltaId);
    if (scelta) {
      const email = emailDi(scelta.fornitoreId);
      esito.sceltoAvvisato = email ? await inviaEmailModello(email, 'preventivo_scelto', { ...variabili, prezzo: formattaEuro(scelta.prezzo) }) : false;
    }
    if (await leggiNotificaNonScelti()) {
      const nonScelti = new Set(risposte.map((r) => r.fornitoreId));
      if (scelta) nonScelti.delete(scelta.fornitoreId);
      for (const id of nonScelti) {
        const email = emailDi(id);
        if (email && await inviaEmailModello(email, 'preventivo_non_scelto', variabili)) esito.nonSceltiAvvisati++;
      }
    }
  } catch (err) {
    console.error(`[preventivi bus] avvisi ai fornitori non riusciti (tragitto ${input.tragittoId}):`, err);
  }
  return esito;
}

/** Quando nasce una proposta: i preventivi chiesti per una proposta sparita
 *  (non serviva più) con le stesse fermate tornano a valere per questa. */
export async function ricollegaPreventiviBus(tx: Scrittore, tragittoId: string, propostaId: string, fermateIds: string[]) {
  const orfane = await tx.select({ id: preventiviRichieste.id, fermateIds: preventiviRichieste.fermateIds }).from(preventiviRichieste)
    .where(and(
      eq(preventiviRichieste.tragittoId, tragittoId), eq(preventiviRichieste.scopo, 'BUS'),
      isNull(preventiviRichieste.lineaId), isNull(preventiviRichieste.chiusaIl),
    ));
  const daRicollegare = orfane.filter((r) => stesseFermate(r.fermateIds ?? [], fermateIds)).map((r) => r.id);
  if (daRicollegare.length > 0) {
    await tx.update(preventiviRichieste).set({ lineaId: propostaId }).where(inArray(preventiviRichieste.id, daRicollegare));
  }
}
