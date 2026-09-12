import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PercorsoBus } from '../PercorsoBus';
import type { Evento, OpzionePartenza, Servizio } from '../../api/types';
import { eventiApi } from '../../api/eventi';
import { prenotazioniApi } from '../../api/prenotazioni';
import { whiteLabelApi } from '../../api/whiteLabel';
import { listaAttesaApi } from '../../api/listaAttesa';
import { applicaScontoOfferta } from '../../api/prezzi';
import { clienteAuthApi } from '../../api/clienteAuth';
import { clienteLoggato, logoutCliente } from '../../features/clienteSessione';
import { useCarrello } from '../carrello/CarrelloContext';
import { EtichettaPosti, SceltaFermata } from './SceltaFermata';
import { Stepper } from './Stepper';
import { CampoTesto } from './CampoTesto';
import { provenienzaDaUrl } from './provenienza';
import { tracciaInizioPrenotazione, tracciaAcquisto, leggiCookieMeta } from '../metaPixel';
import { tracciaInizioCheckoutGA4, tracciaAcquistoGA4, tracciaAcquistoGoogleAds } from '../googleAnalytics';
import { formattaEuro, plurale } from '../../shared/formato';
import { MESSAGGIO_CONNESSIONE, testoErrore } from '../../shared/errori';
import { comportamentoScorrimento } from '../../shared/movimento';
import { Icona } from '../Icone';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Acconto a passeggero quando l'evento non ne ha uno suo (stesso
 *  default del server, ACCONTO_FISSO_EUR). Solo per mostrarlo. */
export const ACCONTO_PREDEFINITO_EUR = 10;

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'confermato-attesa' | 'errore';
interface Partecipante { nome: string; cognome: string; }

/** Se il cliente arriva da un link con offerta dedicata (/offerta/:slug),
 *  lo sconto percentuale si applica al prezzo normale di qualunque
 *  fermata scelga — non è un prezzo fisso, dato che il prezzo varia già
 *  per fermata. */
export interface OffertaCheckout { id: string; nome: string; scontoPercentuale: number; }

/** "sab 17 ott" — nel fuso di Roma, come le card. */
export function formattaDataBreve(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short' });
}

function oggiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Modulo di prenotazione a passi: 1) fermata e posti, 2) i tuoi dati,
 * 3) riepilogo — che sul sito è la pagina del carrello (/carrello), nel
 * widget White Label (publicWidgetId) il pagamento qui dentro. Lo
 * montano la pagina evento/offerta (pannello a destra su desktop,
 * foglio a schermo intero sui telefoni), il popup della home e il widget.
 *
 * fermataPreselezionata: la pagina evento la passa quando il cliente
 * tocca "Scegli" su una partenza — il modulo seleziona quella fermata e
 * torna al passo 1.
 */
export function CheckoutForm({ evento, offerta, onChiudi, publicWidgetId, temaColori, fermataPreselezionata, richiestaPreselezione }: {
  evento: Evento; offerta?: OffertaCheckout; onChiudi?: () => void; publicWidgetId?: string;
  fermataPreselezionata?: string;
  /** Cambia a ogni "Scegli" della pagina, anche sulla stessa fermata:
   *  così dopo "Cambia fermata" un nuovo "Scegli" richiude l'elenco. */
  richiestaPreselezione?: number;
  // Se il checkout arriva da una White Label con un suo tema, questi
  // colori sovrascrivono quelli del sito per TUTTO il modulo. Facoltativo:
  // senza, il checkout resta quello del sito OnWay.
  temaColori?: { sfondo: string; superficie: string; testoPrincipale: string; testoSecondario: string; cta: string; testoCta: string; bordi: string };
}) {
  const [stato, setStato] = useState<Stato>('caricamento');
  // Quale pulsante specifico è stato premuto — 'invio' da solo non basta,
  // altrimenti "Conferma" e "Conferma con acconto" si accenderebbero insieme.
  const [azioneInCorso, setAzioneInCorso] = useState<'acquista' | 'prenota' | 'lista-attesa' | null>(null);
  // Se l'evento ha più di un servizio, prima bisogna sceglierne uno: un
  // passo in più, davanti agli altri. Con zero o un servizio si va dritti.
  const multiServizio = evento.servizi.length >= 2;
  const navigate = useNavigate();
  const { aggiungi: aggiungiAlCarrello } = useCarrello();
  const [percorsoAperto, setPercorsoAperto] = useState(false);
  const prefisso = useId();
  const loggato = clienteLoggato();

  // Le variabili CSS del tema White Label, se presente — sovrascritte
  // qui (non nel foglio di stile) così restano scoped a QUESTO modulo.
  const styleTema: React.CSSProperties | undefined = temaColori ? {
    '--paper': temaColori.superficie,
    '--ink': temaColori.testoPrincipale,
    '--mist': temaColori.testoSecondario,
    '--line': temaColori.bordi,
    '--pink': temaColori.cta,
    '--cta-sfondo': temaColori.cta,
    '--cta-testo': temaColori.testoCta,
    // Sfondo delle fasce fisse (passi e riepilogo in alto, azioni in basso)
    '--checkout-fondo': temaColori.superficie,
  } as React.CSSProperties : undefined;

  const [servizioScelto, setServizioScelto] = useState<Servizio | null>(multiServizio ? null : (evento.servizi[0] ?? null));
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Cambiando passo si riparte dall'inizio del modulo: con le fasce fisse
  // l'utente preme "Continua" anche a metà elenco, e il passo nuovo si
  // aprirebbe a metà. Scorre solo il contenitore del modulo (foglio,
  // pannello, popup o pagina del widget) e solo se l'inizio è fuori vista.
  const radiceRef = useRef<HTMLDivElement>(null);
  const stepPrecedente = useRef(step);
  useEffect(() => {
    if (stepPrecedente.current === step) return;
    stepPrecedente.current = step;
    const radice = radiceRef.current;
    if (!radice) return;
    let contenitore: HTMLElement | null = null;
    for (let p = radice.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) { contenitore = p; break; }
    }
    const scarto = radice.getBoundingClientRect().top - (contenitore ? contenitore.getBoundingClientRect().top : 0);
    if (scarto >= 0) return;
    // Foglio, pannello e popup contengono solo il modulo (e il suo titolo):
    // si torna in cima, sotto le loro testate fisse. Nella pagina del widget
    // si porta l'inizio del modulo in cima alla finestra.
    if (contenitore) contenitore.scrollTo({ top: 0, behavior: comportamentoScorrimento() });
    else window.scrollBy({ top: scarto, behavior: comportamentoScorrimento() });
  }, [step]);
  const [opzioni, setOpzioni] = useState<OpzionePartenza[]>([]);
  const [fermataId, setFermataId] = useState('');
  // Fermata già scelta con "Scegli" nella pagina: il passo 1 mostra solo
  // quella, con "Cambia fermata"; l'elenco completo si apre su richiesta.
  const [elencoFermateAperto, setElencoFermateAperto] = useState(!fermataPreselezionata);
  const [erroreFermata, setErroreFermata] = useState('');
  const [passeggeri, setPasseggeri] = useState(1);

  // Modulo richiedente — si compila da solo dall'account, se c'è, ma
  // resta modificabile.
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [telefono, setTelefono] = useState('');
  // Solo per chi prenota senza account: chi è loggato le ha già sul
  // profilo e non le ripete qui.
  const [citta, setCitta] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [creditoDisponibile, setCreditoDisponibile] = useState(0);
  const [usaCredito, setUsaCredito] = useState(false);
  const [couponCodice, setCouponCodice] = useState('');
  const [couponVerificato, setCouponVerificato] = useState<{ sconto: number; tipo: 'PERCENTUALE' | 'FISSO'; valore: string } | null>(null);
  const [couponErrore, setCouponErrore] = useState('');
  const [verificandoCoupon, setVerificandoCoupon] = useState(false);

  // Un nome+cognome per ogni passeggero OLTRE al richiedente.
  const [partecipanti, setPartecipanti] = useState<Partecipante[]>([]);
  // Errori dei campi del passo 2, per chiave ('email', 'p0-nome', …).
  const [errori, setErrori] = useState<Record<string, string>>({});

  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [pnrConfermato, setPnrConfermato] = useState('');
  // Fermata da selezionare appena arrivano le opzioni (preselezione
  // arrivata prima del caricamento, o che richiede un altro servizio).
  const preselezioneInAttesa = useRef<string | null>(null);

  useEffect(() => {
    if (multiServizio && !servizioScelto) { setStato('pronto'); return; }
    setStato('caricamento');
    eventiApi.opzioniPartenza(evento.id, servizioScelto?.id).then((o) => {
      setOpzioni(o);
      const inAttesa = preselezioneInAttesa.current;
      if (inAttesa && o.some((x) => x.fermataId === inAttesa)) {
        preselezioneInAttesa.current = null;
        setFermataId(inAttesa);
        setErroreFermata('');
        setStep(1);
      }
      setStato('pronto');
    }).catch(() => {
      setMessaggioErrore('Non riusciamo a caricare le fermate in questo momento. Riprova tra poco.');
      setStato('errore');
    });
  }, [evento.id, servizioScelto?.id, multiServizio]);

  // "Scegli" su una partenza della pagina: seleziona quella fermata (e il
  // suo servizio, se serve) e resta al passo 1.
  useEffect(() => {
    if (!fermataPreselezionata) return;
    setElencoFermateAperto(false);
    if (multiServizio) {
      const servizio = evento.servizi.find((s) => s.tragitti.some((t) => t.fermate.some((f) => f.id === fermataPreselezionata)));
      if (servizio && servizio.id !== servizioScelto?.id) {
        preselezioneInAttesa.current = fermataPreselezionata;
        setServizioScelto(servizio);
        setStep(1);
        return;
      }
    }
    if (opzioni.some((o) => o.fermataId === fermataPreselezionata)) {
      scegliFermata(fermataPreselezionata);
      setStep(1);
    } else {
      preselezioneInAttesa.current = fermataPreselezionata;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fermataPreselezionata, richiestaPreselezione]);

  useEffect(() => {
    setPartecipanti((prev) => {
      const necessari = Math.max(0, passeggeri - 1);
      if (prev.length === necessari) return prev;
      if (prev.length < necessari) return [...prev, ...Array(necessari - prev.length).fill(null).map(() => ({ nome: '', cognome: '' }))];
      return prev.slice(0, necessari);
    });
  }, [passeggeri]);

  // Dati dal proprio account, se il cliente è loggato.
  useEffect(() => {
    if (!clienteLoggato()) return;
    clienteAuthApi.me().then((dati) => {
      setEmail(dati.email);
      if (dati.nome) setNome(dati.nome);
      if (dati.cognome) setCognome(dati.cognome);
      if (dati.telefono) setTelefono(dati.telefono);
      setCreditoDisponibile(Number(dati.creditoDisponibile));
    }).catch(() => {
      // Il token non è più valido — lo togliamo, il modulo mostra l'invito ad accedere.
      logoutCliente();
    });
  }, []);

  // Popup del percorso: all'apertura il focus va su "Chiudi", Esc chiude
  // e il focus torna a "Vedi il percorso". L'ascoltatore è in cattura e
  // ferma l'evento: dentro il foglio mobile Esc chiudeva anche il foglio.
  const percorsoApriRef = useRef<HTMLButtonElement>(null);
  const percorsoChiudiRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!percorsoAperto) return;
    percorsoChiudiRef.current?.focus();
    const allaPressione = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPercorsoAperto(false);
    };
    window.addEventListener('keydown', allaPressione, true);
    return () => {
      window.removeEventListener('keydown', allaPressione, true);
      percorsoApriRef.current?.focus();
    };
  }, [percorsoAperto]);

  function scegliFermata(id: string) {
    setFermataId(id);
    setErroreFermata('');
    const scelta = opzioni.find((o) => o.fermataId === id);
    if (scelta) { tracciaInizioPrenotazione(scelta.prezzoEffettivo * passeggeri); tracciaInizioCheckoutGA4(scelta.prezzoEffettivo * passeggeri, evento.artista); }
  }

  function aggiornaPartecipante(idx: number, campo: keyof Partecipante, valore: string) {
    setPartecipanti((prev) => prev.map((p, i) => i === idx ? { ...p, [campo]: valore } : p));
    togliErrore(`p${idx}-${campo}`);
  }

  function togliErrore(chiave: string) {
    setErrori((prev) => {
      if (!(chiave in prev)) return prev;
      const nuovi = { ...prev };
      delete nuovi[chiave];
      return nuovi;
    });
  }

  const opzioneScelta = opzioni.find((o) => o.fermataId === fermataId);
  // L'arrivo (destinazione + orario) vive sul TRAGITTO: si mostra solo
  // quando la fermata è scelta, così è quello giusto.
  const tragittoScelto = opzioneScelta
    ? [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === opzioneScelta.tragittoId)
    : undefined;
  const tutteEsaurite = opzioni.length === 0 || opzioni.every((o) => o.postiDisponibili === 0);
  const fermataEsaurita = !!opzioneScelta && opzioneScelta.postiDisponibili === 0;
  const prezzoUnitario = opzioneScelta
    ? (offerta ? applicaScontoOfferta(opzioneScelta.prezzoEffettivo, offerta.scontoPercentuale) : opzioneScelta.prezzoEffettivo)
    : 0;
  const totale = opzioneScelta ? prezzoUnitario * passeggeri : 0;
  // Il credito vale solo pagando tutto, mai oltre il totale (il server
  // ricontrolla per conto suo: questo è solo quello che si mostra).
  const creditoApplicato = usaCredito ? Math.min(creditoDisponibile, totale) : 0;
  const totaleConCredito = totale - creditoApplicato;
  const accontoUnitario = evento.accontoEur ? Number(evento.accontoEur) : ACCONTO_PREDEFINITO_EUR;

  // ---------- Validazione del passo 2 ----------
  function erroreCampo(chiave: string): string | null {
    switch (chiave) {
      case 'email':
        if (!email.trim()) return "Inserisci l'email";
        return REGEX_EMAIL.test(email.trim()) ? null : "Controlla l'indirizzo email: manca la @ o il dominio";
      case 'telefono': return telefono.trim() ? null : 'Inserisci il telefono';
      case 'dataNascita': return dataNascita ? null : 'Inserisci la data di nascita';
      case 'nome': return nome.trim() ? null : 'Inserisci il nome';
      case 'cognome': return cognome.trim() ? null : 'Inserisci il cognome';
      default: {
        const m = chiave.match(/^p(\d+)-(nome|cognome)$/);
        if (!m) return null;
        const p = partecipanti[Number(m[1])];
        if (!p) return null;
        return p[m[2] as keyof Partecipante].trim() ? null : (m[2] === 'nome' ? 'Inserisci il nome' : 'Inserisci il cognome');
      }
    }
  }
  function validaCampo(chiave: string) {
    const e = erroreCampo(chiave);
    setErrori((prev) => {
      const nuovi = { ...prev };
      if (e) nuovi[chiave] = e; else delete nuovi[chiave];
      return nuovi;
    });
  }
  function validaPasso2(): boolean {
    const chiavi = ['email', 'telefono', ...(loggato ? [] : ['dataNascita']), 'nome', 'cognome', ...partecipanti.flatMap((_, i) => [`p${i}-nome`, `p${i}-cognome`])];
    const nuovi: Record<string, string> = {};
    for (const k of chiavi) { const e = erroreCampo(k); if (e) nuovi[k] = e; }
    setErrori(nuovi);
    const primo = chiavi.find((k) => nuovi[k]);
    if (primo) { document.getElementById(`${prefisso}-${primo}`)?.focus(); return false; }
    return true;
  }

  function continuaPasso1() {
    if (!opzioneScelta) { setErroreFermata('Scegli una fermata di partenza per continuare'); return; }
    setStep(2);
  }

  function continuaPasso2() {
    if (!validaPasso2()) return;
    if (!publicWidgetId && opzioneScelta) {
      // Sul sito il pagamento non avviene qui: l'articolo, già completo
      // (fermata, passeggeri coi nomi, dati del richiedente), va nel
      // carrello e si passa subito lì. Nel widget White Label resta tutto
      // qui, al passo 3.
      aggiungiAlCarrello({
        eventoId: evento.id,
        eventoArtista: evento.artista,
        eventoData: evento.data,
        eventoSlug: evento.slug,
        eventoImmagine: evento.immagini[0]?.url,
        eventoCitta: evento.citta,
        eventoLuogo: evento.luogo,
        tragittoId: opzioneScelta.tragittoId,
        fermataId: opzioneScelta.fermataId,
        fermataCitta: opzioneScelta.fermataCitta,
        fermataIndirizzo: opzioneScelta.fermataIndirizzo || undefined,
        fermataOrario: opzioneScelta.fermataOrario,
        orarioRitorno: opzioneScelta.orarioRitorno,
        arrivoOrario: tragittoScelto?.arrivoOrario ?? null,
        accontoEur: evento.accontoEur ? Number(evento.accontoEur) : null,
        prezzoStimato: opzioneScelta.prezzoEffettivo,
        passeggeri,
        offertaId: offerta?.id,
        cliente: { email: email.trim(), nome: nome.trim(), cognome: cognome.trim(), telefono: telefono.trim(), citta: citta.trim() || undefined, dataNascita: dataNascita || undefined },
        partecipanti: partecipanti.map((p) => ({ nome: p.nome.trim(), cognome: p.cognome.trim() })),
        ...provenienzaDaUrl(),
      });
      navigate('/carrello');
    } else {
      setStep(3);
    }
  }

  async function verificaCoupon() {
    if (!couponCodice.trim() || !opzioneScelta) return;
    setVerificandoCoupon(true);
    setCouponErrore('');
    setCouponVerificato(null);
    try {
      const r = await fetch(`${API_URL}/api/coupon/valida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice: couponCodice.trim(), importo: totale, eventoId: evento.id, ...(email && { emailCliente: email }) }),
      });
      const dati = await r.json();
      if (!r.ok) throw new Error(dati.errore ?? 'Codice non valido.');
      setCouponVerificato(dati);
    } catch (e) {
      setCouponErrore(e instanceof TypeError ? MESSAGGIO_CONNESSIONE : e instanceof Error ? e.message : 'Codice non valido.');
    } finally {
      setVerificandoCoupon(false);
    }
  }

  async function confermaPrenotazione(tipoPagamento: 'COMPLETO' | 'ACCONTO') {
    if (!opzioneScelta) return;
    setStato('invio');
    setAzioneInCorso(tipoPagamento === 'COMPLETO' ? 'acquista' : 'prenota');
    setMessaggioErrore('');
    try {
      const { promoterCodice, utmSource, utmMedium, utmCampaign, utmContent } = provenienzaDaUrl();
      // Il pixel di INBUS traccia sempre (anche dal widget White Label);
      // se l'organizzatore ha il suo pixel, lo stesso evento arriva anche a lui.
      const metaEventId = crypto.randomUUID();
      const { fbp, fbc } = leggiCookieMeta();
      const payloadPrenotazione = {
        eventoId: evento.id,
        tragittoId: opzioneScelta.tragittoId,
        fermataId: opzioneScelta.fermataId,
        passeggeri,
        tipoPagamento,
        metodoPagamento: 'DA_CONCORDARE' as const, // nessun pagamento online reale ancora: non registrare "Carta"
        cliente: { email: email.trim(), nome: nome.trim(), cognome: cognome.trim(), telefono: telefono.trim() },
        partecipanti,
        ...(promoterCodice && { promoterCodice }),
        ...(offerta && { offertaId: offerta.id }),
        ...(usaCredito && tipoPagamento === 'COMPLETO' && { usaCredito: true }),
        ...(couponVerificato && tipoPagamento === 'COMPLETO' && { couponCodice: couponCodice.trim() }),
        ...(utmSource && { utmSource }),
        ...(utmMedium && { utmMedium }),
        ...(utmCampaign && { utmCampaign }),
        ...(utmContent && { utmContent }),
        ...(metaEventId && { metaEventId }),
        ...(fbp && { metaFbp: fbp }),
        ...(fbc && { metaFbc: fbc }),
      };
      // Dentro il widget White Label la prenotazione passa da un endpoint
      // diverso (stessa logica lato server, più l'attribuzione del canale).
      const prenotazione = publicWidgetId
        ? await whiteLabelApi.prenota(publicWidgetId, payloadPrenotazione)
        : await prenotazioniApi.crea(payloadPrenotazione);
      setPnrConfermato(prenotazione.pnr);
      if (metaEventId) {
        const valoreEuro = opzioneScelta.prezzoEffettivo * passeggeri; // stima lato client: il valore vero lo calcola il server per la Conversions API
        tracciaAcquisto(valoreEuro, metaEventId);
        tracciaAcquistoGA4(valoreEuro, prenotazione.pnr, evento.artista);
        tracciaAcquistoGoogleAds(valoreEuro, prenotazione.pnr);
      }
      setStato('confermato');
    } catch (e) {
      setMessaggioErrore(testoErrore(e));
      setStato('errore');
      setAzioneInCorso(null);
    }
  }

  async function iscrivitiListaAttesa() {
    setStato('invio');
    setAzioneInCorso('lista-attesa');
    setMessaggioErrore('');
    try {
      await listaAttesaApi.iscriviti({
        eventoId: evento.id,
        tragittoId: opzioneScelta?.tragittoId,
        fermataId: opzioneScelta?.fermataId,
        passeggeri,
        cliente: { email: email.trim(), nome: nome.trim(), cognome: cognome.trim(), telefono: telefono.trim() },
        partecipanti,
      });
      setStato('confermato-attesa');
    } catch (e) {
      setMessaggioErrore(testoErrore(e));
      setStato('errore');
      setAzioneInCorso(null);
    }
  }

  // ---------- Esiti ----------
  if (stato === 'confermato') {
    return (
      <div className="checkout-form checkout-esito" style={styleTema}>
        <span className="esito-icona" aria-hidden="true"><Icona nome="spunta" dimensione={32} strokeWidth={2.4} /></span>
        <h3>Prenotazione confermata</h3>
        <p>
          Il tuo codice è <b>{pnrConfermato}</b>. Ti abbiamo mandato la conferma a <b>{email}</b>; il biglietto con il
          numero del bus arriva via email prima della partenza.
        </p>
        {onChiudi && <button type="button" className="btn btn-primary btn-block" onClick={onChiudi}>Chiudi</button>}
      </div>
    );
  }

  if (stato === 'confermato-attesa') {
    return (
      <div className="checkout-form checkout-esito" style={styleTema}>
        <h3>Sei in lista d'attesa</h3>
        <p>
          Ti scriveremo a <b>{email}</b> appena si libera un posto per <b>{evento.artista}</b>, con un link per
          completare subito la prenotazione.
        </p>
        {onChiudi && <button type="button" className="btn btn-primary btn-block" onClick={onChiudi}>Chiudi</button>}
      </div>
    );
  }

  // "Ferma vendite" dal gestionale: niente modulo e niente lista d'attesa
  // (il server rifiuta comunque ogni prenotazione). Vale anche nel widget.
  if (evento.venditeFermate) {
    return (
      <div className="checkout-form checkout-esito" style={styleTema}>
        <h3>Prenotazioni chiuse</h3>
        <p>Le prenotazioni per <b>{evento.artista}</b> sono chiuse.</p>
        {onChiudi && <button type="button" className="btn btn-secondary btn-block" onClick={onChiudi}>Chiudi</button>}
      </div>
    );
  }

  // ---------- Stepper e riepilogo ----------
  const vociStepper = [...(multiServizio ? ['Servizio'] : []), 'Fermata e posti', 'I tuoi dati', publicWidgetId ? 'Pagamento' : 'Riepilogo'];
  const passoAttivo = (multiServizio ? (servizioScelto ? step : 0) : step - 1);
  const partiRiepilogo: string[] = [formattaDataBreve(evento.data)];
  if (multiServizio && servizioScelto) partiRiepilogo.push(servizioScelto.nome);
  if (opzioneScelta) {
    // Breve apposta: il riepilogo resta fisso in alto e deve occupare poco.
    // Arrivo e ritorno sono nel percorso ("Vedi il percorso") e nel passo finale.
    partiRiepilogo.push(`${opzioneScelta.fermataCitta}${opzioneScelta.fermataOrario ? ` ${opzioneScelta.fermataOrario}` : ''}`);
  }
  partiRiepilogo.push(plurale(passeggeri, 'passeggero', 'passeggeri'));
  const idPercorso = `${prefisso}-percorso`;
  const idPasseggeri = `${prefisso}-passeggeri`;
  const invio = stato === 'invio';

  return (
    <div className="checkout-form" style={styleTema} ref={radiceRef}>
      {offerta && (
        <p className="avviso avviso-ok">Offerta {offerta.nome}: −{offerta.scontoPercentuale.toFixed(0)}% su tutte le fermate.</p>
      )}

      {/* Fascia fissa in alto (checkout.css): passi e riepilogo restano
          visibili mentre si scorre l'elenco delle fermate o il modulo. */}
      <div className="checkout-testata">
        <Stepper voci={vociStepper} attivo={passoAttivo} />

        {/* Riepilogo sempre visibile, in ogni passo: cosa si sta per prenotare. */}
        <div className="riepilogo">
          <div className="riepilogo-testo">
            <p className="riepilogo-artista">{evento.artista}</p>
            <p className="riepilogo-riga"><Icona nome="bus" dimensione={16} /><span>{partiRiepilogo.join(' · ')}</span></p>
          </div>
          {opzioneScelta && (
            <div className="riepilogo-lato">
              <p className="riepilogo-totale">{formattaEuro(step === 3 ? totaleConCredito : totale)}</p>
              <button ref={percorsoApriRef} type="button" className="btn btn-tertiary btn-sm riepilogo-percorso" onClick={() => setPercorsoAperto(true)}>Vedi il percorso</button>
            </div>
          )}
        </div>
      </div>

      {percorsoAperto && opzioneScelta && (
        <div className="percorso-popup-overlay" onClick={() => setPercorsoAperto(false)}>
          <div className="percorso-popup-card" role="dialog" aria-modal="true" aria-labelledby={idPercorso} onClick={(e) => e.stopPropagation()}>
            <div className="percorso-popup-testata">
              <h3 id={idPercorso}>Il percorso del tuo bus</h3>
              <button ref={percorsoChiudiRef} type="button" className="btn-icona" aria-label="Chiudi" onClick={() => setPercorsoAperto(false)}><Icona nome="chiudi" /></button>
            </div>
            <PercorsoBus evento={evento} soloTragittoId={opzioneScelta.tragittoId} fermataEvidenziataId={opzioneScelta.fermataId} />
          </div>
        </div>
      )}

      {stato === 'caricamento' && <p className="campo-aiuto" aria-live="polite">Carico le fermate disponibili…</p>}
      {stato === 'errore' && step === 1 && messaggioErrore && <p className="campo-errore" role="alert">{messaggioErrore}</p>}

      {multiServizio && !servizioScelto && (
        <div className="servizi">
          <p className="campo-aiuto">Questo evento ha più opzioni di servizio: scegli quella che preferisci.</p>
          {evento.servizi.map((v) => {
            const orariDistinti = [...new Set(v.tragitti.map((t) => t.arrivoOrario).filter((o): o is string => !!o))];
            const arrivoComune = orariDistinti.length === 1 ? orariDistinti[0] : null;
            return (
              <button key={v.id} type="button" className="servizio-card" onClick={() => setServizioScelto(v)}>
                <b>{v.nome}</b>
                {arrivoComune && <span>Arrivo previsto alle {arrivoComune}</span>}
                <Icona nome="freccia" dimensione={18} />
              </button>
            );
          })}
        </div>
      )}

      {stato !== 'caricamento' && (!multiServizio || servizioScelto) && (
        <>
          {step === 1 && (
            <div className="checkout-passo">
              {multiServizio && (
                <button type="button" className="btn btn-tertiary btn-sm" onClick={() => { setServizioScelto(null); setFermataId(''); }}>Cambia servizio</button>
              )}
              {tutteEsaurite && (
                <p className="avviso avviso-attenzione">
                  Al momento non ci sono posti disponibili. Puoi comunque lasciare i tuoi dati e iscriverti alla lista
                  d'attesa: ti avvisiamo via email appena si libera un posto.
                </p>
              )}
              {!tutteEsaurite && fermataEsaurita && (
                <p className="avviso avviso-attenzione">
                  I posti da questa fermata sono esauriti. Scegli un'altra fermata, oppure iscriviti alla lista d'attesa
                  per questa: ti avvisiamo se si libera un posto qui.
                </p>
              )}

              {!elencoFermateAperto && opzioneScelta ? (
                <div className="fermata-scelta">
                  <p className="campo-etichetta">Fermata di partenza</p>
                  <div className="fermata-opzione selezionata fermata-scelta-card">
                    <span className="fermata-citta">{opzioneScelta.fermataCitta}</span>
                    <span className="fermata-prezzo">
                      {formattaEuro(prezzoUnitario, { senzaDecimali: Number.isInteger(prezzoUnitario) })}
                    </span>
                    {opzioneScelta.fermataIndirizzo && <span className="fermata-indirizzo">{opzioneScelta.fermataIndirizzo}</span>}
                    <span className="fermata-orari">
                      <Icona nome="orologio" dimensione={14} />
                      {opzioneScelta.fermataOrario ? `Andata ${opzioneScelta.fermataOrario}` : 'Orario da definire'}
                      {opzioneScelta.orarioRitorno && ` · Ritorno ${opzioneScelta.orarioRitorno}`}
                    </span>
                    <EtichettaPosti posti={opzioneScelta.postiDisponibili} />
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setElencoFermateAperto(true)}>Cambia fermata</button>
                </div>
              ) : (
                <SceltaFermata opzioni={opzioni} valore={fermataId} onSeleziona={scegliFermata} offerta={offerta} />
              )}
              {erroreFermata && <p className="campo-errore" role="alert">{erroreFermata}</p>}
              {opzioneScelta?.sogliaMinima != null && (
                <p className="avviso avviso-neutro">
                  Questa fermata parte con almeno {opzioneScelta.sogliaMinima} partecipanti
                  {opzioneScelta.partecipantiAttuali != null && <> (oggi {opzioneScelta.partecipantiAttuali})</>}.
                  Se non si raggiunge, ti avvisiamo e puoi scegliere un'alternativa o il rimborso.
                </p>
              )}

              {/* Fascia fissa in basso: passeggeri e "Continua" sempre a
                  portata, anche scegliendo la prima fermata di un elenco lungo. */}
              <div className="checkout-nav checkout-nav-fissa">
              <div className="campo checkout-nav-passeggeri">
                <span className="campo-etichetta" id={idPasseggeri}>Passeggeri</span>
                <div className="qty-control" role="group" aria-labelledby={idPasseggeri}>
                  <button type="button" onClick={() => setPasseggeri((p) => Math.max(1, p - 1))} aria-label="Togli un passeggero" disabled={passeggeri <= 1}>−</button>
                  <input
                    className="qty-input"
                    type="text"
                    inputMode="numeric"
                    aria-label="Numero di passeggeri"
                    value={passeggeri}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      if (v === '') { setPasseggeri(1); return; }
                      setPasseggeri(Math.min(20, Math.max(1, Number(v))));
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                  <button type="button" onClick={() => setPasseggeri((p) => Math.min(20, p + 1))} aria-label="Aggiungi un passeggero" disabled={passeggeri >= 20}>+</button>
                  <span className="sr-only" aria-live="polite">{plurale(passeggeri, 'passeggero', 'passeggeri')}</span>
                </div>
              </div>
                <button type="button" className="btn btn-primary btn-lg" onClick={continuaPasso1}>Continua</button>
              </div>
            </div>
          )}

          {step === 2 && (
            publicWidgetId && !loggato ? (
              // Il widget White Label paga qui dentro con l'endpoint
              // autenticato: serve un account vero. Il modulo ospite è
              // pensato per il sito, dove il pagamento avviene nel carrello.
              <div className="checkout-passo checkout-accesso">
                <p className="campo-etichetta">Serve un account per prenotare</p>
                <p className="campo-aiuto">
                  Ci vuole un minuto: dopo l'accesso torni qui con la fermata e i passeggeri già scelti.
                </p>
                <a href={`/accedi?dopo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="btn btn-primary btn-lg btn-block">Accedi</a>
                <a href={`/registrati?dopo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="btn btn-secondary btn-lg btn-block">Registrati</a>
                <div className="checkout-nav">
                  <button type="button" className="btn btn-tertiary" onClick={() => setStep(1)}>Indietro</button>
                </div>
              </div>
            ) : (
              <form className="checkout-passo" noValidate onSubmit={(e) => { e.preventDefault(); continuaPasso2(); }}>
                {!loggato && (
                  <p className="campo-aiuto checkout-accedi">
                    Hai già un account? <a href={`/accedi?dopo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Accedi</a>
                  </p>
                )}

                <CampoTesto
                  id={`${prefisso}-email`} etichetta="Email" type="email" autoComplete="email" inputMode="email" required
                  value={email} onChange={(e) => { setEmail(e.target.value); togliErrore('email'); }} onBlur={() => validaCampo('email')}
                  disabled={loggato} aiuto={loggato ? 'Dal tuo account' : 'Qui arrivano conferma e biglietto'} errore={errori.email}
                />
                <CampoTesto
                  id={`${prefisso}-telefono`} etichetta="Telefono" type="tel" autoComplete="tel" inputMode="tel" required
                  value={telefono} onChange={(e) => { setTelefono(e.target.value); togliErrore('telefono'); }} onBlur={() => validaCampo('telefono')}
                  aiuto="Per avvisarti il giorno del viaggio" errore={errori.telefono}
                />
                {/* Data di nascita e città solo da ospite: chi è loggato le ha
                    già sull'account. La data resta obbligatoria: serve a
                    comporre i gruppi sul bus. */}
                {!loggato && (
                  <div className="campi-affiancati">
                    <CampoTesto
                      id={`${prefisso}-dataNascita`} etichetta="Data di nascita" type="date" autoComplete="bday" required
                      min="1900-01-01" max={oggiIso()}
                      value={dataNascita} onChange={(e) => { setDataNascita(e.target.value); togliErrore('dataNascita'); }} onBlur={() => validaCampo('dataNascita')}
                      aiuto="Serve per organizzare i gruppi sul bus" errore={errori.dataNascita}
                    />
                    <CampoTesto
                      id={`${prefisso}-citta`} etichetta="Città (facoltativa)" type="text" autoComplete="address-level2"
                      value={citta} onChange={(e) => setCitta(e.target.value)}
                    />
                  </div>
                )}

                <fieldset className="passeggero">
                  <legend className="campo-etichetta">Passeggero 1 (tu)</legend>
                  <div className="campi-affiancati">
                    <CampoTesto
                      id={`${prefisso}-nome`} etichetta="Nome" type="text" autoComplete="given-name" required
                      value={nome} onChange={(e) => { setNome(e.target.value); togliErrore('nome'); }} onBlur={() => validaCampo('nome')} errore={errori.nome}
                    />
                    <CampoTesto
                      id={`${prefisso}-cognome`} etichetta="Cognome" type="text" autoComplete="family-name" required
                      value={cognome} onChange={(e) => { setCognome(e.target.value); togliErrore('cognome'); }} onBlur={() => validaCampo('cognome')} errore={errori.cognome}
                    />
                  </div>
                </fieldset>
                {partecipanti.map((p, idx) => (
                  <fieldset key={idx} className="passeggero">
                    <legend className="campo-etichetta">Passeggero {idx + 2}</legend>
                    <div className="campi-affiancati">
                      <CampoTesto
                        id={`${prefisso}-p${idx}-nome`} etichetta="Nome" type="text" required
                        value={p.nome} onChange={(e) => aggiornaPartecipante(idx, 'nome', e.target.value)} onBlur={() => validaCampo(`p${idx}-nome`)} errore={errori[`p${idx}-nome`]}
                      />
                      <CampoTesto
                        id={`${prefisso}-p${idx}-cognome`} etichetta="Cognome" type="text" required
                        value={p.cognome} onChange={(e) => aggiornaPartecipante(idx, 'cognome', e.target.value)} onBlur={() => validaCampo(`p${idx}-cognome`)} errore={errori[`p${idx}-cognome`]}
                      />
                    </div>
                  </fieldset>
                ))}

                <div className="checkout-nav checkout-nav-fissa">
                  <button type="button" className="btn btn-tertiary" onClick={() => setStep(1)}>Indietro</button>
                  <button type="submit" className="btn btn-primary btn-lg">Continua</button>
                </div>
              </form>
            )
          )}

          {step === 3 && (
            <div className="checkout-passo">
              {messaggioErrore && <p className="campo-errore" role="alert">{messaggioErrore}</p>}

              {fermataEsaurita ? (
                <>
                  <p>
                    Confermi l'iscrizione alla lista d'attesa per {plurale(passeggeri, 'passeggero', 'passeggeri')} a
                    "{evento.artista}"{opzioneScelta ? ` da ${opzioneScelta.fermataCitta}` : ''}?
                  </p>
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={invio} onClick={iscrivitiListaAttesa}>
                    {azioneInCorso === 'lista-attesa' ? 'Invio…' : "Iscriviti alla lista d'attesa"}
                  </button>
                </>
              ) : (
                <>
                  <div className="riepilogo-card">
                    <p className="riepilogo-artista">{evento.artista}</p>
                    <p className="campo-aiuto">
                      {opzioneScelta?.fermataCitta}{opzioneScelta?.fermataOrario ? ` · andata ${opzioneScelta.fermataOrario}` : ''}
                      {opzioneScelta?.orarioRitorno ? ` · ritorno ${opzioneScelta.orarioRitorno}` : ''} · {plurale(passeggeri, 'passeggero', 'passeggeri')}
                    </p>
                  </div>

                  <p className="importo-grande">
                    {creditoApplicato > 0 ? (
                      <><s className="importo-prima">{formattaEuro(totale)}</s> {formattaEuro(totaleConCredito)}</>
                    ) : formattaEuro(totale)}
                  </p>

                  {creditoDisponibile > 0 && (
                    <label className="scelta-check">
                      <input type="checkbox" checked={usaCredito} onChange={(e) => setUsaCredito(e.target.checked)} />
                      Usa il tuo credito ({formattaEuro(creditoDisponibile)} disponibili)
                    </label>
                  )}

                  <div className="campo">
                    <label className="campo-etichetta" htmlFor={`${prefisso}-coupon`}>Codice sconto (facoltativo)</label>
                    <div className="coupon-riga">
                      <input
                        id={`${prefisso}-coupon`} className="campo-input" type="text" autoComplete="off"
                        value={couponCodice}
                        onChange={(e) => { setCouponCodice(e.target.value.toUpperCase()); setCouponVerificato(null); setCouponErrore(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), verificaCoupon())}
                        disabled={!!couponVerificato}
                        aria-invalid={couponErrore ? true : undefined}
                        aria-describedby={couponErrore ? `${prefisso}-coupon-errore` : `${prefisso}-coupon-aiuto`}
                      />
                      <button type="button" className="btn btn-secondary" onClick={verificaCoupon} disabled={!couponCodice.trim() || verificandoCoupon || !!couponVerificato}>
                        {verificandoCoupon ? 'Verifico…' : couponVerificato ? <><Icona nome="spunta" dimensione={16} /> Applicato</> : 'Applica'}
                      </button>
                    </div>
                    {couponErrore && <p className="campo-errore" id={`${prefisso}-coupon-errore`} role="alert">{couponErrore}</p>}
                    {couponVerificato && (
                      <p className="campo-aiuto">
                        Sconto di <b>{formattaEuro(couponVerificato.sconto)}</b>: pagando tutto ora il totale è <b>{formattaEuro(Math.max(0, totale - couponVerificato.sconto))}</b>.
                      </p>
                    )}
                    <p className="campo-aiuto" id={`${prefisso}-coupon-aiuto`}>Il codice vale solo pagando tutto ora. Con l'acconto puoi usarlo quando saldi il resto.</p>
                  </div>

                  {/* Nessun sistema di pagamento collegato: niente campi carta,
                      l'ordine si registra come "Da concordare". */}
                  <p className="checkout-nota">Non paghi ora online: la prenotazione viene registrata e concordiamo il pagamento con te.</p>

                  <div className="checkout-azioni">
                    <button type="button" className="btn btn-primary btn-lg btn-block" disabled={invio} onClick={() => confermaPrenotazione('COMPLETO')}>
                      {azioneInCorso === 'acquista' ? 'Invio…' : 'Conferma la prenotazione'}
                    </button>
                    <p className="checkout-nota-btn">Importo intero: {formattaEuro(totaleConCredito)}</p>
                    <button type="button" className="btn btn-secondary btn-lg btn-block" disabled={invio} onClick={() => confermaPrenotazione('ACCONTO')}>
                      {azioneInCorso === 'prenota' ? 'Invio…' : 'Conferma con acconto'}
                    </button>
                    <p className="checkout-nota-btn">
                      Acconto di {formattaEuro(accontoUnitario)} a passeggero ({formattaEuro(accontoUnitario * passeggeri)} in tutto ora),
                      il resto entro 15 giorni prima della partenza.
                    </p>
                  </div>

                  <p className="riga-fiducia">
                    <Icona nome="lucchetto" dimensione={16} />
                    <span>I tuoi dati sono trattati in modo riservato, secondo la nostra <a href="/pagina/privacy" target="_blank" rel="noopener">informativa privacy</a>.</span>
                  </p>
                </>
              )}

              <div className="checkout-nav">
                <button type="button" className="btn btn-tertiary" onClick={() => setStep(2)}>Indietro</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
