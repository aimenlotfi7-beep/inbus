import { and, asc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, fermate, fermateAnagrafica, fornitori, lineaFermate, linee, logAttivita, preventiviRichieste, tragitti } from '../../db/schema.js';
import { inizioOggiRoma } from '../../shared/formato.js';
import { geocodificaServer, type Coordinate } from '../../shared/geocodifica.js';
import { cambiPercorso } from './cambio-percorso.js';
import { inviaPreventiviBusSenzaClic, inviaQuotazioneSenzaClic } from './preventivi.routes.js';

/** Richieste ai fornitori che partono DA SOLE, senza clic (deciso dal
 *  proprietario, settembre 2026):
 *  - quotazione del tragitto: appena ha gli orari (evento non in bozza e in
 *    programma, tragitto attivo), se non ne è mai partita una; ai fornitori
 *    con "Invio automatico" nel raggio della prima fermata;
 *  - percorso cambiato dopo la quotazione: una nuova richiesta, ai fornitori
 *    con "Invio automatico" e a chi aveva dato la quotazione;
 *  - preventivi per il bus: appena nasce la proposta da confermare, se per
 *    quella proposta non ne sono partiti; ai fornitori con "Invio automatico"
 *    vicini alla prima fermata del bus e a chi ha dato la quotazione.
 *  Se nessun fornitore va bene non parte niente e il gestionale resta rosso:
 *  la richiesta si manda a mano. Partono subito dopo il salvataggio degli
 *  orari o di un evento e alla nascita di una proposta, e ogni ora per
 *  quello che manca (anche quanto era già in attesa quando è arrivata questa
 *  regola). Nessuna di queste funzioni lancia. */

/** Un solo invio alla volta per tragitto o proposta: il controllo dell'ora e
 *  un salvataggio nello stesso istante non mandano la richiesta due volte. */
const inCorso = new Set<string>();

async function inEsclusiva<T>(chiave: string, lavoro: () => Promise<T>): Promise<T | null> {
  if (inCorso.has(chiave)) return null;
  inCorso.add(chiave);
  try {
    return await lavoro();
  } finally {
    inCorso.delete(chiave);
  }
}

/** Il tragitto, se si possono chiedere quotazioni o preventivi: attivo, di un
 *  evento non in bozza, non nel cestino e non passato. */
async function tragittoInProgramma(tragittoId: string) {
  const [riga] = await db.select({ tragitto: tragitti }).from(tragitti)
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .where(and(
      eq(tragitti.id, tragittoId), eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl),
      eq(eventi.bozza, false), isNull(eventi.eliminatoIl), gte(eventi.data, inizioOggiRoma()),
    )).limit(1);
  return riga?.tragitto ?? null;
}

/** Dove sta una fermata: le coordinate salvate sulla fermata o sulla sua
 *  voce di anagrafica; se mancano, l'indirizzo e poi la sola città sulla mappa. */
async function posizioneFermata(fermataId: string): Promise<Coordinate | null> {
  const [f] = await db.select({
    lat: fermate.lat, lng: fermate.lng, citta: fermate.citta, indirizzo: fermate.indirizzo,
    latAnagrafica: fermateAnagrafica.lat, lngAnagrafica: fermateAnagrafica.lng,
  }).from(fermate)
    .leftJoin(fermateAnagrafica, eq(fermateAnagrafica.id, fermate.fermataAnagraficaId))
    .where(eq(fermate.id, fermataId)).limit(1);
  if (!f) return null;
  if (f.lat != null && f.lng != null) return { lat: f.lat, lng: f.lng };
  if (f.latAnagrafica != null && f.lngAnagrafica != null) return { lat: f.latAnagrafica, lng: f.lngAnagrafica };
  if (f.indirizzo) {
    const conIndirizzo = await geocodificaServer(`${f.indirizzo}, ${f.citta}`);
    if (conIndirizzo) return conIndirizzo;
  }
  return geocodificaServer(f.citta);
}

/** C'è almeno un fornitore approvato con "Invio automatico"? Senza, e senza
 *  chi ha dato la quotazione, non serve nemmeno cercare la posizione. */
async function ciSonoFornitoriAutomatici() {
  const [uno] = await db.select({ id: fornitori.id }).from(fornitori)
    .where(and(eq(fornitori.invioAutomatico, true), eq(fornitori.stato, 'APPROVATO'))).limit(1);
  return !!uno;
}

/** Quanti fornitori ha raggiunto un invio (richieste registrate). */
const richiesteCreate = (esito: { inviateAutomatiche: number; inviateManuali: number; nonInviate: number; senzaEmail: number }) =>
  esito.inviateAutomatiche + esito.inviateManuali + esito.nonInviate + esito.senzaEmail;

/** Resta scritto nel registro attività del gestionale, con le email non partite. */
async function registra(cosa: string, esito: { nonInviate: number; senzaEmail: number; fornitori: string[] }) {
  const problemi = [
    esito.nonInviate ? `${esito.nonInviate} email non partite` : '',
    esito.senzaEmail ? `${esito.senzaEmail} fornitori senza email` : '',
  ].filter(Boolean).join(', ');
  const dettaglio = `${cosa}: ${esito.fornitori.join(', ')}${problemi ? ` (${problemi}: reinviale dal gestionale)` : ''}`;
  console.log(`[invio automatico] ${dettaglio}`);
  try {
    await db.insert(logAttivita).values({ amministratoreId: null, azione: 'Richiesta automatica ai fornitori', dettaglio });
  } catch (err) {
    console.error('[invio automatico] registro attività non aggiornato:', err);
  }
}

export type EsitoInvioTragitto = 'quotazione' | 'cambio-percorso' | null;

export const invioAutomaticoService = {
  /** Quotazione (prima richiesta o percorso cambiato) di un tragitto, se serve. */
  async perTragitto(tragittoId: string): Promise<EsitoInvioTragitto> {
    try {
      return await inEsclusiva(`tragitto:${tragittoId}`, async () => {
        const tragitto = await tragittoInProgramma(tragittoId);
        if (!tragitto) return null;
        const righeFermate = await db.select({ id: fermate.id, orario: fermate.orario, attivo: fermate.attivo }).from(fermate)
          .where(eq(fermate.tragittoId, tragittoId)).orderBy(asc(fermate.ordine));
        // Senza orari la richiesta non mostrerebbe niente al fornitore.
        const prima = righeFermate.find((f) => f.attivo);
        if (!prima || !righeFermate.some((f) => f.orario)) return null;

        let perCambioPercorso = false;
        if (tragitto.preventivoCosto == null) {
          const [giaChiesta] = await db.select({ id: preventiviRichieste.id }).from(preventiviRichieste)
            .where(and(eq(preventiviRichieste.tragittoId, tragittoId), eq(preventiviRichieste.scopo, 'QUOTAZIONE'))).limit(1);
          if (giaChiesta) return null;
        } else {
          // Con una quotazione già scelta si chiede solo se il percorso è cambiato e nessuno l'ha ancora fatto.
          if ((await cambiPercorso([tragittoId])).get(tragittoId)?.stato !== 'da_richiedere') return null;
          perCambioPercorso = true;
        }
        if (!(await ciSonoFornitoriAutomatici()) && !(perCambioPercorso && tragitto.fornitoreId)) return null;

        // Prima richiesta: la partenza salvata, se c'è. Percorso cambiato: la prima fermata di adesso.
        const posizione = !perCambioPercorso && tragitto.partenzaLat != null && tragitto.partenzaLng != null
          ? { lat: tragitto.partenzaLat, lng: tragitto.partenzaLng }
          : await posizioneFermata(prima.id);
        if (!posizione) return null;
        await db.update(tragitti).set({ partenzaLat: posizione.lat, partenzaLng: posizione.lng }).where(eq(tragitti.id, tragittoId));

        const esito = await inviaQuotazioneSenzaClic(tragittoId, posizione, perCambioPercorso);
        if (richiesteCreate(esito) === 0) return null;
        await registra(`${perCambioPercorso ? 'Nuova quotazione per percorso cambiato' : 'Quotazione'} — tragitto ${tragitto.nome}`, esito);
        return perCambioPercorso ? 'cambio-percorso' : 'quotazione';
      });
    } catch (err) {
      console.error(`[invio automatico] quotazione del tragitto ${tragittoId} non inviata (riprova il giro dell'ora):`, err);
      return null;
    }
  },

  /** Quotazioni di più tragitti (dopo il salvataggio di un evento). */
  async perTragitti(tragittiIds: string[]): Promise<void> {
    for (const id of tragittiIds) await invioAutomaticoService.perTragitto(id);
  },

  /** Preventivi per il bus di una proposta da confermare, se non sono ancora partiti. */
  async perProposta(lineaId: string): Promise<boolean> {
    try {
      return (await inEsclusiva(`proposta:${lineaId}`, async () => {
        const [linea] = await db.select().from(linee).where(and(eq(linee.id, lineaId), eq(linee.daConfermare, true))).limit(1);
        const tragitto = linea ? await tragittoInProgramma(linea.tragittoId) : null;
        if (!linea || !tragitto) return false;
        if (!tragitto.fornitoreId && !(await ciSonoFornitoriAutomatici())) return false;
        const [giaChiesti] = await db.select({ id: preventiviRichieste.id }).from(preventiviRichieste)
          .where(and(eq(preventiviRichieste.lineaId, lineaId), eq(preventiviRichieste.scopo, 'BUS'))).limit(1);
        if (giaChiesti) return false;
        const [prima] = await db.select({ fermataId: lineaFermate.fermataId }).from(lineaFermate)
          .where(eq(lineaFermate.lineaId, lineaId)).orderBy(asc(lineaFermate.ordine)).limit(1);
        if (!prima) return false;
        const posizione = await posizioneFermata(prima.fermataId);
        if (!posizione) return false;

        const esito = await inviaPreventiviBusSenzaClic(lineaId, posizione);
        if (!esito || richiesteCreate(esito) === 0) return false;
        await registra(`Preventivi per il bus "${linea.nome}"`, esito);
        return true;
      })) ?? false;
    } catch (err) {
      console.error(`[invio automatico] preventivi per la proposta ${lineaId} non inviati (riprova il giro dell'ora):`, err);
      return false;
    }
  },

  /** Il giro di ogni ora (e all'avvio): tutto quello che è pronto e non è
   *  ancora partito, uno alla volta. */
  async tutti(): Promise<{ quotazioni: number; bus: number }> {
    const esito = { quotazioni: 0, bus: 0 };
    const tragittiPronti = await db.selectDistinct({ id: tragitti.id }).from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .innerJoin(fermate, eq(fermate.tragittoId, tragitti.id))
      .where(and(
        eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), isNotNull(fermate.orario),
        eq(eventi.bozza, false), isNull(eventi.eliminatoIl), gte(eventi.data, inizioOggiRoma()),
      ));
    for (const { id } of tragittiPronti) {
      if (await invioAutomaticoService.perTragitto(id)) esito.quotazioni++;
    }
    // Tragitto ed evento si controllano proposta per proposta (perProposta).
    const proposte = await db.select({ id: linee.id }).from(linee).where(eq(linee.daConfermare, true));
    for (const { id } of proposte) {
      if (await invioAutomaticoService.perProposta(id)) esito.bus++;
    }
    return esito;
  },
};
