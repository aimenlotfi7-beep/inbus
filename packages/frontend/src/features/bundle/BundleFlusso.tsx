import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BundlePubblicoDettaglio, EventoDelBundle } from '../../api/bundle';
import { formattaDataOraIt } from '../../api/bundle';
import type { Evento, OpzionePartenza } from '../../api/types';
import { clienteAuthApi } from '../../api/clienteAuth';
import { clienteLoggato } from '../clienteSessione';
import { SelettoreFermata } from '../checkout/SelettoreFermata';
import { Stepper } from '../checkout/Stepper';
import { CampoTesto } from '../checkout/CampoTesto';
import { formattaDataBreve } from '../checkout/CheckoutForm';
import { inizialiDi } from '../eventi/EventoCard';
import { Icona } from '../Icone';
import { tracciaInizioPrenotazione } from '../metaPixel';
import { tracciaInizioCheckoutGA4 } from '../googleAnalytics';
import { formattaEuro, plurale } from '../../shared/formato';
import { testoErrore } from '../../shared/errori';
import { comportamentoScorrimento } from '../../shared/movimento';

type Passo = 'eventi' | 'configura' | 'dati';
interface SceltaEvento { servizioId?: string; fermataId?: string }
interface Partecipante { nome: string; cognome: string }

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function oggiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface ConfermaBundle {
  righe: { evento: EventoDelBundle; opzione: OpzionePartenza }[];
  passeggeri: number;
  /** Data di nascita e città solo da ospite (come nel checkout evento):
   *  chi è loggato le ha già sull'account. Il carrello rifiuta un ordine
   *  da ospite senza data di nascita. */
  cliente: { email: string; nome: string; cognome: string; telefono: string; citta?: string; dataNascita?: string };
  partecipanti: Partecipante[];
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
}

/** Il flusso di acquisto di un bundle, condiviso tra la pagina del sito
 *  (che alla fine riempie il carrello) e il widget white label (che alla
 *  fine crea l'ordine dentro la pagina brandizzata). Riceve da fuori COME
 *  caricare eventi e partenze (API del sito o del widget) e COSA fare
 *  alla conferma. Nessun Layout qui: lo mette chi lo usa.
 *
 *  Stesso impianto della pagina evento: a sinistra copertina, titolo,
 *  "N eventi inclusi · −X%" e descrizione; a destra (da 901px, sotto
 *  segue in pagina) il pannello chiaro con lo stepper "Eventi →
 *  Passeggeri e partenze → I tuoi dati" e il riepilogo che si compone
 *  man mano (in INBUS il prezzo sta sulla fermata: esiste solo dopo la
 *  scelta della fermata). */
export function BundleFlusso({ bundle, caricaEvento, caricaOpzioni, onConferma, testoConferma, mostraSceltaAcconto, tema }: {
  bundle: BundlePubblicoDettaglio;
  caricaEvento: (evento: EventoDelBundle) => Promise<Evento>;
  caricaOpzioni: (eventoId: string, servizioId?: string) => Promise<OpzionePartenza[]>;
  /** Se torna dei PNR, il flusso mostra la conferma; se non torna nulla, chi chiama ha già navigato altrove. */
  onConferma: (dati: ConfermaBundle) => Promise<{ pnr: string[] } | void>;
  testoConferma: string;
  /** Widget: la scelta acconto/completo si fa qui (sul sito la fa il carrello). */
  mostraSceltaAcconto?: boolean;
  tema?: { superficie: string; testo: string; bordi: string };
}) {
  const prefisso = useId();
  const loggato = clienteLoggato();
  const libero = bundle.tipo === 'LIBERO';
  const [passo, setPasso] = useState<Passo>(libero ? 'eventi' : 'configura');
  const [selezionati, setSelezionati] = useState<string[]>(libero ? [] : bundle.eventi.filter((e) => e.vendibile).map((e) => e.id));
  const [passeggeri, setPasseggeri] = useState(bundle.minPosti);
  const [eventiCompleti, setEventiCompleti] = useState<Record<string, Evento>>({});
  const [erroriCaricamento, setErroriCaricamento] = useState<Record<string, boolean>>({});
  const [opzioni, setOpzioni] = useState<Record<string, OpzionePartenza[]>>({}); // chiave: eventoId|servizioId
  const [scelte, setScelte] = useState<Record<string, SceltaEvento>>({});
  const [cliente, setCliente] = useState({ email: '', nome: '', cognome: '', telefono: '' });
  const [dataNascita, setDataNascita] = useState('');
  const [citta, setCitta] = useState('');
  const [partecipanti, setPartecipanti] = useState<Partecipante[]>([]);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [erroreInvio, setErroreInvio] = useState('');

  const [tipoPagamento, setTipoPagamento] = useState<'COMPLETO' | 'ACCONTO'>('COMPLETO');
  const [inviando, setInviando] = useState(false);
  const [fatto, setFatto] = useState<string[] | null>(null);

  useEffect(() => {
    if (!clienteLoggato()) return;
    clienteAuthApi.me().then((d) => setCliente({ email: d.email, nome: d.nome ?? '', cognome: d.cognome ?? '', telefono: d.telefono ?? '' })).catch(() => {});
  }, []);

  useEffect(() => {
    setPartecipanti((prev) => {
      const n = Math.max(0, passeggeri - 1);
      return prev.length === n ? prev : prev.length < n ? [...prev, ...Array.from({ length: n - prev.length }, () => ({ nome: '', cognome: '' }))] : prev.slice(0, n);
    });
  }, [passeggeri]);

  // Dettaglio completo (servizi) e opzioni di partenza per ogni evento scelto.
  useEffect(() => {
    for (const id of selezionati) {
      const ev = bundle.eventi.find((e) => e.id === id);
      if (!ev || eventiCompleti[id]) continue;
      caricaEvento(ev)
        .then((completo) => setEventiCompleti((p) => ({ ...p, [id]: completo })))
        .catch(() => setErroriCaricamento((p) => ({ ...p, [id]: true })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, selezionati]);

  function chiaveOpzioni(eventoId: string, servizioId?: string) { return `${eventoId}|${servizioId ?? ''}`; }
  useEffect(() => {
    for (const id of selezionati) {
      const completo = eventiCompleti[id]; if (!completo) continue;
      const multi = completo.servizi.length > 0;
      const servizioId = scelte[id]?.servizioId;
      if (multi && !servizioId) continue;
      const k = chiaveOpzioni(id, servizioId);
      if (opzioni[k]) continue;
      caricaOpzioni(id, servizioId)
        .then((o) => setOpzioni((p) => ({ ...p, [k]: o })))
        .catch(() => setErroriCaricamento((p) => ({ ...p, [id]: true })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selezionati, eventiCompleti, scelte]);

  // Cambiando passo, il focus va sul titolo del passo: chi usa la
  // tastiera o uno screen reader non resta su un pulsante sparito.
  const titoloPassoRef = useRef<HTMLHeadingElement>(null);
  // Confronto con il passo precedente, non "primo render": in sviluppo
  // (StrictMode) l'effetto parte due volte all'apertura e il focus
  // finiva sul titolo, facendo scorrere la pagina fino al pannello.
  const passoPrecedente = useRef(passo);
  useEffect(() => {
    if (passoPrecedente.current === passo) return;
    passoPrecedente.current = passo;
    titoloPassoRef.current?.focus();
  }, [passo]);

  const minEv = bundle.minEventi ?? 1;
  const maxEv = bundle.maxEventi ?? Infinity;
  // Con plurale(): "almeno 1 eventi" non deve mai comparire.
  const testoQuantiEventi = bundle.maxEventi ? `da ${minEv} a ${bundle.maxEventi} eventi` : `almeno ${plurale(minEv, 'evento', 'eventi')}`;

  function opzioneScelta(eventoId: string): OpzionePartenza | undefined {
    const sc = scelte[eventoId]; if (!sc?.fermataId) return undefined;
    return opzioni[chiaveOpzioni(eventoId, sc.servizioId)]?.find((o) => o.fermataId === sc.fermataId);
  }
  // Nell'ordine del bundle, non in quello dei clic.
  const righeRiepilogo = bundle.eventi.filter((e) => selezionati.includes(e.id)).map((evento) => ({ evento, opzione: opzioneScelta(evento.id) }));
  const tutteScelte = righeRiepilogo.length > 0 && righeRiepilogo.every((r) => r.opzione && r.opzione.postiDisponibili >= passeggeri);
  const totaleOriginale = righeRiepilogo.reduce((s, r) => s + (r.opzione?.prezzoEffettivo ?? 0) * passeggeri, 0);
  const sconto = Math.round(totaleOriginale * Number(bundle.scontoPercentuale)) / 100;
  const scontoTesto = `−${Number(bundle.scontoPercentuale).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

  function toggleEvento(id: string) {
    setErrori((p) => { const n = { ...p }; delete n.eventi; return n; });
    setSelezionati((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  // ---------- Passo 1: eventi ----------
  function continuaEventi() {
    if (selezionati.length < minEv) { setErrori({ eventi: `Scegli almeno ${plurale(minEv, 'evento', 'eventi')}` }); return; }
    if (selezionati.length > maxEv) { setErrori({ eventi: `Puoi scegliere al massimo ${plurale(maxEv, 'evento', 'eventi')}` }); return; }
    setErrori({});
    setPasso('configura');
  }

  // ---------- Passo 2: passeggeri e partenze ----------
  function erroreFermata(id: string): string | null {
    const sc = scelte[id];
    const completo = eventiCompleti[id];
    if (completo && completo.servizi.length > 0 && !sc?.servizioId) return 'Scegli il servizio';
    const opz = opzioneScelta(id);
    if (!opz) return 'Scegli la fermata di partenza';
    if (opz.postiDisponibili < passeggeri) return `Da questa fermata non ci sono ${plurale(passeggeri, 'posto libero', 'posti liberi')}: scegline un'altra`;
    return null;
  }
  function continuaConfigura() {
    const nuovi: Record<string, string> = {};
    for (const { evento } of righeRiepilogo) { const e = erroreFermata(evento.id); if (e) nuovi[`fermata-${evento.id}`] = e; }
    setErrori(nuovi);
    const primo = righeRiepilogo.find((r) => nuovi[`fermata-${r.evento.id}`]);
    if (primo) { document.getElementById(`${prefisso}-partenza-${primo.evento.id}`)?.scrollIntoView({ behavior: comportamentoScorrimento(), block: 'center' }); return; }
    setPasso('dati');
  }

  // ---------- Passo 3: dati ----------
  function erroreCampo(chiave: string): string | null {
    switch (chiave) {
      case 'email':
        if (!cliente.email.trim()) return "Inserisci l'email";
        return REGEX_EMAIL.test(cliente.email.trim()) ? null : "Controlla l'indirizzo email: manca la @ o il dominio";
      case 'telefono': return cliente.telefono.trim() ? null : 'Inserisci il telefono';
      case 'dataNascita': return dataNascita ? null : 'Inserisci la data di nascita';
      case 'nome': return cliente.nome.trim() ? null : 'Inserisci il nome';
      case 'cognome': return cliente.cognome.trim() ? null : 'Inserisci il cognome';
      default: {
        const m = chiave.match(/^p(\d+)-(nome|cognome)$/);
        const p = m ? partecipanti[Number(m[1])] : undefined;
        if (!m || !p) return null;
        return p[m[2] as keyof Partecipante].trim() ? null : (m[2] === 'nome' ? 'Inserisci il nome' : 'Inserisci il cognome');
      }
    }
  }
  function validaCampo(chiave: string) {
    const e = erroreCampo(chiave);
    setErrori((prev) => { const n = { ...prev }; if (e) n[chiave] = e; else delete n[chiave]; return n; });
  }
  function togliErrore(chiave: string) {
    setErrori((prev) => { if (!prev[chiave]) return prev; const n = { ...prev }; delete n[chiave]; return n; });
  }
  function aggiornaPartecipante(i: number, campo: keyof Partecipante, valore: string) {
    setPartecipanti((prev) => prev.map((x, j) => j === i ? { ...x, [campo]: valore } : x));
    togliErrore(`p${i}-${campo}`);
  }

  async function conferma(e: FormEvent) {
    e.preventDefault();
    setErroreInvio('');
    const chiavi = ['email', 'telefono', ...(loggato ? [] : ['dataNascita']), 'nome', 'cognome', ...partecipanti.flatMap((_, i) => [`p${i}-nome`, `p${i}-cognome`])];
    const nuovi: Record<string, string> = {};
    for (const k of chiavi) { const err = erroreCampo(k); if (err) nuovi[k] = err; }
    setErrori(nuovi);
    const primo = chiavi.find((k) => nuovi[k]);
    if (primo) { document.getElementById(`${prefisso}-${primo}`)?.focus(); return; }
    if (!tutteScelte) { setPasso('configura'); return; }
    setInviando(true);
    try {
      const esito = await onConferma({
        righe: righeRiepilogo.map((r) => ({ evento: r.evento, opzione: r.opzione! })),
        passeggeri,
        cliente: {
          email: cliente.email.trim(), nome: cliente.nome.trim(), cognome: cliente.cognome.trim(), telefono: cliente.telefono.trim(),
          ...(!loggato && { dataNascita, citta: citta.trim() || undefined }),
        },
        partecipanti: partecipanti.map((p) => ({ nome: p.nome.trim(), cognome: p.cognome.trim() })),
        tipoPagamento,
      });
      if (esito?.pnr) setFatto(esito.pnr);
    } catch (err) {
      setErroreInvio(testoErrore(err));
    } finally { setInviando(false); }
  }

  // ---------- Markup ----------
  const vociStepper = libero ? ['Eventi', 'Passeggeri e partenze', 'I tuoi dati'] : ['Passeggeri e partenze', 'I tuoi dati'];
  const passoAttivo = (libero ? ['eventi', 'configura', 'dati'] : ['configura', 'dati']).indexOf(passo);
  const composizione = libero
    ? `Scegli ${testoQuantiEventi} tra ${bundle.eventi.length}`
    : `${plurale(bundle.eventi.length, 'evento incluso', 'eventi inclusi')}`;

  if (fatto) {
    return (
      <div className={`bundle-flusso${tema ? ' con-tema' : ''}`}>
        <div className="prenota-pannello superficie-chiara bundle-esito" style={tema ? { background: tema.superficie, color: tema.testo } : undefined}>
          <div className="esito" role="status">
            <span className="esito-icona" aria-hidden="true"><Icona nome="spunta" dimensione={40} strokeWidth={2.4} /></span>
            <h1>Ordine confermato</h1>
            <p>Riceverai un'email di conferma con un biglietto per ogni evento del bundle.</p>
            <ul className="esito-codici">
              {fatto.map((pnr) => <li key={pnr}>Codice <b>{pnr}</b></li>)}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bundle-flusso bundle-griglia${tema ? ' con-tema' : ''}`} style={tema ? { color: tema.testo } : undefined}>
      {/* ---------- Colonna principale ---------- */}
      <div className="bundle-principale">
        <div className="evento-cover">
          {bundle.copertinaUrl
            ? <img src={bundle.copertinaUrl} alt={bundle.nome} width={1200} height={800} decoding="async" {...{ fetchpriority: 'high' }} />
            : <div className="evento-cover-segnaposto" aria-hidden="true">{bundle.nome}</div>}
          <span className="evento-cover-genere">Bundle</span>
        </div>

        <div className="evento-testata">
          <h1>{bundle.nome}</h1>
          <p className="bundle-composizione">
            <span>{composizione}</span>
            {Number(bundle.scontoPercentuale) > 0 && <span className="badge">{scontoTesto}</span>}
          </p>
          {bundle.stato === 'PROGRAMMATO' && bundle.inizioVendita && (
            <p className="bundle-nota"><Icona nome="orologio" dimensione={18} /><span>In vendita dal {formattaDataOraIt(bundle.inizioVendita)}</span></p>
          )}
          {bundle.stato === 'VENDITA_TERMINATA' && (
            <p className="bundle-nota"><Icona nome="orologio" dimensione={18} /><span>Vendita terminata</span></p>
          )}
        </div>

        {bundle.descrizione?.trim() && (
          <section className="evento-sezione bundle-descrizione" aria-labelledby={`${prefisso}-descrizione`}>
            <div className="evento-sezione-testata"><h2 id={`${prefisso}-descrizione`}>Descrizione</h2></div>
            <p>{bundle.descrizione}</p>
          </section>
        )}
      </div>

      {/* ---------- Pannello di prenotazione ---------- */}
      <aside className="bundle-lato" aria-label="Prenotazione del bundle">
        <div className="prenota-pannello superficie-chiara">
          <h2 className="prenota-titolo">Prenota il bundle</h2>
          <div className="checkout-form">
            {!bundle.acquistabile ? (
              <div className="checkout-passo">
                <p className="avviso avviso-neutro">
                  {bundle.stato === 'PROGRAMMATO' ? `Questo bundle sarà acquistabile dal ${bundle.inizioVendita ? formattaDataOraIt(bundle.inizioVendita) : '…'}.`
                    : bundle.stato === 'VENDITA_TERMINATA' ? 'La vendita di questo bundle è terminata.'
                    : 'Al momento uno o più eventi del bundle non sono disponibili: il bundle non è acquistabile.'}
                </p>
                <p className="checkout-nota">Gli eventi restano acquistabili singolarmente dalle loro pagine.</p>
              </div>
            ) : (
              <>
                <Stepper voci={vociStepper} attivo={passoAttivo} />

                {righeRiepilogo.length > 0 && passo !== 'eventi' && (
                  <div className="riepilogo-card bundle-riepilogo" aria-live="polite">
                    <p className="riepilogo-artista">Il tuo bundle</p>
                    <ul className="bundle-riepilogo-righe">
                      {righeRiepilogo.map(({ evento, opzione }) => (
                        <li key={evento.id}>
                          <span>{evento.artista}{opzione ? ` · ${opzione.fermataCitta}` : ''}</span>
                          <span>{opzione ? formattaEuro(opzione.prezzoEffettivo * passeggeri) : '—'}</span>
                        </li>
                      ))}
                    </ul>
                    {tutteScelte && (
                      <div className="totali">
                        <p className="totali-riga"><span>Totale senza sconto</span><span>{formattaEuro(totaleOriginale)}</span></p>
                        <p className="totali-riga sconto"><span>Sconto bundle ({scontoTesto})</span><span>− {formattaEuro(sconto)}</span></p>
                        <p className="totali-riga totale"><span>Totale</span><span>{formattaEuro(totaleOriginale - sconto)}</span></p>
                        <p className="totali-nota">
                          Per {plurale(passeggeri, 'passeggero', 'passeggeri')}.{!mostraSceltaAcconto && ' Credito e codici sconto si applicano nel carrello.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ---------- Passo: eventi (solo bundle libero) ---------- */}
                {passo === 'eventi' && (
                  <div className="checkout-passo">
                    <h3 ref={titoloPassoRef} tabIndex={-1}>Scegli {testoQuantiEventi}</h3>
                    <fieldset className="bundle-eventi" aria-describedby={errori.eventi ? `${prefisso}-eventi-errore` : `${prefisso}-eventi-conteggio`}>
                      <legend className="sr-only">Eventi del bundle</legend>
                      {bundle.eventi.map((ev) => (
                        <OpzioneEvento key={ev.id} evento={ev} selezionato={selezionati.includes(ev.id)} onToggle={() => toggleEvento(ev.id)} />
                      ))}
                    </fieldset>
                    <p className="checkout-nota" id={`${prefisso}-eventi-conteggio`} aria-live="polite">
                      Eventi selezionati: <b>{selezionati.length}</b>
                    </p>
                    {errori.eventi && <p className="campo-errore" id={`${prefisso}-eventi-errore`} role="alert">{errori.eventi}</p>}
                    <div className="checkout-nav">
                      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={continuaEventi}>Continua</button>
                    </div>
                  </div>
                )}

                {/* ---------- Passo: passeggeri e partenze ---------- */}
                {passo === 'configura' && (
                  <div className="checkout-passo">
                    <h3 ref={titoloPassoRef} tabIndex={-1}>Passeggeri e partenze</h3>
                    {!libero && (
                      <div className="bundle-eventi" role="list" aria-label="Il bundle include">
                        {bundle.eventi.map((ev) => <RigaEventoFisso key={ev.id} evento={ev} />)}
                      </div>
                    )}

                    <div className="campo">
                      <span className="campo-etichetta" id={`${prefisso}-passeggeri`}>Quanti passeggeri?</span>
                      <div className="qty-control" role="group" aria-labelledby={`${prefisso}-passeggeri`}>
                        <button type="button" onClick={() => setPasseggeri((p) => Math.max(bundle.minPosti, p - 1))} aria-label="Togli un passeggero" disabled={passeggeri <= bundle.minPosti}>−</button>
                        <input
                          className="qty-input"
                          type="text"
                          inputMode="numeric"
                          aria-label="Numero di passeggeri"
                          value={passeggeri}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '');
                            setPasseggeri(Math.min(bundle.maxPosti, Math.max(bundle.minPosti, Number(v) || bundle.minPosti)));
                          }}
                          onFocus={(e) => e.target.select()}
                        />
                        <button type="button" onClick={() => setPasseggeri((p) => Math.min(bundle.maxPosti, p + 1))} aria-label="Aggiungi un passeggero" disabled={passeggeri >= bundle.maxPosti}>+</button>
                        <span className="sr-only" aria-live="polite">{plurale(passeggeri, 'passeggero', 'passeggeri')}</span>
                      </div>
                      <p className="campo-aiuto">Lo stesso numero per tutti gli eventi, da {bundle.minPosti} a {bundle.maxPosti}.</p>
                    </div>

                    <div className="bundle-partenze">
                      {righeRiepilogo.map(({ evento: ev }) => {
                        const completo = eventiCompleti[ev.id];
                        const sc = scelte[ev.id] ?? {};
                        const multi = !!completo && completo.servizi.length > 0;
                        const lista = opzioni[chiaveOpzioni(ev.id, sc.servizioId)];
                        const conPosti = lista?.filter((o) => o.postiDisponibili >= passeggeri);
                        const errore = errori[`fermata-${ev.id}`];
                        const idTitolo = `${prefisso}-partenza-${ev.id}`;
                        return (
                          <div key={ev.id} className="bundle-partenza" role="group" aria-labelledby={idTitolo}>
                            <p className="bundle-partenza-titolo" id={idTitolo}>
                              {ev.artista} <span>· {formattaDataBreve(ev.data)} · {ev.citta}</span>
                            </p>
                            {erroriCaricamento[ev.id] && <p className="campo-errore" role="alert">Non riesco a caricare le partenze di questo evento. Ricarica la pagina.</p>}
                            {!completo && !erroriCaricamento[ev.id] && <p className="checkout-nota">Carico le partenze…</p>}
                            {multi && (
                              <div className="campo">
                                <label className="campo-etichetta" htmlFor={`${idTitolo}-servizio`}>Servizio</label>
                                <select
                                  id={`${idTitolo}-servizio`}
                                  className="campo-input"
                                  value={sc.servizioId ?? ''}
                                  onChange={(e) => { setScelte((p) => ({ ...p, [ev.id]: { servizioId: e.target.value || undefined } })); togliErrore(`fermata-${ev.id}`); }}
                                >
                                  <option value="">Scegli il servizio</option>
                                  {completo!.servizi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                                </select>
                              </div>
                            )}
                            {completo && (!multi || sc.servizioId) && (conPosti ? (
                              conPosti.length > 0 ? (
                                <div className="campo bundle-fermata">
                                  <label className="campo-etichetta" htmlFor={`${idTitolo}-fermata`}>Fermata di partenza</label>
                                  <SelettoreFermata
                                    id={`${idTitolo}-fermata`}
                                    opzioni={conPosti}
                                    valore={sc.fermataId ?? ''}
                                    onSeleziona={(fermataId) => {
                                      setScelte((p) => ({ ...p, [ev.id]: { ...p[ev.id], fermataId } }));
                                      togliErrore(`fermata-${ev.id}`);
                                      const scelta = lista!.find((o) => o.fermataId === fermataId);
                                      if (scelta) { tracciaInizioPrenotazione(scelta.prezzoEffettivo * passeggeri); tracciaInizioCheckoutGA4(scelta.prezzoEffettivo * passeggeri, bundle.nome); }
                                    }}
                                    testoOpzione={(o) => `${o.fermataCitta} (${o.fermataOrario || 'orario da definire'}) — ${formattaEuro(o.prezzoEffettivo)}`}
                                  />
                                </div>
                              ) : (
                                <p className="avviso avviso-attenzione">Nessuna fermata ha {plurale(passeggeri, 'posto libero', 'posti liberi')} per questo evento: prova con meno passeggeri.</p>
                              )
                            ) : <p className="checkout-nota">Carico le partenze…</p>)}
                            {errore && <p className="campo-errore" role="alert">{errore}</p>}
                          </div>
                        );
                      })}
                    </div>

                    <div className="checkout-nav">
                      {libero && <button type="button" className="btn btn-tertiary" onClick={() => { setErrori({}); setPasso('eventi'); }}>Indietro</button>}
                      <button type="button" className="btn btn-primary btn-lg" onClick={continuaConfigura}>Continua</button>
                    </div>
                  </div>
                )}

                {/* ---------- Passo: i tuoi dati ---------- */}
                {passo === 'dati' && (
                  <form className="checkout-passo" noValidate onSubmit={conferma}>
                    <h3 ref={titoloPassoRef} tabIndex={-1}>I tuoi dati</h3>
                    {!loggato && (
                      <p className="campo-aiuto checkout-accedi">
                        Hai già un account? <a href={`/accedi?dopo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Accedi</a>
                      </p>
                    )}

                    <CampoTesto
                      id={`${prefisso}-email`} etichetta="Email" type="email" autoComplete="email" inputMode="email" required
                      value={cliente.email} onChange={(e) => { setCliente({ ...cliente, email: e.target.value }); togliErrore('email'); }} onBlur={() => validaCampo('email')}
                      disabled={loggato && !!cliente.email} aiuto={loggato ? 'Dal tuo account' : 'Qui arrivano conferma e biglietti'} errore={errori.email}
                    />
                    <CampoTesto
                      id={`${prefisso}-telefono`} etichetta="Telefono" type="tel" autoComplete="tel" inputMode="tel" required
                      value={cliente.telefono} onChange={(e) => { setCliente({ ...cliente, telefono: e.target.value }); togliErrore('telefono'); }} onBlur={() => validaCampo('telefono')}
                      aiuto="Per avvisarti il giorno del viaggio" errore={errori.telefono}
                    />
                    {/* Solo da ospite, come nel checkout evento: la data di
                        nascita serve a comporre i gruppi sul bus e il
                        carrello non accetta l'ordine senza. */}
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
                          value={cliente.nome} onChange={(e) => { setCliente({ ...cliente, nome: e.target.value }); togliErrore('nome'); }} onBlur={() => validaCampo('nome')} errore={errori.nome}
                        />
                        <CampoTesto
                          id={`${prefisso}-cognome`} etichetta="Cognome" type="text" autoComplete="family-name" required
                          value={cliente.cognome} onChange={(e) => { setCliente({ ...cliente, cognome: e.target.value }); togliErrore('cognome'); }} onBlur={() => validaCampo('cognome')} errore={errori.cognome}
                        />
                      </div>
                    </fieldset>
                    {partecipanti.map((p, i) => (
                      <fieldset key={i} className="passeggero">
                        <legend className="campo-etichetta">Passeggero {i + 2}</legend>
                        <div className="campi-affiancati">
                          <CampoTesto
                            id={`${prefisso}-p${i}-nome`} etichetta="Nome" type="text" required
                            value={p.nome} onChange={(e) => aggiornaPartecipante(i, 'nome', e.target.value)} onBlur={() => validaCampo(`p${i}-nome`)} errore={errori[`p${i}-nome`]}
                          />
                          <CampoTesto
                            id={`${prefisso}-p${i}-cognome`} etichetta="Cognome" type="text" required
                            value={p.cognome} onChange={(e) => aggiornaPartecipante(i, 'cognome', e.target.value)} onBlur={() => validaCampo(`p${i}-cognome`)} errore={errori[`p${i}-cognome`]}
                          />
                        </div>
                      </fieldset>
                    ))}

                    {mostraSceltaAcconto && bundle.ammetteAcconto && (
                      <fieldset className="opzioni-radio">
                        <legend>Come vuoi pagare?</legend>
                        <label className={`opzione-radio${tipoPagamento === 'COMPLETO' ? ' selezionata' : ''}`}>
                          <input type="radio" name={`${prefisso}-pagamento`} value="COMPLETO" checked={tipoPagamento === 'COMPLETO'} onChange={() => setTipoPagamento('COMPLETO')} />
                          <b>Tutto subito</b>
                        </label>
                        <label className={`opzione-radio${tipoPagamento === 'ACCONTO' ? ' selezionata' : ''}`}>
                          <input type="radio" name={`${prefisso}-pagamento`} value="ACCONTO" checked={tipoPagamento === 'ACCONTO'} onChange={() => setTipoPagamento('ACCONTO')} />
                          <b>Solo l'acconto</b>
                          <span>Il resto prima della partenza</span>
                        </label>
                      </fieldset>
                    )}

                    {erroreInvio && <p className="campo-errore" role="alert">{erroreInvio}</p>}
                    <div className="checkout-nav">
                      <button type="button" className="btn btn-tertiary" onClick={() => { setErrori({}); setPasso('configura'); }}>Indietro</button>
                      <button type="submit" className="btn btn-primary btn-lg" disabled={inviando}>{inviando ? 'Un momento…' : testoConferma}</button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Miniatura dell'evento (foto o iniziali), 56×56. */
function MiniaturaEvento({ evento }: { evento: EventoDelBundle }) {
  return (
    <span className="bundle-evento-media" aria-hidden="true">
      {evento.immagineUrl
        ? <img src={evento.immagineUrl} alt="" width={56} height={56} loading="lazy" decoding="async" />
        : <span className="card-segnaposto">{inizialiDi(evento.artista)}</span>}
    </span>
  );
}

function TestoEvento({ evento }: { evento: EventoDelBundle }) {
  return (
    <span className="bundle-evento-testo">
      <b>{evento.artista}</b>
      <span>{formattaDataBreve(evento.data)} · {evento.luogo}, {evento.citta}</span>
      {!evento.vendibile && <span className="bundle-evento-stato">Non disponibile</span>}
    </span>
  );
}

/** Card selezionabile (bundle libero): <label> con checkbox visibile. */
function OpzioneEvento({ evento, selezionato, onToggle }: { evento: EventoDelBundle; selezionato: boolean; onToggle: () => void }) {
  const disponibile = evento.vendibile;
  return (
    <label className={`bundle-evento${selezionato ? ' selezionato' : ''}${disponibile ? '' : ' non-disponibile'}`}>
      <span className="bundle-evento-check">
        <input type="checkbox" checked={selezionato} disabled={!disponibile && !selezionato} onChange={onToggle} />
      </span>
      <MiniaturaEvento evento={evento} />
      <TestoEvento evento={evento} />
    </label>
  );
}

/** Riga non interattiva (bundle fisso): gli eventi inclusi. */
function RigaEventoFisso({ evento }: { evento: EventoDelBundle }) {
  return (
    <div className={`bundle-evento fisso${evento.vendibile ? '' : ' non-disponibile'}`} role="listitem">
      <MiniaturaEvento evento={evento} />
      <TestoEvento evento={evento} />
    </div>
  );
}
