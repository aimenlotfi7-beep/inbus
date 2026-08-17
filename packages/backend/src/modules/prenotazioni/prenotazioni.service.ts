import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, lineeBus, fermate, eventi, coupon, utenti, partecipantiPrenotazione, immaginiEvento } from '../../db/schema.js';
import { ConflittoDati, NonTrovato, ErroreApplicativo } from '../../shared/errors.js';
import { utentiService } from '../utenti/utenti.service.js';
import { env } from '../../config/env.js';
import type { CreaPrenotazioneInput } from './prenotazioni.dto.js';

function generaPnr() {
  return 'IB' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function validaCoupon(codice: string | undefined, importo: number) {
  if (!codice) return { sconto: 0, coupon: null as typeof coupon.$inferSelect | null };

  const [c] = await db.select().from(coupon).where(eq(coupon.codice, codice.toUpperCase())).limit(1);
  if (!c || !c.attivo) throw new ErroreApplicativo('Coupon non valido', 400, 'COUPON_NON_VALIDO');
  const oggi = new Date();
  if (c.validoDal && oggi < c.validoDal) throw new ErroreApplicativo('Coupon non ancora attivo', 400, 'COUPON_NON_VALIDO');
  if (c.validoAl && oggi > c.validoAl) throw new ErroreApplicativo('Coupon scaduto', 400, 'COUPON_NON_VALIDO');
  if (c.usiMax !== null && c.usiAttuali >= c.usiMax) throw new ErroreApplicativo('Coupon esaurito', 400, 'COUPON_NON_VALIDO');

  const sconto = c.tipo === 'PERCENTUALE' ? importo * (Number(c.valore) / 100) : Math.min(Number(c.valore), importo);
  return { sconto, coupon: c };
}

export const prenotazioniService = {
  /**
   * Crea una prenotazione bloccando i posti in modo atomico: l'UPDATE con
   * la condizione `posti_disponibili >= passeggeri` nella clausola WHERE
   * fa sì che, se due persone provano a prenotare l'ultimo posto nello
   * stesso istante, solo una delle due query trovi una riga da aggiornare
   * — l'altra riceve 0 righe modificate e la prenotazione viene rifiutata
   * con un errore chiaro, invece di vendere due volte lo stesso posto
   * (il rischio concreto che c'era nel prototipo basato su localStorage).
   */
  async crea(input: CreaPrenotazioneInput) {
    return db.transaction(async (tx) => {
      const [fermata] = await tx.select().from(fermate).where(eq(fermate.id, input.fermataId)).limit(1);
      if (!fermata || fermata.lineaId !== input.lineaId) throw new NonTrovato('Fermata');

      const [linea] = await tx.select().from(lineeBus).where(eq(lineeBus.id, input.lineaId)).limit(1);
      if (!linea || linea.eventoId !== input.eventoId) throw new NonTrovato('Bus');

      const [evento] = await tx.select().from(eventi).where(eq(eventi.id, input.eventoId)).limit(1);
      if (!evento) throw new NonTrovato('Evento');

      // --- Blocco posti atomico ---
      const righeAggiornate = await tx
        .update(lineeBus)
        .set({ postiDisponibili: sql`${lineeBus.postiDisponibili} - ${input.passeggeri}` })
        .where(and(eq(lineeBus.id, input.lineaId), sql`${lineeBus.postiDisponibili} >= ${input.passeggeri}`))
        .returning();

      if (righeAggiornate.length === 0) {
        throw new ConflittoDati('Posti non più disponibili su questo bus: qualcun altro li ha appena prenotati.');
      }

      const prezzoNormale = fermata.prezzo ? Number(fermata.prezzo) : (evento.prezzo ? Number(evento.prezzo) : 0) + Number(linea.prezzoExtra);
      // Se la prenotazione arriva da un link con offerta dedicata, il
      // prezzo dell'offerta sostituisce quello normale per fermata — è
      // fisso indipendentemente da quale fermata scelga il cliente.
      // Verificata qui (dentro la transazione, subito prima di
      // confermare) per essere sicuri che sia ancora valida in questo
      // preciso istante, non solo quando l'ha vista sulla pagina.
      let prezzoEffettivo = prezzoNormale;
      if (input.offertaId) {
        const { offerteService } = await import('../offerte/offerte.service.js');
        const offerta = await offerteService.verificaEIncrementaUtilizzo(input.offertaId, input.eventoId);
        prezzoEffettivo = prezzoNormale * (1 - Number(offerta.scontoPercentuale) / 100);
      }
      const importoBase = prezzoEffettivo * input.passeggeri;
      const { sconto, coupon: couponUsato } = await validaCoupon(input.couponCodice, importoBase);

      const acconto = evento.accontoEur ? Number(evento.accontoEur) : env.ACCONTO_FISSO_EUR;
      const totale = importoBase - sconto;
      const saldoPagato = input.tipoPagamento === 'COMPLETO';
      const scadenzaSaldo = input.tipoPagamento === 'ACCONTO'
        ? new Date(evento.data.getTime() - env.GIORNI_SCADENZA_SALDO * 24 * 3600 * 1000)
        : null;

      const utente = await utentiService.upsertByEmail({
        email: input.cliente.email,
        nome: input.cliente.nome,
        cognome: input.cliente.cognome,
        telefono: input.cliente.telefono,
      });

      if (couponUsato) {
        await tx.update(coupon).set({ usiAttuali: sql`${coupon.usiAttuali} + 1` }).where(eq(coupon.id, couponUsato.id));
      }

      const [prenotazione] = await tx
        .insert(prenotazioni)
        .values({
          pnr: generaPnr(),
          eventoId: input.eventoId,
          lineaId: input.lineaId,
          fermataCitta: fermata.citta,
          fermataIndirizzo: fermata.indirizzo,
          fermataOrario: fermata.orario,
          orarioRitorno: fermata.orarioRitorno,
          indirizzoRitorno: fermata.indirizzoRitorno,
          referenteNome: linea.referenteNome,
          referenteTelefono: linea.referenteTelefono,
          passeggeri: input.passeggeri,
          totale: (input.tipoPagamento === 'ACCONTO' ? acconto : totale).toFixed(2),
          sconto: sconto.toFixed(2),
          couponCodice: couponUsato?.codice,
          offertaId: input.offertaId,
          campagnaId: input.campagnaId,
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          utmContent: input.utmContent,
          tipoPagamento: input.tipoPagamento,
          saldoPagato,
          scadenzaSaldo,
          metodoPagamento: input.metodoPagamento,
          utenteId: utente.id,
          promoterCodice: input.promoterCodice,
        })
        .returning();

      // Il richiedente conta come primo partecipante (ordine 0), poi uno
      // per ogni modulo passeggero aggiuntivo compilato al checkout.
      await tx.insert(partecipantiPrenotazione).values([
        { prenotazioneId: prenotazione.id, nome: input.cliente.nome, cognome: input.cliente.cognome, ordine: 0 },
        ...input.partecipanti.map((p, i) => ({ prenotazioneId: prenotazione.id, nome: p.nome, cognome: p.cognome, ordine: i + 1 })),
      ]);

      return { ...prenotazione, totaleComplessivo: totale };
    });
  },

  async getByPnr(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    return p;
  },

  async listByEmail(email: string) {
    const utente = await db.query.utenti.findFirst({ where: (u, { eq }) => eq(u.email, email.toLowerCase()) });
    if (!utente) return [];
    return db.select().from(prenotazioni).where(eq(prenotazioni.utenteId, utente.id));
  },

  /** Eventi che hanno almeno una prenotazione (di qualsiasi stato) —
   *  per mostrare direttamente le tab in "Prenotazioni" senza dover
   *  cercare, che serve solo se gli eventi con prenotazioni sono tanti.
   *  Include la prima immagine, per mostrarle come le card del sito. */
  async eventiConPrenotazioni() {
    const base = await db
      .selectDistinct({
        id: eventi.id,
        artista: eventi.artista,
        genere: eventi.genere,
        luogo: eventi.luogo,
        citta: eventi.citta,
        data: eventi.data,
      })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .orderBy(desc(eventi.data));

    if (base.length === 0) return [];
    const immagini = await db
      .select({ eventoId: immaginiEvento.eventoId, url: immaginiEvento.url, ordine: immaginiEvento.ordine })
      .from(immaginiEvento)
      .where(inArray(immaginiEvento.eventoId, base.map((e) => e.id)))
      .orderBy(immaginiEvento.ordine);

    return base.map((e) => ({
      ...e,
      immagine: immagini.find((i) => i.eventoId === e.id)?.url ?? null,
    }));
  },

  /** Elenco per il gestionale (sezione Prenotazioni), con dati
   *  cliente/evento già uniti per evitare N query separate dal frontend.
   *  Filtrabile per evento, stato e parola chiave (PNR, cliente,
   *  partecipanti). I partecipanti di ogni prenotazione sono aggiunti con
   *  una seconda query e uniti in JS, più semplice di un GROUP BY con
   *  json_agg per questo volume di dati. */
  async listAll(filtri: { eventoId?: string; stato?: 'CONFERMATA' | 'CANCELLATA'; ricerca?: string } = {}) {
    const condizioni = [
      filtri.eventoId ? eq(prenotazioni.eventoId, filtri.eventoId) : undefined,
      filtri.stato ? eq(prenotazioni.stato, filtri.stato) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const righe = await db
      .select({
        id: prenotazioni.id,
        pnr: prenotazioni.pnr,
        passeggeri: prenotazioni.passeggeri,
        totale: prenotazioni.totale,
        tipoPagamento: prenotazioni.tipoPagamento,
        metodoPagamento: prenotazioni.metodoPagamento,
        saldoPagato: prenotazioni.saldoPagato,
        stato: prenotazioni.stato,
        creataIl: prenotazioni.creataIl,
        eventoId: prenotazioni.eventoId,
        artista: eventi.artista,
        clienteEmail: utenti.email,
        clienteNome: utenti.nome,
        clienteCognome: utenti.cognome,
        clienteTelefono: utenti.telefono,
      })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .where(condizioni.length > 0 ? and(...condizioni) : undefined)
      .orderBy(desc(prenotazioni.creataIl));

    if (righe.length === 0) return [];

    const idPrenotazioni = righe.map((r) => r.id);
    const partecipanti = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(inArray(partecipantiPrenotazione.prenotazioneId, idPrenotazioni))
      .orderBy(partecipantiPrenotazione.ordine);

    const risultato = righe.map((r) => ({
      ...r,
      partecipanti: partecipanti.filter((p) => p.prenotazioneId === r.id).map((p) => ({ nome: p.nome, cognome: p.cognome })),
    }));

    if (!filtri.ricerca?.trim()) return risultato;

    // Ricerca testuale sui campi già caricati (volumi ridotti, non serve
    // farla via SQL): PNR, nome/cognome/email cliente, nome/cognome di
    // ogni partecipante.
    const q = filtri.ricerca.trim().toLowerCase();
    return risultato.filter((r) => (
      r.pnr.toLowerCase().includes(q) ||
      (r.clienteNome ?? '').toLowerCase().includes(q) ||
      (r.clienteCognome ?? '').toLowerCase().includes(q) ||
      r.clienteEmail.toLowerCase().includes(q) ||
      r.partecipanti.some((p) => p.nome.toLowerCase().includes(q) || p.cognome.toLowerCase().includes(q))
    ));
  },

  /** Cancella e restituisce i posti al bus, in un'unica transazione. */
  async cancella(pnr: string) {
    return db.transaction(async (tx) => {
      const [p] = await tx.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
      if (!p) throw new NonTrovato('Prenotazione');
      if (p.stato === 'CANCELLATA') return p;

      await tx
        .update(lineeBus)
        .set({ postiDisponibili: sql`${lineeBus.postiDisponibili} + ${p.passeggeri}` })
        .where(eq(lineeBus.id, p.lineaId));

      const [aggiornata] = await tx
        .update(prenotazioni)
        .set({ stato: 'CANCELLATA', motivoCancellazione: 'Cancellata dal cliente' })
        .where(eq(prenotazioni.pnr, pnr))
        .returning();

      return aggiornata;
    });
  },

  async richiediRimborso(pnr: string) {
    const [aggiornata] = await db
      .update(prenotazioni)
      .set({ rimborsoStato: 'richiesto' })
      .where(eq(prenotazioni.pnr, pnr))
      .returning();
    if (!aggiornata) throw new NonTrovato('Prenotazione');
    return aggiornata;
  },

  /** Elimina DEFINITIVAMENTE una prenotazione dal database — solo se già
   *  cancellata (mai una attiva/confermata, per non perdere dati veri).
   *  Usato dal gestionale per ripulire prenotazioni di test. */
  async eliminaDefinitivamente(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CANCELLATA') {
      throw new ConflittoDati('Puoi eliminare definitivamente solo prenotazioni già cancellate. Cancellala prima.');
    }
    await db.delete(prenotazioni).where(eq(prenotazioni.pnr, pnr));
  },

  /** Segna il saldo come pagato (simulato: non c'è un vero gateway di
   *  pagamento collegato, coerente col resto del checkout). Usato dalla
   *  pagina pubblica raggiunta tramite il link del promemoria saldo. */
  async saldaResto(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
    if (p.saldoPagato) return p;

    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    const [linea] = await db.select().from(lineeBus).where(eq(lineeBus.id, p.lineaId)).limit(1);
    const [fermata] = await db.select().from(fermate).where(and(eq(fermate.citta, p.fermataCitta), eq(fermate.lineaId, p.lineaId))).limit(1);
    const prezzoEffettivo = fermata?.prezzo ? Number(fermata.prezzo) : (evento?.prezzo ? Number(evento.prezzo) : 0) + Number(linea?.prezzoExtra ?? 0);
    const totaleReale = prezzoEffettivo * p.passeggeri - Number(p.sconto);

    const [aggiornata] = await db
      .update(prenotazioni)
      .set({ saldoPagato: true, totale: totaleReale.toFixed(2) })
      .where(eq(prenotazioni.pnr, pnr))
      .returning();
    return aggiornata;
  },

  /** Quanto manca da pagare su una prenotazione ad acconto (per mostrarlo
   *  nella pagina pubblica di completamento saldo, senza doverlo
   *  ricalcolare lato frontend). */
  async differenzaSaldo(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    const [linea] = await db.select().from(lineeBus).where(eq(lineeBus.id, p.lineaId)).limit(1);
    const [fermata] = await db.select().from(fermate).where(and(eq(fermate.citta, p.fermataCitta), eq(fermate.lineaId, p.lineaId))).limit(1);
    const prezzoEffettivo = fermata?.prezzo ? Number(fermata.prezzo) : (evento?.prezzo ? Number(evento.prezzo) : 0) + Number(linea?.prezzoExtra ?? 0);
    const totaleReale = prezzoEffettivo * p.passeggeri - Number(p.sconto);
    return {
      pnr: p.pnr,
      artista: evento?.artista ?? '',
      dataEvento: evento?.data ?? null,
      saldoPagato: p.saldoPagato,
      accontoVersato: Number(p.totale),
      totaleReale,
      differenza: Math.max(0, totaleReale - Number(p.totale)),
    };
  },

  /** Cerca le prenotazioni ad acconto il cui saldo scade tra oggi e
   *  domani (finestra di un giorno, per non perdere invii se lo scheduler
   *  gira una volta al giorno) e non hanno ancora ricevuto il promemoria,
   *  e manda l'email con il link per completare il pagamento. Va
   *  richiamata periodicamente (vedi src/shared/scheduler.ts). */
  async inviaPromemoriaSaldo() {
    const oraAdesso = new Date();
    const domani = new Date(oraAdesso.getTime() + 24 * 3600 * 1000);

    const daAvvisare = await db
      .select()
      .from(prenotazioni)
      .where(and(
        eq(prenotazioni.stato, 'CONFERMATA'),
        eq(prenotazioni.tipoPagamento, 'ACCONTO'),
        eq(prenotazioni.saldoPagato, false),
        eq(prenotazioni.promemoriaSaldoInviato, false),
      ));

    const { inviaEmail, urlSito } = await import('../../shared/email.service.js');
    let inviate = 0;
    for (const p of daAvvisare) {
      if (!p.scadenzaSaldo || p.scadenzaSaldo > domani || p.scadenzaSaldo < oraAdesso) continue;
      const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
      if (!utente) continue;
      const dati = await this.differenzaSaldo(p.pnr);
      const link = urlSito(`/completa-saldo/${p.pnr}`);
      await inviaEmail({
        a: utente.email,
        oggetto: `Completa il saldo per ${dati.artista}`,
        html: `<p>Ciao ${utente.nome ?? ''},</p><p>La partenza per <b>${dati.artista}</b> si avvicina: manca il saldo di <b>€${dati.differenza.toFixed(2)}</b> sulla tua prenotazione <b>${p.pnr}</b>.</p><p><a href="${link}">Completa il pagamento</a></p>`,
      });
      await db.update(prenotazioni).set({ promemoriaSaldoInviato: true }).where(eq(prenotazioni.id, p.id));
      inviate++;
    }
    return { inviate };
  },
};
