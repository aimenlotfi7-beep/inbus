import { and, eq, sql, desc, inArray, isNull, gte } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { prenotazioni, tragitti, fermate, eventi, coupon, utenti, partecipantiPrenotazione, immaginiEvento, offerteEvento, ordini, lineaFermate, busFisici } from '../../db/schema.js';
import { ConflittoDati, NonTrovato, ErroreApplicativo, NonAutorizzato } from '../../shared/errors.js';
import { prezzoNormaleFermata, applicaScontoOfferta } from '../../shared/prezzi.js';
import { couponService } from '../coupon/coupon.service.js';
import { env } from '../../config/env.js';
import type { CreaPrenotazioneInput } from './prenotazioni.dto.js';

// Il tipo esatto di "tx" dentro una db.transaction(async (tx) => ...) —
// derivato direttamente da db invece di scritto a mano, così se
// cambiasse la configurazione di drizzle non andrebbe mai fuori sync.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Prima: 'IB' + Math.random().toString(36).slice(2, 8) — solo 6
// caratteri (circa 2 miliardi di combinazioni) generati con un
// generatore NON crittografico. Il PNR è l'unica "chiave" che protegge
// l'accesso a GET /:pnr (e alle route vicine, saldo/pagamento) — che
// non richiedono nessun login, si affidano solo al fatto che il PNR
// sia difficile da indovinare. Con 6 caratteri e nessun limite di
// richieste, uno script poteva provarli in sequenza e trovarne di
// validi in tempi ragionevoli, vedendo dati di clienti altrui (nome,
// email, telefono — l'intera riga, nessun filtro). Ora: generatore
// crittografico vero (crypto.randomBytes, non Math.random) e 12
// caratteri invece di 6 — le combinazioni possibili passano da ~2
// miliardi a decine di migliaia di miliardi, il tempo per un
// tentativo casuale di successo diventa impraticabile anche senza
// contare il limite di richieste aggiunto separatamente sulle route
// che lo usano.
function generaPnr() {
  return 'IB' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

/** Il coupon vale solo per l'acquisto pieno, non per il solo acconto —
 *  chi prenota ad acconto potrà comunque usarlo al momento di saldare
 *  il resto (vedi saldaResto più sotto), non qui. */
async function validaCoupon(codice: string | undefined, importo: number, eventoId: string, tipoPagamento: 'COMPLETO' | 'ACCONTO') {
  if (!codice) return { sconto: 0, coupon: null as Awaited<ReturnType<typeof couponService.valida>>['coupon'] | null };
  if (tipoPagamento !== 'COMPLETO') {
    throw new ErroreApplicativo('Il coupon si può usare solo con il pagamento completo — con l\'acconto potrai applicarlo quando salderai il resto.', 400, 'COUPON_NON_VALIDO');
  }
  return couponService.valida(codice, importo, eventoId);
}

/** Ricalcola il totale "vero" di una prenotazione (prezzo pieno, non
 *  l'acconto) — usato sia per completare il saldo sia per mostrare
 *  quanto manca. Deve tenere conto dell'eventuale offerta con cui è
 *  stata fatta la prenotazione, altrimenti a chi ha prenotato con uno
 *  sconto verrebbe chiesto il saldo pieno, senza sconto, per errore. */
async function calcolaTotaleReale(p: typeof prenotazioni.$inferSelect) {
  const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
  const [tragitto] = await db.select().from(tragitti).where(eq(tragitti.id, p.tragittoId)).limit(1);
  const [fermata] = await db.select().from(fermate).where(and(eq(fermate.citta, p.fermataCitta), eq(fermate.tragittoId, p.tragittoId))).limit(1);
  const prezzoNormale = prezzoNormaleFermata(fermata, evento, tragitto);

  let prezzoEffettivo = prezzoNormale;
  if (p.offertaId) {
    const [offerta] = await db.select().from(offerteEvento).where(eq(offerteEvento.id, p.offertaId)).limit(1);
    prezzoEffettivo = applicaScontoOfferta(prezzoNormale, offerta);
  }

  return prezzoEffettivo * p.passeggeri - Number(p.sconto);
}

/** La vera logica di creazione di UNA prenotazione (blocco posti,
 *  calcolo prezzo, coupon, credito, inserimento) — prende "tx" come
 *  parametro invece di aprire una propria transazione, così può
 *  essere chiamata sia da sola (crea, sotto) sia più volte di fila
 *  DENTRO la stessa transazione per un intero carrello (creaOrdine,
 *  più sotto): se un articolo del carrello fallisce, tutto quello
 *  creato prima nello stesso giro va indietro insieme a lui — mai
 *  un ordine "a metà". */
async function creaRigaInterna(
  tx: Tx,
  input: CreaPrenotazioneInput,
  utenteId: string,
  // Canale di vendita — passato QUI, alla creazione vera, non con un
  // update separato dopo (come succedeva prima per la White Label):
  // il biglietto (PDF con il layout giusto) si genera più sotto in
  // questa stessa funzione, appena creata la prenotazione — se
  // whiteLabelId arrivasse solo dopo, il biglietto partirebbe già col
  // layout sbagliato (quello dell'evento, mai quello della White
  // Label), esattamente il bug segnalato.
  canaleVendita?: { canale: 'WHITE_LABEL'; whiteLabelId: string }
) {
  const [utente] = await tx.select().from(utenti).where(eq(utenti.id, utenteId)).limit(1);
  if (!utente) throw new NonAutorizzato('Account non trovato — effettua di nuovo il login.');

  const [fermata] = await tx.select().from(fermate).where(eq(fermate.id, input.fermataId)).limit(1);
  if (!fermata || fermata.tragittoId !== input.tragittoId) throw new NonTrovato('Fermata');

  const [tragitto] = await tx.select().from(tragitti).where(eq(tragitti.id, input.tragittoId)).limit(1);
  if (!tragitto || tragitto.eventoId !== input.eventoId) throw new NonTrovato('Bus');

  const [evento] = await tx.select().from(eventi).where(eq(eventi.id, input.eventoId)).limit(1);
  if (!evento) throw new NonTrovato('Evento');

  // --- Blocco posti atomico sul bus (come prima) ---
  const righeAggiornate = await tx
    .update(tragitti)
    .set({ postiDisponibili: sql`${tragitti.postiDisponibili} - ${input.passeggeri}` })
    .where(and(eq(tragitti.id, input.tragittoId), sql`${tragitti.postiDisponibili} >= ${input.passeggeri}`))
    .returning();

  if (righeAggiornate.length === 0) {
    throw new ConflittoDati('Posti non più disponibili su questo bus: qualcun altro li ha appena prenotati.');
  }

  // --- Blocco posti atomico sulla fermata, SOLO se questa fermata ha
  // un limite specifico impostato (altrimenti condivide semplicemente
  // i posti del bus, appena verificati sopra). Stesso principio del
  // controllo sul bus: se la UPDATE non tocca righe, vuol dire che
  // qualcun altro ha appena preso l'ultimo posto di questa fermata.
  if (fermata.postiMax !== null) {
    const fermataAggiornata = await tx
      .update(fermate)
      .set({ postiPrenotati: sql`${fermate.postiPrenotati} + ${input.passeggeri}` })
      .where(and(
        eq(fermate.id, input.fermataId),
        sql`${fermate.postiPrenotati} + ${input.passeggeri} <= ${fermate.postiMax}`
      ))
      .returning();

    if (fermataAggiornata.length === 0) {
      // Il posto sul bus l'avevamo già preso: lo restituiamo, non ha
      // senso tenerlo bloccato per una prenotazione che non va a buon fine.
      await tx
        .update(tragitti)
        .set({ postiDisponibili: sql`${tragitti.postiDisponibili} + ${input.passeggeri}` })
        .where(eq(tragitti.id, input.tragittoId));
      throw new ConflittoDati('Posti non più disponibili su questa fermata: qualcun altro li ha appena prenotati.');
    }
  }

  const prezzoNormale = prezzoNormaleFermata(fermata, evento, tragitto);
  // Se la prenotazione arriva da un link con offerta dedicata, lo
  // sconto percentuale dell'offerta si applica al prezzo normale
  // della fermata scelta (non è un prezzo fisso: il prezzo varia
  // già per fermata). Verificata qui (dentro la transazione, subito
  // prima di confermare) per essere sicuri che sia ancora valida in
  // questo preciso istante, non solo quando l'ha vista sulla pagina.
  let prezzoEffettivo = prezzoNormale;
  if (input.offertaId) {
    const { offerteService } = await import('../offerte/offerte.service.js');
    const offerta = await offerteService.verificaEIncrementaUtilizzo(input.offertaId, input.eventoId);
    prezzoEffettivo = applicaScontoOfferta(prezzoNormale, offerta);
  }
  const importoBase = prezzoEffettivo * input.passeggeri;
  const { sconto, coupon: couponUsato } = await validaCoupon(input.couponCodice, importoBase, input.eventoId, input.tipoPagamento);

  const acconto = evento.accontoEur ? Number(evento.accontoEur) : env.ACCONTO_FISSO_EUR;
  const totale = importoBase - sconto;
  const saldoPagato = input.tipoPagamento === 'COMPLETO';
  const scadenzaSaldo = input.tipoPagamento === 'ACCONTO'
    ? new Date(evento.data.getTime() - env.GIORNI_SCADENZA_SALDO * 24 * 3600 * 1000)
    : null;

  // L'account è già quello autenticato — non c'è più bisogno di
  // creare/ricercare l'utente da un'email scritta nel corpo della
  // richiesta. Aggiorno solo il telefono, se ne è arrivato uno
  // diverso da quello già salvato (comodo, non obbligatorio).
  if (input.cliente?.telefono && input.cliente.telefono !== utente.telefono) {
    await tx.update(utenti).set({ telefono: input.cliente.telefono }).where(eq(utenti.id, utente.id));
    utente.telefono = input.cliente.telefono;
  }

  // Il credito si applica solo a pagamento completo (non
  // all'acconto, altrimenti si complicherebbe il calcolo del saldo
  // residuo) — mai più di quanto disponibile davvero, verificato
  // qui dentro la transazione (non ci si fida di un valore mandato
  // dal browser, che potrebbe essere non aggiornato).
  let creditoUsato = 0;
  if (input.usaCredito && input.tipoPagamento === 'COMPLETO') {
    const [{ creditoDisponibile }] = await tx.select({ creditoDisponibile: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.id, utente.id)).limit(1);
    creditoUsato = Math.min(Number(creditoDisponibile), totale);
  }

  if (couponUsato) {
    await tx.update(coupon).set({ usiAttuali: sql`${coupon.usiAttuali} + 1` }).where(eq(coupon.id, couponUsato.id));
  }

  const [prenotazione] = await tx
    .insert(prenotazioni)
    .values({
      pnr: generaPnr(),
      eventoId: input.eventoId,
      tragittoId: input.tragittoId,
      fermataCitta: fermata.citta,
      fermataIndirizzo: fermata.indirizzo,
      fermataOrario: fermata.orario,
      orarioRitorno: fermata.orarioRitorno,
      indirizzoRitorno: fermata.indirizzoRitorno,
      referenteNome: tragitto.referenteNome,
      referenteTelefono: tragitto.referenteTelefono,
      passeggeri: input.passeggeri,
      totale: (input.tipoPagamento === 'ACCONTO' ? acconto : totale - creditoUsato).toFixed(2),
      sconto: sconto.toFixed(2),
      creditoUsato: creditoUsato.toFixed(2),
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
      ...(canaleVendita && { canaleVendita: canaleVendita.canale, whiteLabelId: canaleVendita.whiteLabelId }),
    })
    .returning();

  if (creditoUsato > 0) {
    const { creditoService } = await import('../credito/credito.service.js');
    await creditoService.usaCredito(tx, utente.id, creditoUsato, prenotazione.id, prenotazione.pnr);
  }

  // Il richiedente conta come primo partecipante (ordine 0), poi uno
  // per ogni modulo passeggero aggiuntivo compilato al checkout.
  await tx.insert(partecipantiPrenotazione).values([
    { prenotazioneId: prenotazione.id, nome: utente.nome ?? '', cognome: utente.cognome ?? '', ordine: 0 },
    ...input.partecipanti.map((p, i) => ({ prenotazioneId: prenotazione.id, nome: p.nome, cognome: p.cognome, ordine: i + 1 })),
  ]);

  return { ...prenotazione, totaleComplessivo: totale, eventoArtista: evento.artista, utenteNome: utente.nome ?? '', utenteEmail: utente.email };
}

/** Manda l'email/biglietto giusto dopo che una prenotazione è stata
 *  creata — SEMPRE fuori dalla transazione (se l'invio fallisce o
 *  impiega tempo, la prenotazione resta comunque salvata, il cliente
 *  non deve mai perdere il posto per un problema di posta). Riusata
 *  sia per una prenotazione singola sia per ognuna di un ordine con
 *  più articoli. */
async function inviaConfermaPrenotazione(risultato: Awaited<ReturnType<typeof creaRigaInterna>>) {
  try {
    if (risultato.tipoPagamento === 'COMPLETO') {
      // Pagamento pieno subito: il biglietto vero (PDF+QR) parte
      // immediatamente, non serve una email di conferma separata.
      const { ticketService } = await import('../ticket/ticket.service.js');
      await ticketService.emetti(risultato.pnr);
    } else {
      // Solo acconto: nessun biglietto ancora (si emette solo a saldo
      // completato) — mando la conferma "normale", senza allegato.
      const { inviaEmail, urlSito } = await import('../../shared/email.service.js');
      const { templateEmailService } = await import('../template-email/template-email.service.js');
      const { oggetto, html } = await templateEmailService.renderizza('conferma_acconto', {
        nome: risultato.utenteNome,
        pnr: risultato.pnr,
        fermata: risultato.fermataCitta,
        orario: risultato.fermataOrario ?? 'da definire',
        passeggeri: String(risultato.passeggeri),
        totale: Number(risultato.totale).toFixed(2),
        evento: risultato.eventoArtista,
        link_saldo: urlSito(`/completa-saldo/${risultato.pnr}`),
      });
      await inviaEmail({ a: risultato.utenteEmail, oggetto, html });
    }
  } catch (err) {
    // Non bastava che l'email fallisse in silenzio senza lasciare
    // traccia: così almeno compare nei log di Railway, anche se al
    // cliente non arriva nulla.
    console.error('Invio email di conferma prenotazione non riuscito:', err);
  }
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
  async crea(input: CreaPrenotazioneInput, utenteId: string, canaleVendita?: { canale: 'WHITE_LABEL'; whiteLabelId: string }) {
    const risultato = await db.transaction((tx) => creaRigaInterna(tx, input, utenteId, canaleVendita));
    await inviaConfermaPrenotazione(risultato);
    return risultato;
  },

  /** Crea un intero ORDINE con più prodotti (carrello) in un'unica
   *  transazione atomica — se anche un solo articolo fallisce (posti
   *  esauriti, coupon non valido, ecc), va tutto indietro, nessuna
   *  prenotazione a metà creata. Ogni articolo resta comunque una vera
   *  prenotazione a sé, con il suo PNR, il suo biglietto, la sua email
   *  — semplicemente in più raggruppate sotto lo stesso ordine. */
  async creaOrdine(articoli: CreaPrenotazioneInput[], utenteId: string) {
    if (articoli.length === 0) {
      throw new ErroreApplicativo('Il carrello è vuoto.', 400, 'CARRELLO_VUOTO');
    }
    if (articoli.length > 20) {
      throw new ErroreApplicativo('Troppi articoli in un unico ordine (massimo 20).', 400, 'CARRELLO_TROPPO_GRANDE');
    }

    const { ordine, righe } = await db.transaction(async (tx) => {
      const righeCreate = [];
      for (const articolo of articoli) {
        righeCreate.push(await creaRigaInterna(tx, articolo, utenteId));
      }
      const totaleOrdine = righeCreate.reduce((somma, r) => somma + Number(r.totale), 0);
      const [nuovoOrdine] = await tx.insert(ordini).values({ utenteId, totale: totaleOrdine.toFixed(2) }).returning();
      await tx.update(prenotazioni).set({ ordineId: nuovoOrdine.id }).where(inArray(prenotazioni.id, righeCreate.map((r) => r.id)));
      return { ordine: nuovoOrdine, righe: righeCreate };
    });

    // Fuori dalla transazione, come per la prenotazione singola — un
    // biglietto/email per ciascun articolo dell'ordine.
    for (const riga of righe) {
      await inviaConfermaPrenotazione(riga);
    }

    return { ordine, prenotazioni: righe.map((r) => ({ ...r, ordineId: ordine.id })) };
  },

  /** Tutto quello che serve per la "travel card" del cliente in un
   *  colpo solo — prenotazione, evento e partecipanti (dati già nel
   *  database, solo non ancora uniti in una risposta sola). Verifica
   *  che l'email combaci, stesso criterio già usato per i rimborsi:
   *  non è un vero account-check ma non lascia vedere prenotazioni
   *  altrui a chi non conosce già l'email giusta. */
  async dettaglioPerCliente(pnr: string, email: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');

    const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!utente || utente.email.toLowerCase() !== email.toLowerCase()) throw new NonTrovato('Prenotazione');

    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    const partecipanti = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.prenotazioneId, p.id)).orderBy(partecipantiPrenotazione.ordine);

    return { ...p, evento, partecipanti: partecipanti.map((pt) => ({ nome: pt.nome, cognome: pt.cognome })) };
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
      // Solo le CONFERMATA contano come "ha prenotazioni" — un evento
      // con prenotazioni solo cancellate non ha più nulla di attivo da
      // gestire qui, non deve comparire (le cancellate restano comunque
      // visibili nella tab "Cancellate" DENTRO la scheda di un evento
      // che ha ALMENO una prenotazione ancora confermata).
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
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
        saldoPagatoIl: prenotazioni.saldoPagatoIl,
        scadenzaSaldo: prenotazioni.scadenzaSaldo,
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
        .update(tragitti)
        .set({ postiDisponibili: sql`${tragitti.postiDisponibili} + ${p.passeggeri}` })
        .where(eq(tragitti.id, p.tragittoId));

      // Se la fermata aveva un suo limite specifico, restituisco il
      // posto anche lì, altrimenti quella fermata resterebbe segnata
      // come "esaurita" per sempre anche dopo la cancellazione. La
      // prenotazione non salva l'id della fermata (solo città+bus, come
      // altrove nel codice), quindi la ritrovo così.
      await tx
        .update(fermate)
        .set({ postiPrenotati: sql`GREATEST(0, ${fermate.postiPrenotati} - ${p.passeggeri})` })
        .where(and(eq(fermate.citta, p.fermataCitta), eq(fermate.tragittoId, p.tragittoId), sql`${fermate.postiMax} IS NOT NULL`));

      const [aggiornata] = await tx
        .update(prenotazioni)
        .set({ stato: 'CANCELLATA', motivoCancellazione: 'Cancellata dal cliente' })
        .where(eq(prenotazioni.pnr, pnr))
        .returning();

      return aggiornata;
    });
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
  async saldaResto(pnr: string, couponCodice?: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
    if (p.saldoPagato) return p;

    let totaleReale = await calcolaTotaleReale(p);
    let couponUsato: Awaited<ReturnType<typeof couponService.valida>>['coupon'] | null = null;
    if (couponCodice) {
      const { sconto, coupon: c } = await couponService.valida(couponCodice, totaleReale, p.eventoId);
      totaleReale = Math.max(0, totaleReale - sconto);
      couponUsato = c;
    }

    const [aggiornata] = await db
      .update(prenotazioni)
      .set({
        saldoPagato: true, saldoPagatoIl: new Date(), totale: totaleReale.toFixed(2),
        ...(couponUsato && { couponCodice: couponUsato.codice }),
      })
      .where(eq(prenotazioni.pnr, pnr))
      .returning();

    if (couponUsato) {
      await db.update(coupon).set({ usiAttuali: sql`${coupon.usiAttuali} + 1` }).where(eq(coupon.id, couponUsato.id));
    }

    // Ora che ha saldato per intero, il biglietto vero (PDF+QR) può
    // essere emesso — fuori dalla transazione: se l'email fallisce, il
    // saldo resta comunque segnato come pagato, non blocchiamo per un
    // problema di posta.
    try {
      const { ticketService } = await import('../ticket/ticket.service.js');
      await ticketService.emetti(pnr);
    } catch (err) {
      console.error('Emissione biglietto dopo saldo non riuscita:', err);
    }

    return aggiornata;
  },

  /** Quanto manca da pagare su una prenotazione ad acconto (per mostrarlo
   *  nella pagina pubblica di completamento saldo, senza doverlo
   *  ricalcolare lato frontend). */
  async differenzaSaldo(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    const totaleReale = await calcolaTotaleReale(p);
    return {
      pnr: p.pnr,
      eventoId: p.eventoId,
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
  /** Sollecito manuale — l'amministratore lo manda quando vuole, a
   *  differenza del promemoria automatico (che parte solo nella
   *  finestra di 24 ore prima della scadenza). Stessa email, nessuna
   *  data/finestra da rispettare qui. */
  async inviaSollecitoManuale(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.tipoPagamento !== 'ACCONTO' || p.saldoPagato) throw new ConflittoDati('Questa prenotazione non ha un saldo da sollecitare.');

    const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!utente) throw new NonTrovato('Cliente');

    const { inviaEmail, urlSito } = await import('../../shared/email.service.js');
    const dati = await this.differenzaSaldo(p.pnr);
    const link = urlSito(`/completa-saldo/${p.pnr}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('promemoria_saldo', {
      nome: utente.nome ?? '',
      evento: dati.artista,
      differenza: dati.differenza.toFixed(2),
      pnr: p.pnr,
      link,
    });
    const { inviata } = await inviaEmail({ a: utente.email, oggetto, html });
    return { inviata };
  },

  /** Assegna ogni prenotazione confermata al bus/Linea giusto,
   *  raggruppando per età (il titolare dell'account, non i singoli
   *  partecipanti — una prenotazione non si spezza mai tra bus diversi,
   *  anche se copre persone di età diverse, es. un genitore con figli).
   *  Scatta da sola, una volta sola per fermata, appena la partenza
   *  entra nelle prossime 24 ore — prima di allora il biglietto vero
   *  non è ancora scaricabile (prenotazioni.busId resta vuoto).
   *
   *  Algoritmo: ordina tutte le prenotazioni di quella fermata per età
   *  (dalla più anziana alla più giovane), poi le versa nei bus nello
   *  stesso ordine, riempiendo il primo fino alla sua capienza prima di
   *  passare al secondo — chi ha età vicina finisce quasi sempre nello
   *  stesso bus, senza però poter garantire una combinazione perfetta
   *  se i posti non lo permettono (un caso accettato fin dall'inizio:
   *  un sessantenne può finire in un bus di ventenni se non c'è altro
   *  posto). Se una fermata non ha nessun bus che la copre ancora,
   *  resta semplicemente da fare — non è un errore, è solo presto. */
  async riordinaPerFasceEta() {
    const oraAdesso = new Date();
    const tra24Ore = new Date(oraAdesso.getTime() + 24 * 3600 * 1000);

    // Tutte le prenotazioni confermate ancora senza bus assegnato, di
    // eventi non ancora passati — filtro l'orario preciso di ciascuna
    // fermata (data evento + orario fermata) più sotto, in JS: troppo
    // specifico da esprimere comodamente in una singola query SQL.
    const candidate = await db.select({
      prenotazioneId: prenotazioni.id,
      tragittoId: prenotazioni.tragittoId,
      fermataCitta: prenotazioni.fermataCitta,
      fermataOrario: prenotazioni.fermataOrario,
      utenteId: prenotazioni.utenteId,
      passeggeri: prenotazioni.passeggeri,
      eventoData: eventi.data,
    }).from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(and(eq(prenotazioni.stato, 'CONFERMATA'), isNull(prenotazioni.busId), gte(eventi.data, oraAdesso)));

    // Raggruppo per (tragittoId, fermataCitta) — ogni gruppo si
    // riordina indipendentemente dagli altri.
    const gruppi = new Map<string, typeof candidate>();
    for (const c of candidate) {
      if (!c.fermataOrario) continue; // senza orario non posso calcolare quando parte davvero
      const [ore, minuti] = c.fermataOrario.split(':').map(Number);
      if (Number.isNaN(ore) || Number.isNaN(minuti)) continue;
      const partenzaVera = new Date(c.eventoData);
      partenzaVera.setHours(ore, minuti, 0, 0);
      if (partenzaVera > tra24Ore) continue; // non ancora nelle prossime 24 ore — troppo presto
      const chiave = `${c.tragittoId}::${c.fermataCitta}`;
      if (!gruppi.has(chiave)) gruppi.set(chiave, []);
      gruppi.get(chiave)!.push(c);
    }

    let riordinate = 0;
    for (const [chiave, righe] of gruppi) {
      const [tragittoId, fermataCitta] = chiave.split('::');

      // I bus che coprono davvero questa fermata specifica — tramite
      // il modello Linee (una Linea copre certe fermate, uno o più bus
      // dentro). Se nessuno la copre ancora, non c'è niente da fare
      // per questo gruppo, si riprova al prossimo giro.
      const fermataRiga = await db.select({ id: fermate.id }).from(fermate)
        .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.citta, fermataCitta))).limit(1);
      if (fermataRiga.length === 0) continue;
      const busCopertura = await db.select({ busId: busFisici.id, postiBus: busFisici.postiBus }).from(lineaFermate)
        .innerJoin(busFisici, eq(busFisici.lineaId, lineaFermate.lineaId))
        .where(eq(lineaFermate.fermataId, fermataRiga[0].id));
      if (busCopertura.length === 0) continue;

      // Età dal titolare dell'account — chi non ha una data di nascita
      // impostata (account creati prima che il campo fosse
      // obbligatorio) finisce in fondo all'ordinamento, non bloccante.
      const utentiIds = [...new Set(righe.map((r) => r.utenteId))];
      const utentiDati = await db.select({ id: utenti.id, dataNascita: utenti.dataNascita }).from(utenti).where(inArray(utenti.id, utentiIds));
      const mappaEta = new Map(utentiDati.map((u) => [u.id, u.dataNascita ? oraAdesso.getTime() - u.dataNascita.getTime() : -1]));

      const ordinate = [...righe].sort((a, b) => (mappaEta.get(b.utenteId) ?? -1) - (mappaEta.get(a.utenteId) ?? -1));

      let busCorrente = 0;
      let postiRimastiBusCorrente = busCopertura[0]?.postiBus ?? 0;
      for (const r of ordinate) {
        // Passa al bus successivo se quello corrente non ha più posto
        // per NESSUNO — non spezza una prenotazione tra due bus, ma
        // nemmeno lascia posti vuoti se la prossima prenotazione
        // ci starebbe comunque (qui semplificato: un posto per
        // prenotazione, il conteggio vero dei passeggeri l'ha già
        // gestito la vendita — qui serve solo la distribuzione).
        while (busCorrente < busCopertura.length - 1 && postiRimastiBusCorrente <= 0) {
          busCorrente++;
          postiRimastiBusCorrente = busCopertura[busCorrente]?.postiBus ?? 0;
        }
        await db.update(prenotazioni).set({ busId: busCopertura[busCorrente].busId }).where(eq(prenotazioni.id, r.prenotazioneId));
        postiRimastiBusCorrente -= r.passeggeri;
        riordinate++;
      }
    }
    return { riordinate };
  },

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
      const { templateEmailService } = await import('../template-email/template-email.service.js');
      const { oggetto, html } = await templateEmailService.renderizza('promemoria_saldo', {
        nome: utente.nome ?? '',
        evento: dati.artista,
        differenza: dati.differenza.toFixed(2),
        pnr: p.pnr,
        link,
      });
      await inviaEmail({ a: utente.email, oggetto, html });
      await db.update(prenotazioni).set({ promemoriaSaldoInviato: true }).where(eq(prenotazioni.id, p.id));
      inviate++;
    }
    return { inviate };
  },
};
