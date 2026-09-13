import { and, eq, ne, sql, desc, inArray, lte, gte } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { prenotazioni, tragitti, fermate, eventi, coupon, utenti, partecipantiPrenotazione, immaginiEvento, offerteEvento, ordini, promoter, promoterEventi, promoterLink, whiteLabel } from '../../db/schema.js';
import { ConflittoDati, NonTrovato, ErroreApplicativo, NonAutorizzato } from '../../shared/errors.js';
import { prezzoNormaleFermata, applicaScontoOfferta } from '../../shared/prezzi.js';
import { bundleService } from '../bundle/bundle.service.js';
import { leggiMetaPixelId, leggiMetaCapiToken } from '../impostazioni/impostazioni.routes.js';
import { inviaEventoMetaCapi } from '../../shared/metaConversions.js';

/** Manda l'evento solo se Pixel ID e token sono entrambi configurati —
 *  altrimenti (caso normale finché non si imposta il Pixel) non fa
 *  nulla, silenziosamente. */
export async function inviaEventoMetaSeConfigurato(
  dati: {
    nomeEvento: 'Purchase' | 'InitiateCheckout' | 'Refund'; eventId: string; valore?: number;
    email?: string; telefono?: string; ipCliente?: string; userAgentCliente?: string; fbp?: string; fbc?: string;
  },
  /** Se la vendita viene da un widget White Label, manda l'evento
   *  ANCHE al pixel DI QUELL'ORGANIZZATORE (se lo ha impostato) — oltre
   *  a quello di INBUS, sempre mandato qui sotto. Due ad account
   *  diversi, la stessa vendita. */
  whiteLabelId?: string,
) {
  const [pixelId, token] = await Promise.all([leggiMetaPixelId(), leggiMetaCapiToken()]);
  const chiamate: Promise<void>[] = [];
  if (pixelId && token) chiamate.push(inviaEventoMetaCapi(pixelId, token, { ...dati, urlOrigine: 'https://onway.it', valuta: 'EUR' }));
  if (whiteLabelId) {
    const [wl] = await db.select({ metaPixelId: whiteLabel.metaPixelId, metaCapiToken: whiteLabel.metaCapiToken }).from(whiteLabel).where(eq(whiteLabel.id, whiteLabelId)).limit(1);
    if (wl?.metaPixelId && wl.metaCapiToken) chiamate.push(inviaEventoMetaCapi(wl.metaPixelId, wl.metaCapiToken, { ...dati, urlOrigine: 'https://onway.it', valuta: 'EUR' }));
  }
  await Promise.all(chiamate);
}

import { verificaComposizione, ripartisciSconto } from '../bundle/bundle-regole.js';
import { couponService, scontoCoupon } from '../coupon/coupon.service.js';
import { formattaData, formattaEuro, inizioOggiRoma } from '../../shared/formato.js';
import { segnalaEmailNonPartita } from '../../shared/registroEmail.js';
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

/** Il coupon di un ordine (una prenotazione singola è un ordine da una
 *  riga). Deciso dal proprietario: vale UNA volta per ordine — un solo uso
 *  contato, lo sconto fisso si divide tra le righe finché non è esaurito,
 *  quello in percentuale vale su ogni riga. Se il coupon è di un evento
 *  vale solo sulle righe di quell'evento. */
interface CouponOrdine {
  coupon: Awaited<ReturnType<typeof couponService.verificaEIncrementaUtilizzo>>;
  fissoResiduo: number;
  righeValide: number;
}

/** Controlla il coupon e ne conta l'uso, una volta sola, dentro la
 *  transazione dell'ordine. Il coupon vale solo pagando tutto: chi prenota
 *  ad acconto lo usa al saldo (saldaResto). */
async function prenotaCouponOrdine(tx: Tx, articoli: Pick<CreaPrenotazioneInput, 'couponCodice' | 'tipoPagamento'>[], emailCliente: string): Promise<CouponOrdine | null> {
  const codici = [...new Set(articoli.map((a) => a.couponCodice?.trim().toUpperCase()).filter((c): c is string => !!c))];
  if (codici.length === 0) return null;
  if (codici.length > 1) throw new ErroreApplicativo('Si può usare un solo codice sconto per ordine.', 400, 'COUPON_NON_VALIDO');
  if (articoli.some((a) => a.tipoPagamento !== 'COMPLETO')) {
    throw new ErroreApplicativo('Il coupon si può usare solo con il pagamento completo — con l\'acconto potrai applicarlo quando salderai il resto.', 400, 'COUPON_NON_VALIDO');
  }
  const coupon = await couponService.verificaEIncrementaUtilizzo(tx, codici[0], emailCliente);
  return { coupon, fissoResiduo: coupon.tipo === 'FISSO' ? Number(coupon.valore) : 0, righeValide: 0 };
}

/** Lo sconto del coupon dell'ordine su una riga, e il coupon da segnare
 *  sulla riga (null se non vale per il suo evento). */
function couponSuRiga(ordine: CouponOrdine | null, importo: number, eventoId: string) {
  if (!ordine || (ordine.coupon.eventoId && ordine.coupon.eventoId !== eventoId)) return { sconto: 0, coupon: null };
  ordine.righeValide++;
  if (ordine.coupon.tipo === 'PERCENTUALE') return { sconto: scontoCoupon(ordine.coupon, importo), coupon: ordine.coupon };
  const sconto = Math.min(ordine.fissoResiduo, importo);
  ordine.fissoResiduo -= sconto;
  return { sconto, coupon: ordine.coupon };
}

/** L'email dell'account che prenota: un voucher personale si confronta
 *  con questa, mai con quella scritta nel modulo. */
async function emailUtente(tx: Tx, utenteId: string) {
  const [u] = await tx.select({ email: utenti.email }).from(utenti).where(eq(utenti.id, utenteId)).limit(1);
  if (!u) throw new NonAutorizzato('Account non trovato — effettua di nuovo il login.');
  return u.email;
}

function verificaCouponUsato(ordine: CouponOrdine | null) {
  if (ordine && ordine.righeValide === 0) throw new ErroreApplicativo('Questo coupon non è valido per questo evento', 400, 'COUPON_NON_VALIDO');
}

/** Ricalcola il totale "vero" di una prenotazione (prezzo pieno, non
 *  l'acconto) — usato sia per completare il saldo sia per mostrare
 *  quanto manca. Deve tenere conto dell'eventuale offerta con cui è
 *  stata fatta la prenotazione, altrimenti a chi ha prenotato con uno
 *  sconto verrebbe chiesto il saldo pieno, senza sconto, per errore. */
async function calcolaTotaleReale(p: typeof prenotazioni.$inferSelect) {
  // Prenotazioni da settembre 2026: il prezzo intero fissato all'acquisto
  // (deciso dal proprietario), non quello di oggi della fermata.
  if (p.totalePrevisto !== null) return Number(p.totalePrevisto);
  // Prenotazioni più vecchie: prezzo attuale della fermata, come prima.
  const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
  const [tragitto] = await db.select().from(tragitti).where(eq(tragitti.id, p.tragittoId)).limit(1);
  const [fermata] = await db.select().from(fermate).where(and(eq(fermate.citta, p.fermataCitta), eq(fermate.tragittoId, p.tragittoId))).limit(1);
  const prezzoNormale = prezzoNormaleFermata(fermata, evento, tragitto);

  let prezzoEffettivo = prezzoNormale;
  if (p.offertaId) {
    const [offerta] = await db.select().from(offerteEvento).where(eq(offerteEvento.id, p.offertaId)).limit(1);
    prezzoEffettivo = applicaScontoOfferta(prezzoNormale, offerta);
  }

  return prezzoEffettivo * p.passeggeri - Number(p.sconto) - Number(p.scontoBundle ?? 0);
}

/** Un codice promoter vale per questo evento? Può essere il codice opaco di un
 *  LINK (promoter, evento), anche specifico dell'evento, oppure per
 *  compatibilità il codice diretto del promoter. Non vale se è il link di un
 *  altro evento o se il promoter è escluso dall'evento. `codice` è quello da
 *  salvare: sempre il codice vero del promoter, mai quello del link. Un codice
 *  che non corrisponde a nessun promoter resta com'è (un vecchio codice o un
 *  errore di battitura non blocca l'acquisto). */
async function promoterPerEvento(lettore: Pick<typeof db, 'select'>, codice: string, eventoId: string): Promise<{ valido: true; codice: string } | { valido: false }> {
  const [link] = await lettore.select().from(promoterLink).where(eq(promoterLink.codice, codice)).limit(1);
  if (link && link.eventoId !== eventoId) return { valido: false };
  const [p] = link
    ? await lettore.select().from(promoter).where(eq(promoter.id, link.promoterId)).limit(1)
    : await lettore.select().from(promoter).where(eq(promoter.codice, codice)).limit(1);
  if (!p) return { valido: true, codice };
  const [escluso] = await lettore.select().from(promoterEventi)
    .where(and(eq(promoterEventi.promoterId, p.id), eq(promoterEventi.eventoId, eventoId))).limit(1);
  return escluso ? { valido: false } : { valido: true, codice: p.codice };
}

/** L'email "completa il saldo" (promemoria automatico e sollecito dal
 *  gestionale): quanto manca, entro quando, link. true se è partita. */
async function inviaEmailSaldo(
  p: typeof prenotazioni.$inferSelect,
  differenzaSaldo: (pnr: string, email: string) => Promise<{ artista: string; differenza: number }>,
): Promise<boolean> {
  const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
  if (!utente) return false;
  const { inviaEmail, urlSito } = await import('../../shared/email.service.js');
  const { templateEmailService } = await import('../template-email/template-email.service.js');
  const dati = await differenzaSaldo(p.pnr, utente.email);
  const { oggetto, html } = await templateEmailService.renderizza('promemoria_saldo', {
    nome: utente.nome ?? '',
    evento: dati.artista,
    importo: formattaEuro(dati.differenza),
    scadenza: p.scadenzaSaldo ? formattaData(p.scadenzaSaldo) : 'prima della partenza',
    // Solo per i testi modificati prima di settembre 2026 ("€{{differenza}}").
    differenza: dati.differenza.toFixed(2).replace('.', ','),
    pnr: p.pnr,
    link: urlSito(`/completa-saldo/${p.pnr}?email=${encodeURIComponent(utente.email)}`),
  });
  const { inviata } = await inviaEmail({ a: utente.email, oggetto, html });
  return inviata;
}

function accontoPerPasseggero(evento: { accontoEur: string | null }) {
  return evento.accontoEur ? Number(evento.accontoEur) : env.ACCONTO_FISSO_EUR;
}

function scadenzaSaldoEvento(evento: { data: Date }) {
  return new Date(evento.data.getTime() - env.GIORNI_SCADENZA_SALDO * 24 * 3600 * 1000);
}

/** Fermata, tragitto ed evento di una riga, se oggi si possono vendere: il
 *  sito nasconde già il resto, ma una richiesta costruita a mano (o un
 *  carrello vecchio) non deve poter comprare una fermata spenta, un
 *  tragitto non in vendita o un evento in bozza, nel cestino, passato o
 *  con le vendite fermate. */
async function rigaVendibile(lettore: Pick<typeof db, 'select'>, input: Pick<CreaPrenotazioneInput, 'eventoId' | 'tragittoId' | 'fermataId'>) {
  const [fermata] = await lettore.select().from(fermate).where(eq(fermate.id, input.fermataId)).limit(1);
  if (!fermata || fermata.tragittoId !== input.tragittoId) throw new NonTrovato('Fermata');
  const [tragitto] = await lettore.select().from(tragitti).where(eq(tragitti.id, input.tragittoId)).limit(1);
  if (!tragitto || tragitto.eventoId !== input.eventoId || tragitto.eliminatoIl) throw new NonTrovato('Bus');
  const [evento] = await lettore.select().from(eventi).where(eq(eventi.id, input.eventoId)).limit(1);
  if (!evento || evento.bozza || evento.eliminatoIl) throw new NonTrovato('Evento');
  // "Ferma vendite" dal gestionale: nessuna prenotazione da nessun canale
  // (sito, link diretto, widget White Label, carrello, lista d'attesa).
  if (evento.venditeFermate) throw new ConflittoDati('Le prenotazioni per questo evento sono chiuse.');
  // Il giorno dell'evento si vende ancora (ora di Roma): i bus partono.
  if (evento.data < inizioOggiRoma()) throw new ConflittoDati('Questo evento è già passato.');
  if (!tragitto.attivo || tragitto.stato === 'DA_CONFERMARE') throw new ConflittoDati('Questo tragitto non è in vendita.');
  if (!fermata.attivo) throw new ConflittoDati('Questa fermata non è più prenotabile: scegline un\'altra.');
  if (prezzoNormaleFermata(fermata, evento, tragitto) <= 0) throw new ConflittoDati('Il prezzo di questa fermata non è ancora definito.');
  return { fermata, tragitto, evento };
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
  canaleVendita: { canale: 'WHITE_LABEL'; whiteLabelId: string } | undefined,
  /** Solo per gli ordini bundle: la quota di sconto (in euro, già
   *  ripartita e arrotondata da bundle-regole.ripartisciSconto) da
   *  togliere a QUESTA riga prima di coupon/acconto/credito. Assente nel
   *  flusso singolo: nessun cambio di comportamento. */
  scontoBundle: number | undefined,
  /** Il coupon dell'ordine, già controllato e contato una volta sola
   *  (prenotaCouponOrdine). */
  couponOrdine: CouponOrdine | null,
) {
  const [utente] = await tx.select().from(utenti).where(eq(utenti.id, utenteId)).limit(1);
  if (!utente) throw new NonAutorizzato('Account non trovato — effettua di nuovo il login.');

  const { fermata, tragitto, evento } = await rigaVendibile(tx, input);

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
    const offerta = await offerteService.verificaEIncrementaUtilizzo(tx, input.offertaId, input.eventoId);
    prezzoEffettivo = applicaScontoOfferta(prezzoNormale, offerta);
  }
  // Sconto bundle PRIMA di tutto il resto (coupon, acconto, credito,
  // commissione): "importoBase" da qui in poi è già il netto bundle,
  // così ogni calcolo a valle — e ogni report che legge
  // prenotazioni.totale — lo vede senza saperne nulla.
  const importoBase = prezzoEffettivo * input.passeggeri - (scontoBundle ?? 0);
  const { sconto, coupon: couponUsato } = couponSuRiga(couponOrdine, importoBase, input.eventoId);

  // Il coupon collegato a un promoter attribuisce la vendita anche a
  // lui — un solo codice per sconto e commissione insieme, in aggiunta
  // (non alternativa) al link ?promo= già esistente: se il cliente
  // arriva già da un link promoter E usa un coupon di UN ALTRO
  // promoter, vince il coupon (è la scelta più deliberata, fatta nel
  // form, non solo "da dove è arrivato").
  const promoterDaCoupon = await couponService.promoterDiCoupon(tx, couponUsato?.promoterId);
  const promoterCodiceEffettivo = promoterDaCoupon ?? input.promoterCodice;

  // Un codice promoter (da link o da coupon) deve corrispondere a un
  // promoter vero e non escluso da questo evento — controllo aggiunto
  // qui, prima c'era solo un campo di testo salvato senza verifica.
  //
  // Il codice che arriva può essere: il codice opaco di un LINK
  // (promoter, evento) — mai il codice leggibile del promoter, non
  // deve comparire nell'URL — oppure, per compatibilità, ancora il
  // codice diretto del promoter (vecchi link già condivisi). In
  // entrambi i casi, quello che si SALVA su prenotazioni.promoterCodice
  // resta sempre il codice VERO del promoter (mai quello del link):
  // tutte le statistiche/report esistenti si aspettano quello, non
  // cambia nulla a valle.
  let promoterCodiceDaSalvare = promoterCodiceEffettivo;
  if (promoterCodiceEffettivo) {
    const esito = await promoterPerEvento(tx, promoterCodiceEffettivo, input.eventoId);
    if (!esito.valido) throw new ErroreApplicativo('Questo codice non è valido per questo evento.', 400, 'PROMOTER_EVENTO_ESCLUSO');
    promoterCodiceDaSalvare = esito.codice;
  }

  const totale = importoBase - sconto;
  const saldoPagato = input.tipoPagamento === 'COMPLETO';
  // Acconto per passeggero (deciso dal proprietario), mai sopra il totale.
  const acconto = Math.min(accontoPerPasseggero(evento) * input.passeggeri, totale);
  const scadenzaSaldo = input.tipoPagamento === 'ACCONTO' ? scadenzaSaldoEvento(evento) : null;
  // Un acconto che nascerebbe con il saldo già scaduto non ha senso.
  if (scadenzaSaldo && scadenzaSaldo <= new Date()) {
    throw new ErroreApplicativo(`L'acconto non è più disponibile per questo evento: mancano meno di ${env.GIORNI_SCADENZA_SALDO} giorni. Scegli il pagamento completo.`, 400, 'ACCONTO_NON_DISPONIBILE');
  }

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
      // Il prezzo intero di adesso: il saldo di un acconto si calcola da qui.
      totalePrevisto: totale.toFixed(2),
      sconto: sconto.toFixed(2),
      ...(scontoBundle != null && { scontoBundle: scontoBundle.toFixed(2) }),
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
      promoterCodice: promoterCodiceDaSalvare,
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

/** Manda l'email giusta dopo che una prenotazione è stata creata —
 *  SEMPRE fuori dalla transazione (se l'invio fallisce o impiega tempo,
 *  la prenotazione resta comunque salvata, il cliente non deve mai
 *  perdere il posto per un problema di posta). Riusata sia per una
 *  prenotazione singola sia per ognuna di un ordine con più articoli
 *  (carrello e bundle). */
async function inviaConfermaPrenotazione(risultato: Awaited<ReturnType<typeof creaRigaInterna>>): Promise<boolean> {
  let inviata = false;
  try {
    if (risultato.tipoPagamento === 'COMPLETO') {
      // Pagamento pieno: SUBITO la conferma di pagamento, senza PDF. Il
      // biglietto con il bus parte solo dopo lo smistamento sui bus, il
      // giorno prima della partenza (smistamento.service.ts). I codici QR
      // si registrano già adesso (credito fedeltà, area cliente), senza
      // email; se questo fallisce la conferma parte comunque.
      const { ticketService } = await import('../ticket/ticket.service.js');
      try {
        await ticketService.emetti(risultato.pnr);
      } catch (err) {
        console.error(`Registrazione biglietto non riuscita per PNR ${risultato.pnr} (la conferma di pagamento parte comunque):`, err);
      }
      ({ inviata } = await ticketService.inviaConfermaPagamento(risultato.pnr));
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
        importo: formattaEuro(risultato.totale),
        scadenza: risultato.scadenzaSaldo ? formattaData(risultato.scadenzaSaldo) : 'prima della partenza',
        // Solo per i testi modificati prima di settembre 2026 ("€{{totale}}").
        totale: Number(risultato.totale).toFixed(2).replace('.', ','),
        evento: risultato.eventoArtista,
        link_saldo: urlSito(`/completa-saldo/${risultato.pnr}?email=${encodeURIComponent(risultato.utenteEmail)}`),
      });
      ({ inviata } = await inviaEmail({ a: risultato.utenteEmail, oggetto, html }));
    }
  } catch (err) {
    console.error('Invio email di conferma prenotazione non riuscito:', err);
  }
  // Resta scritto nel registro attività del gestionale, non solo nei log.
  if (!inviata) await segnalaEmailNonPartita(risultato.tipoPagamento === 'COMPLETO' ? 'Conferma della prenotazione' : "Conferma dell'acconto", risultato.pnr, risultato.utenteEmail);

  // Con i passeggeri nuovi può servire una linea da confermare (soglia di
  // pareggio raggiunta, bus pieni). Non lancia mai.
  const { lineeDaConfermareService } = await import('../eventi/linee-da-confermare.service.js');
  await lineeDaConfermareService.allineaSubito(risultato.tragittoId);

  // Chi prenota quando mancano meno di 24 ore alla partenza (anche il giorno
  // stesso) riceve subito il bus e, a saldo completato, il biglietto, dopo la
  // conferma: non aspetta il giro di smistamento dell'ora. Se la partenza è
  // lontana non fa nulla; non lancia mai.
  const { smistamentoService } = await import('./smistamento.service.js');
  await smistamentoService.smistaSubito(risultato.tragittoId);
  return inviata;
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
  async crea(input: CreaPrenotazioneInput, utenteId: string, canaleVendita?: { canale: 'WHITE_LABEL'; whiteLabelId: string }, richiesta?: { ip?: string; userAgent?: string }) {
    const risultato = await db.transaction(async (tx) => {
      const couponOrdine = await prenotaCouponOrdine(tx, [input], await emailUtente(tx, utenteId));
      const riga = await creaRigaInterna(tx, input, utenteId, canaleVendita, undefined, couponOrdine);
      verificaCouponUsato(couponOrdine);
      return riga;
    });
    const emailConfermaInviata = await inviaConfermaPrenotazione(risultato);
    // Meta Conversions API — best-effort, dopo che la prenotazione è già
    // confermata: un problema con l'API di Meta non deve mai bloccare o
    // ritardare la risposta al cliente.
    if (input.metaEventId) {
      inviaEventoMetaSeConfigurato({
        nomeEvento: 'Purchase', eventId: input.metaEventId, valore: Number(risultato.totaleComplessivo),
        email: input.cliente.email, telefono: input.cliente.telefono ?? undefined,
        ipCliente: richiesta?.ip, userAgentCliente: richiesta?.userAgent, fbp: input.metaFbp, fbc: input.metaFbc,
      }, canaleVendita?.canale === 'WHITE_LABEL' ? canaleVendita.whiteLabelId : undefined);
    }
    // Il sito lo dice al cliente se la conferma non è partita.
    return { ...risultato, emailConfermaInviata };
  },

  /** Crea un intero ORDINE con più prodotti (carrello) in un'unica
   *  transazione atomica — se anche un solo articolo fallisce (posti
   *  esauriti, coupon non valido, ecc), va tutto indietro, nessuna
   *  prenotazione a metà creata. Ogni articolo resta comunque una vera
   *  prenotazione a sé, con il suo PNR, il suo biglietto, la sua email
   *  — semplicemente in più raggruppate sotto lo stesso ordine. */
  async creaOrdine(articoli: CreaPrenotazioneInput[], utenteId: string, bundleId?: string, canaleVendita?: { canale: 'WHITE_LABEL'; whiteLabelId: string }, richiesta?: { ip?: string; userAgent?: string }) {
    if (articoli.length === 0) {
      throw new ErroreApplicativo('Il carrello è vuoto.', 400, 'CARRELLO_VUOTO');
    }
    if (articoli.length > 20) {
      throw new ErroreApplicativo('Troppi articoli in un unico ordine (massimo 20).', 400, 'CARRELLO_TROPPO_GRANDE');
    }

    // ---- BUNDLE: tutte le regole verificate QUI, lato server, prima di
    // toccare il database. Il form del sito le fa rispettare per UX, ma
    // una richiesta costruita a mano non può aggirarle.
    let scontiPerRiga: number[] | undefined;
    let bundleScelto: Awaited<ReturnType<typeof bundleService.perAcquisto>> | undefined;
    if (bundleId) {
      bundleScelto = await bundleService.perAcquisto(bundleId); // lancia se non IN_VENDITA
      const erroreComposizione = verificaComposizione(
        { tipo: bundleScelto.tipo, eventiIds: bundleScelto.eventiIds, minEventi: bundleScelto.minEventi, maxEventi: bundleScelto.maxEventi, minPosti: bundleScelto.minPosti, maxPosti: bundleScelto.maxPosti },
        articoli.map((a) => ({ eventoId: a.eventoId, passeggeri: a.passeggeri })),
      );
      if (erroreComposizione) throw new ErroreApplicativo(erroreComposizione, 400, 'BUNDLE_COMPOSIZIONE');
      if (!bundleScelto.ammetteOfferte && articoli.some((a) => a.couponCodice || a.offertaId)) throw new ErroreApplicativo('Questo bundle non ammette codici sconto o offerte.', 400, 'BUNDLE_NO_OFFERTE');
      if (!bundleScelto.ammetteAcconto && articoli.some((a) => a.tipoPagamento === 'ACCONTO')) throw new ErroreApplicativo('Questo bundle richiede il pagamento completo.', 400, 'BUNDLE_NO_ACCONTO');
      if (!bundleScelto.ammettePromoter && articoli.some((a) => a.promoterCodice)) throw new ErroreApplicativo('Questo bundle non è vendibile tramite promoter.', 400, 'BUNDLE_NO_PROMOTER');
      if (!bundleScelto.ammetteCredito) articoli = articoli.map((a) => ({ ...a, usaCredito: false }));
      // Sconto ripartito per riga sul prezzo della riga (fermata + extra,
      // con l'eventuale offerta), in centesimi esatti — serve il prezzo di
      // ogni riga PRIMA di crearla: lo si calcola qui come farà poi
      // creaRigaInterna.
      const importi: number[] = [];
      for (const a of articoli) {
        const { fermata, tragitto, evento } = await rigaVendibile(db, a);
        const [offerta] = a.offertaId ? await db.select().from(offerteEvento).where(eq(offerteEvento.id, a.offertaId)).limit(1) : [];
        importi.push(applicaScontoOfferta(prezzoNormaleFermata(fermata, evento, tragitto), offerta) * a.passeggeri);
      }
      scontiPerRiga = ripartisciSconto(importi, bundleScelto.scontoPercentuale);
    }

    // Nel carrello il codice promoter è quello di quando l'articolo è stato
    // aggiunto, anche giorni prima: se nel frattempo non vale più per
    // quell'evento si toglie da quella riga invece di bloccare l'intero
    // ordine. Nel checkout singolo resta l'errore (creaRigaInterna).
    articoli = await Promise.all(articoli.map(async (a) => (
      a.promoterCodice && !(await promoterPerEvento(db, a.promoterCodice, a.eventoId)).valido
        ? { ...a, promoterCodice: undefined }
        : a
    )));

    const { ordine, righe } = await db.transaction(async (tx) => {
      const couponOrdine = await prenotaCouponOrdine(tx, articoli, await emailUtente(tx, utenteId));
      const righeCreate = [];
      for (const [i, articolo] of articoli.entries()) {
        righeCreate.push(await creaRigaInterna(tx, articolo, utenteId, canaleVendita, scontiPerRiga?.[i], couponOrdine));
      }
      verificaCouponUsato(couponOrdine);
      const totaleOrdine = righeCreate.reduce((somma, r) => somma + Number(r.totale), 0);
      const scontoBundleTotale = scontiPerRiga ? scontiPerRiga.reduce((a, b) => a + b, 0) : null;
      const [nuovoOrdine] = await tx.insert(ordini).values({
        utenteId, totale: totaleOrdine.toFixed(2),
        ...(bundleScelto && { bundleId: bundleScelto.id, scontoBundle: scontoBundleTotale!.toFixed(2) }),
      }).returning();
      await tx.update(prenotazioni).set({ ordineId: nuovoOrdine.id }).where(inArray(prenotazioni.id, righeCreate.map((r) => r.id)));
      return { ordine: nuovoOrdine, righe: righeCreate };
    });

    // Fuori dalla transazione, come per la prenotazione singola — un
    // biglietto/email per ciascun articolo dell'ordine.
    let emailConfermaNonInviate = 0;
    for (const riga of righe) {
      if (!(await inviaConfermaPrenotazione(riga))) emailConfermaNonInviate++;
    }
    // Riepilogo del bundle in una mail sola (best-effort: l'ordine è già
    // fatto, una mail che fallisce non lo deve annullare).
    if (bundleScelto && righe[0]?.utenteEmail) {
      try {
        const { templateEmailService } = await import('../template-email/template-email.service.js');
        const { inviaEmail } = await import('../../shared/email.service.js');
        const totaleOriginale = righe.reduce((s, r) => s + Number(r.totaleComplessivo) + Number(r.scontoBundle ?? 0), 0);
        const { oggetto, html } = await templateEmailService.renderizza('bundle_conferma', {
          nome: righe[0].utenteNome || 'cliente',
          bundle: bundleScelto.nome,
          eventi: righe.map((r) => r.eventoArtista).join(', '),
          totaleOriginale: formattaEuro(totaleOriginale),
          sconto: formattaEuro(ordine.scontoBundle ?? 0),
          totale: formattaEuro(ordine.totale),
        });
        const { inviata } = await inviaEmail({ a: righe[0].utenteEmail, oggetto, html });
        if (!inviata) await segnalaEmailNonPartita(`Riepilogo del bundle "${bundleScelto.nome}"`, righe.map((r) => r.pnr).join(', '), righe[0].utenteEmail);
      } catch (e) {
        console.error('[bundle] mail di riepilogo fallita:', e instanceof Error ? e.message : e);
      }
    }

    // Stesso evento Meta di "crea", ma UNA volta per ordine (valore
    // totale, non per riga) — l'eventId lo prende dal primo articolo
    // che lo porta (il frontend lo genera una volta per l'intero
    // ordine, non per articolo).
    const metaEventId = articoli.find((a) => a.metaEventId)?.metaEventId;
    if (metaEventId) {
      inviaEventoMetaSeConfigurato({
        // Stesso valore della prenotazione singola e del sito: il prezzo pieno
        // (ordine.totale ha solo gli acconti e toglie il credito).
        nomeEvento: 'Purchase', eventId: metaEventId, valore: righe.reduce((s, r) => s + Number(r.totaleComplessivo), 0),
        email: articoli[0]?.cliente.email, telefono: articoli[0]?.cliente.telefono ?? undefined,
        ipCliente: richiesta?.ip, userAgentCliente: richiesta?.userAgent,
        fbp: articoli.find((a) => a.metaFbp)?.metaFbp, fbc: articoli.find((a) => a.metaFbc)?.metaFbc,
      }, canaleVendita?.canale === 'WHITE_LABEL' ? canaleVendita.whiteLabelId : undefined);
    }

    return { ordine, prenotazioni: righe.map((r) => ({ ...r, ordineId: ordine.id })), emailConfermaNonInviate };
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

  /** Cancella dal gestionale: come cancella() qui sotto, più l'avviso al
   *  cliente — solo se l'ha cancellata davvero QUESTA chiamata (mai due
   *  email per un doppio click). L'email parte dopo la transazione, best
   *  effort: una cancellazione già avvenuta non diventa mai un errore per
   *  colpa di un'email. clienteAvvisato null = era già cancellata. */
  async cancellaDaAdmin(pnr: string, motivo?: string): Promise<typeof prenotazioni.$inferSelect & { clienteAvvisato: boolean | null }> {
    const motivoFinale = motivo?.trim() || "Cancellata dall'organizzazione";
    const { appenaCancellata, ...prenotazione } = await prenotazioniService.cancella(pnr, motivoFinale);
    if (!appenaCancellata) return { ...prenotazione, clienteAvvisato: null };

    let clienteAvvisato = false;
    try {
      const [dati] = await db.select({ email: utenti.email, nome: utenti.nome, artista: eventi.artista })
        .from(prenotazioni)
        .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
        .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
        .where(eq(prenotazioni.id, prenotazione.id)).limit(1);
      if (dati?.email) {
        const { inviaEmail } = await import('../../shared/email.service.js');
        const { templateEmailService } = await import('../template-email/template-email.service.js');
        const { oggetto, html } = await templateEmailService.renderizza('prenotazione_cancellata', {
          nome: dati.nome ?? '', evento: dati.artista, pnr: prenotazione.pnr, motivo: motivoFinale,
        });
        clienteAvvisato = (await inviaEmail({ a: dati.email, oggetto, html })).inviata;
      }
    } catch (err) {
      console.error(`[prenotazioni] avviso di cancellazione al cliente (PNR ${pnr}) non riuscito:`, err);
    }
    return { ...prenotazione, clienteAvvisato };
  },

  /** Cancella e restituisce i posti al bus, in un'unica transazione.
   *  "motivo" è quello che resta scritto sulla prenotazione — chi l'ha
   *  cancellata e perché (prima era sempre "Cancellata dal cliente",
   *  anche quando cancellava l'organizzazione). appenaCancellata dice se
   *  l'ha cancellata questa chiamata (false = lo era già). */
  async cancella(pnr: string, motivo: string): Promise<typeof prenotazioni.$inferSelect & { appenaCancellata: boolean }> {
    const esito = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
      if (!p) throw new NonTrovato('Prenotazione');
      if (p.stato === 'CANCELLATA') return { ...p, appenaCancellata: false };

      // Atomico: la transizione di stato stessa fa da lucchetto — due
      // cancellazioni quasi simultanee sullo stesso PNR, solo una vince
      // questo UPDATE (l'altra vede l'elenco vuoto e sa che è già
      // stata cancellata un istante fa, evitando di liberare gli
      // stessi posti due volte). Prima di questo, i posti si
      // liberavano SUBITO, col rischio di farlo due volte se
      // arrivavano due richieste quasi insieme.
      const [aggiornata] = await tx
        .update(prenotazioni)
        .set({ stato: 'CANCELLATA', motivoCancellazione: motivo, cancellataIl: new Date() })
        .where(and(eq(prenotazioni.pnr, pnr), ne(prenotazioni.stato, 'CANCELLATA')))
        .returning();
      if (!aggiornata) return { ...p, appenaCancellata: false }; // già cancellata un istante fa da un'altra richiesta, nessun altro effetto da rifare

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

      return { ...aggiornata, appenaCancellata: true };
    });
    // Con meno passeggeri una linea da confermare può non servire più: si
    // toglie da sola. Non lancia mai.
    if (esito.appenaCancellata) {
      const { lineeDaConfermareService } = await import('../eventi/linee-da-confermare.service.js');
      await lineeDaConfermareService.allineaSubito(esito.tragittoId);
    }
    return esito;
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
  async saldaResto(pnr: string, email: string, couponCodice?: string) {
    const { riga: aggiornata, appenaSaldata } = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
      if (!p) throw new NonTrovato('Prenotazione');
      const [utente] = await tx.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
      if (!utente || utente.email.toLowerCase() !== email.toLowerCase()) throw new NonTrovato('Prenotazione');
      if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
      if (p.saldoPagato) return { riga: p, appenaSaldata: false };

      let totaleReale = await calcolaTotaleReale(p);
      // Coupon al saldo: stesso trattamento dell'acquisto pieno — sconto
      // salvato sulla prenotazione e vendita attribuita al promoter del
      // coupon, se vale per l'evento.
      let conCoupon: { codice: string; sconto: string; promoterCodice?: string } | null = null;
      if (couponCodice) {
        const c = await couponService.verificaEIncrementaUtilizzo(tx, couponCodice, utente.email);
        if (c.eventoId && c.eventoId !== p.eventoId) throw new ErroreApplicativo('Questo coupon non è valido per questo evento', 400, 'COUPON_NON_VALIDO');
        const sconto = scontoCoupon(c, totaleReale);
        totaleReale = Math.max(0, totaleReale - sconto);
        const promoterDaCoupon = await couponService.promoterDiCoupon(tx, c.promoterId);
        const esito = promoterDaCoupon ? await promoterPerEvento(tx, promoterDaCoupon, p.eventoId) : null;
        conCoupon = { codice: c.codice, sconto: (Number(p.sconto) + sconto).toFixed(2), ...(esito?.valido && { promoterCodice: esito.codice }) };
      }

      // Atomico anche qui: la condizione "saldoPagato = false" si
      // riverifica proprio nel comando che lo imposta — due richieste
      // di saldo quasi simultanee sulla stessa prenotazione, solo una
      // delle due riesce (la seconda vede l'elenco vuoto invece di
      // pagare/emettere il biglietto una seconda volta).
      const [riga] = await tx
        .update(prenotazioni)
        .set({
          saldoPagato: true, saldoPagatoIl: new Date(), totale: totaleReale.toFixed(2), totalePrevisto: totaleReale.toFixed(2),
          ...(conCoupon && { couponCodice: conCoupon.codice, sconto: conCoupon.sconto }),
          ...(conCoupon?.promoterCodice && { promoterCodice: conCoupon.promoterCodice }),
        })
        .where(and(eq(prenotazioni.pnr, pnr), eq(prenotazioni.saldoPagato, false)))
        .returning();
      if (!riga) throw new ConflittoDati('Il saldo di questa prenotazione è già stato pagato un istante fa.');
      return { riga, appenaSaldata: true };
    });

    if (!appenaSaldata) return aggiornata; // era già saldata prima di questa chiamata, nessun biglietto da rigenerare

    // Saldo completato — fuori dalla transazione: un problema di posta non
    // toglie mai il saldo già segnato. Subito la conferma di pagamento
    // (senza PDF) e i codici QR registrati; il biglietto con il bus parte
    // dopo lo smistamento. Se lo smistamento è già passato mentre mancava
    // il saldo, il bus c'è già e il biglietto parte adesso (lo smistamento
    // lo manda solo a chi ha pagato tutto).
    const { ticketService } = await import('../ticket/ticket.service.js');
    try {
      await ticketService.emetti(pnr);
    } catch (err) {
      console.error('Registrazione biglietto dopo saldo non riuscita (la conferma di pagamento parte comunque):', err);
    }
    // inviaConfermaPagamento e inviaBigliettoConBus non lanciano per un'email
    // non partita (restituiscono inviata: false); un errore vero conta uguale.
    const conferma = await ticketService.inviaConfermaPagamento(pnr).catch(() => ({ inviata: false }));
    if (!conferma.inviata) await segnalaEmailNonPartita('Conferma del saldo', pnr, email);
    if (aggiornata.busId) {
      const biglietto = await ticketService.inviaBigliettoConBus(pnr).catch(() => ({ inviata: false }));
      if (!biglietto.inviata) await segnalaEmailNonPartita('Biglietto con il bus (dopo il saldo)', pnr, email);
    }

    // La pagina del saldo dice al cliente se la conferma non è partita.
    return { ...aggiornata, emailConfermaInviata: conferma.inviata };
  },

  /** Quanto manca da pagare su una prenotazione ad acconto (per mostrarlo
   *  nella pagina pubblica di completamento saldo, senza doverlo
   *  ricalcolare lato frontend). */
  async differenzaSaldo(pnr: string, email: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!utente || utente.email.toLowerCase() !== email.toLowerCase()) throw new NonTrovato('Prenotazione');
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

  /** Sollecito manuale — l'amministratore lo manda quando vuole, a
   *  differenza del promemoria automatico. Stessa email. */
  async inviaSollecitoManuale(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.tipoPagamento !== 'ACCONTO' || p.saldoPagato) throw new ConflittoDati('Questa prenotazione non ha un saldo da sollecitare.');
    return { inviata: await inviaEmailSaldo(p, this.differenzaSaldo.bind(this)) };
  },

  // Lo smistamento sui bus per età vive in smistamento.service.ts.

  /** Promemoria automatico (scheduler, ogni giorno e all'avvio): le
   *  prenotazioni ad acconto con il saldo in scadenza entro domani, o già
   *  scaduto se il server era spento, di eventi non ancora passati. Si segna
   *  "inviato" solo se l'email parte davvero: se no ci riprova il giro dopo. */
  async inviaPromemoriaSaldo() {
    const domani = new Date(Date.now() + 24 * 3600 * 1000);
    const daAvvisare = await db
      .select({ prenotazione: prenotazioni })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(and(
        eq(prenotazioni.stato, 'CONFERMATA'),
        eq(prenotazioni.tipoPagamento, 'ACCONTO'),
        eq(prenotazioni.saldoPagato, false),
        eq(prenotazioni.promemoriaSaldoInviato, false),
        lte(prenotazioni.scadenzaSaldo, domani),
        gte(eventi.data, inizioOggiRoma()),
      ));

    let inviate = 0;
    for (const { prenotazione: p } of daAvvisare) {
      if (!(await inviaEmailSaldo(p, this.differenzaSaldo.bind(this)))) continue;
      await db.update(prenotazioni).set({ promemoriaSaldoInviato: true }).where(eq(prenotazioni.id, p.id));
      inviate++;
    }
    return { inviate };
  },
};
