import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, partecipantiPrenotazione, whiteLabel, busFisici, linee } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { inviaEmail } from '../../shared/email.service.js';
import { formattaData, formattaEuro, formattaOra } from '../../shared/formato.js';
import { layoutBigliettoService, disegnaBigliettoPdf } from '../layout-biglietto/layout-biglietto.service.js';
import { templateEmailService } from '../template-email/template-email.service.js';
import { tempiPrenotazione } from '../prenotazioni/partenza.js';

/** Biglietti ed email del biglietto.
 *
 *  Il flusso (deciso dal proprietario):
 *  1. al pagamento completo (o al saldo) il cliente riceve SUBITO la
 *     conferma di pagamento, senza PDF; i codici QR si creano già adesso
 *     (servono al credito fedeltà e all'area cliente), senza email;
 *  2. il giorno prima della partenza lo smistamento assegna il bus, e solo
 *     allora parte l'email con i PDF, che riportano linea e bus;
 *  3. dall'area cliente il PDF si scarica da 24 ore prima della partenza e
 *     solo con il bus assegnato. */

type Prenotazione = typeof prenotazioni.$inferSelect;
type Evento = typeof eventi.$inferSelect;

export const MESSAGGIO_BIGLIETTO_PRIMA_DELLO_SMISTAMENTO = 'Il biglietto si invia dopo lo smistamento sui bus, il giorno prima della partenza.';

/** Il layout del biglietto da usare per QUESTA prenotazione — se è
 *  arrivata da una White Label che ha un suo layout proprio impostato,
 *  usa quello (il cliente che compra tramite l'organizzatore vede il
 *  biglietto con i suoi loghi sponsor); altrimenti, come sempre, quello
 *  scelto per l'evento. Una prenotazione dal sito INBUS normale (senza
 *  whiteLabelId) va sempre e solo sul layout dell'evento. */
async function risolviLayoutBigliettoId(whiteLabelId: string | null, eventoLayoutBigliettoId: string | null): Promise<string | null> {
  if (!whiteLabelId) return eventoLayoutBigliettoId;
  const [wl] = await db.select({ layoutBigliettoId: whiteLabel.layoutBigliettoId }).from(whiteLabel).where(eq(whiteLabel.id, whiteLabelId)).limit(1);
  return wl?.layoutBigliettoId ?? eventoLayoutBigliettoId;
}

/** Genera un token casuale — usato sia per il "lotto" della prenotazione
 *  (ticketToken su prenotazioni, segna che il biglietto è stato emesso)
 *  sia, uno diverso per ciascuno, per ogni singolo passeggero (serve al
 *  controllo accessi sul bus, per contare chi è salito davvero persona
 *  per persona, non a gruppo intero). */
function generaToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** "05/09/2026 alle 14:00" (ora di Roma). */
function dataEOra(data: Date) {
  return `${formattaData(data)} alle ${formattaOra(data)}`;
}

async function busDellaPrenotazione(busId: string | null): Promise<{ riferimento: string; lineaNome: string | null } | null> {
  if (!busId) return null;
  const [riga] = await db.select({ riferimento: busFisici.riferimento, lineaNome: linee.nome }).from(busFisici)
    .leftJoin(linee, eq(linee.id, busFisici.lineaId))
    .where(eq(busFisici.id, busId)).limit(1);
  return riga ?? null;
}

/** "Linea 1 · Bus AB123CD" */
function etichettaBus(bus: { riferimento: string; lineaNome: string | null }) {
  return bus.lineaNome ? `${bus.lineaNome} · Bus ${bus.riferimento}` : `Bus ${bus.riferimento}`;
}

/** I partecipanti della prenotazione, ognuno con il SUO codice QR: crea
 *  solo quelli mancanti, non cambia mai un codice già dato (un PDF già
 *  inviato deve restare valido). */
async function partecipantiConToken(prenotazioneId: string) {
  const elenco = () => db.select().from(partecipantiPrenotazione)
    .where(eq(partecipantiPrenotazione.prenotazioneId, prenotazioneId))
    .orderBy(asc(partecipantiPrenotazione.ordine));
  const partecipanti = await elenco();
  if (partecipanti.every((pt) => pt.ticketToken)) return partecipanti;
  for (const pt of partecipanti) {
    if (pt.ticketToken) continue;
    await db.update(partecipantiPrenotazione).set({ ticketToken: generaToken() })
      .where(and(eq(partecipantiPrenotazione.id, pt.id), isNull(partecipantiPrenotazione.ticketToken)));
  }
  return elenco();
}

async function configurazioneBiglietto(p: Prenotazione, evento: Evento) {
  const layoutIdEffettivo = await risolviLayoutBigliettoId(p.whiteLabelId, evento.layoutBigliettoId);
  const config = await layoutBigliettoService.getPerEvento(layoutIdEffettivo);
  return evento.ticketColoreAccento ? { ...config, coloreAccento: evento.ticketColoreAccento } : config;
}

async function pdfPartecipante(
  config: Awaited<ReturnType<typeof configurazioneBiglietto>>,
  p: Prenotazione,
  evento: Evento,
  pt: { nome: string; cognome: string; ticketToken: string | null },
  orarioFermata: string | null,
  nomeBus: string,
) {
  const qrDataUrl = await QRCode.toDataURL(`ONWAY:TICKET:${p.pnr}:${pt.ticketToken}`, { margin: 1, width: 300 });
  return disegnaBigliettoPdf(config, {
    artista: evento.artista,
    dataEvento: evento.data,
    fermataCitta: p.fermataCitta,
    fermataOrario: orarioFermata ?? p.fermataOrario,
    passeggeriNomi: [`${pt.nome} ${pt.cognome}`],
    pnr: p.pnr,
    qrDataUrl,
    immagineIntestazioneUrl: evento.ticketImmagineSfondoUrl,
    nomeBus,
  });
}

export const ticketService = {
  /** Registra il biglietto (codici QR dei passeggeri, stato EMESSO) e
   *  matura il credito — SENZA email: il biglietto vero, con il bus, parte
   *  dopo lo smistamento (inviaBigliettoConBus). Solo a pagamento completo:
   *  con il solo acconto non esiste ancora un biglietto valido. Si può
   *  richiamare: la seconda volta non fa nulla. */
  async emetti(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
    if (!p.saldoPagato) throw new ConflittoDati('Il biglietto si emette solo a saldo completato.');
    if (p.ticketToken) return; // già emesso

    await partecipantiConToken(p.id);

    // Il token sulla prenotazione resta come "lotto": segna che l'emissione
    // è avvenuta (il controllo accessi guarda i token dei partecipanti).
    // Atomico: due chiamate quasi insieme, solo una emette e matura il credito.
    const [emesso] = await db.update(prenotazioni).set({
      ticketToken: generaToken(),
      ticketStato: 'EMESSO',
      ticketEmessoIl: new Date(),
    }).where(and(eq(prenotazioni.id, p.id), isNull(prenotazioni.ticketToken))).returning({ id: prenotazioni.id });
    if (!emesso) return;

    try {
      const { creditoService } = await import('../credito/credito.service.js');
      await creditoService.maturaCreditoSubito(p.id);
      await creditoService.maturaBonusReferralInvitanteSeAmicoNuovo(p.id);
    } catch (err) {
      console.error(`Maturazione credito fallita per PNR ${p.pnr} (biglietto comunque emesso):`, err);
    }
  },

  /** Email "pagamento ricevuto", subito dopo il pagamento completo o il
   *  saldo: niente PDF, spiega quando arriva il biglietto con il bus. */
  async inviaConfermaPagamento(pnr: string): Promise<{ inviata: boolean }> {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    const [utente] = await db.select({ email: utenti.email, nome: utenti.nome }).from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!evento || !utente?.email) return { inviata: false };

    const tempi = await tempiPrenotazione(p);
    const { oggetto, html } = await templateEmailService.renderizza('conferma_pagamento', {
      nome: utente.nome ?? '',
      evento: evento.artista,
      data: formattaData(evento.data),
      fermata: p.fermataCitta,
      pnr: p.pnr,
      importo: formattaEuro(p.totale),
      disponibileDal: tempi ? dataEOra(tempi.disponibileDal) : 'giorno prima della partenza',
    }, { escapaHtml: ['nome', 'evento', 'fermata', 'pnr'] });
    return inviaEmail({ a: utente.email, oggetto, html });
  },

  /** L'email del biglietto con i PDF (uno per passeggero, con linea e bus).
   *  La manda lo smistamento quando assegna il bus, il saldo se il bus c'era
   *  già, e "Rigenera biglietto" nel gestionale. 409 senza bus o senza saldo. */
  async inviaBigliettoConBus(pnr: string): Promise<{ inviata: boolean }> {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
    if (!p.busId) throw new ConflittoDati(MESSAGGIO_BIGLIETTO_PRIMA_DELLO_SMISTAMENTO);
    if (!p.saldoPagato) throw new ConflittoDati('Il biglietto si invia solo a saldo completato.');
    const bus = await busDellaPrenotazione(p.busId);
    if (!bus) throw new ConflittoDati(MESSAGGIO_BIGLIETTO_PRIMA_DELLO_SMISTAMENTO);
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    if (!evento) throw new NonTrovato('Evento');

    // Se l'emissione al pagamento non era riuscita, la si recupera qui.
    await ticketService.emetti(pnr);
    const partecipanti = await partecipantiConToken(p.id);
    const tempi = await tempiPrenotazione(p);
    const config = await configurazioneBiglietto(p, evento);
    const nomeBus = etichettaBus(bus);

    const allegati = await Promise.all(partecipanti.map(async (pt, indice) => ({
      nomeFile: partecipanti.length > 1
        ? `biglietto-${p.pnr}-${indice + 1}-${pt.nome}-${pt.cognome}`.replace(/[^a-zA-Z0-9-]+/g, '-') + '.pdf'
        : `biglietto-${p.pnr}.pdf`,
      contenuto: await pdfPartecipante(config, p, evento, pt, tempi?.orarioFermata ?? null, nomeBus),
      tipo: 'application/pdf',
    })));

    const [utente] = await db.select({ email: utenti.email, nome: utenti.nome }).from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!utente?.email) return { inviata: false };
    const { oggetto, html } = await templateEmailService.renderizza('ticket', {
      nome: utente.nome ?? '',
      evento: evento.artista,
      data: formattaData(evento.data),
      fermata: p.fermataCitta,
      orario: tempi?.orarioFermata ?? 'da definire',
      bus: nomeBus,
      pnr: p.pnr,
    }, { escapaHtml: ['nome', 'evento', 'fermata', 'orario', 'bus', 'pnr'] });
    return inviaEmail({ a: utente.email, oggetto, html, allegati });
  },

  /** L'elenco dei biglietti di una prenotazione, per il cliente che vuole
   *  recuperarli — solo quelli registrati (pagamento completo), ognuno con
   *  da quando è scaricabile e con il bus (null finché non c'è). Verifica
   *  l'email come altrove: non un vero controllo d'accesso, ma non lascia
   *  vedere prenotazioni altrui a chi non conosce già l'email giusta. */
  async bigliettiPerCliente(pnr: string, email: string): Promise<{ nome: string; cognome: string; token: string; disponibileDal: string | null; bus: string | null }[]> {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!utente || utente.email.toLowerCase() !== email.toLowerCase()) throw new NonTrovato('Prenotazione');

    const partecipanti = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.prenotazioneId, p.id))
      .orderBy(asc(partecipantiPrenotazione.ordine));
    const conBiglietto = partecipanti.filter((pt) => pt.ticketToken);
    if (conBiglietto.length === 0) return [];

    const tempi = await tempiPrenotazione(p);
    const bus = await busDellaPrenotazione(p.busId);
    return conBiglietto.map((pt) => ({
      nome: pt.nome,
      cognome: pt.cognome,
      token: pt.ticketToken as string,
      disponibileDal: tempi ? tempi.disponibileDal.toISOString() : null,
      bus: bus?.riferimento ?? null,
    }));
  },

  /** Ridisegna lo STESSO biglietto già emesso (stesso QR, stesso token) —
   *  il PDF non viene salvato da nessuna parte, si ricrea identico al
   *  bisogno. Scaricabile solo da 24 ore prima della partenza (ora di Roma)
   *  e con il bus già assegnato dallo smistamento. */
  async rigeneraPdfPerToken(token: string) {
    const [pt] = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.ticketToken, token)).limit(1);
    if (!pt) throw new NonTrovato('Biglietto');

    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, pt.prenotazioneId)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione è stata cancellata: il biglietto non è più valido.');
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    if (!evento) throw new NonTrovato('Evento');

    const tempi = await tempiPrenotazione(p);
    if (tempi && Date.now() < tempi.disponibileDal.getTime()) {
      throw new ConflittoDati(`Il biglietto sarà scaricabile dal ${dataEOra(tempi.disponibileDal)}, quando i passeggeri saranno assegnati ai bus: ti arriverà anche via email.`);
    }
    const bus = await busDellaPrenotazione(p.busId);
    if (!bus) {
      throw new ConflittoDati('Il biglietto non è ancora scaricabile: stiamo assegnando i passeggeri ai bus. Appena è pronto ti arriva anche via email.');
    }

    const config = await configurazioneBiglietto(p, evento);
    const pdfBuffer = await pdfPartecipante(config, p, evento, pt, tempi?.orarioFermata ?? null, etichettaBus(bus));
    const nomeFile = `biglietto-${p.pnr}-${pt.nome}-${pt.cognome}`.replace(/[^a-zA-Z0-9-]+/g, '-') + '.pdf';
    return { pdfBuffer, nomeFile };
  },
};
