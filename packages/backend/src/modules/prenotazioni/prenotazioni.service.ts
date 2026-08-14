import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, lineeBus, fermate, eventi, coupon, utenti } from '../../db/schema.js';
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

      const prezzoEffettivo = fermata.prezzo ? Number(fermata.prezzo) : Number(evento.prezzo) + Number(linea.prezzoExtra);
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
          tipoPagamento: input.tipoPagamento,
          saldoPagato,
          scadenzaSaldo,
          metodoPagamento: input.metodoPagamento,
          utenteId: utente.id,
          promoterCodice: input.promoterCodice,
        })
        .returning();

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

  /** Elenco completo per il gestionale (Transazioni/Pagamenti), con dati
   *  cliente/evento già uniti per evitare N query separate dal frontend. */
  async listAll() {
    return db
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
        artista: eventi.artista,
        clienteEmail: utenti.email,
        clienteNome: utenti.nome,
      })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .orderBy(desc(prenotazioni.creataIl));
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
};
