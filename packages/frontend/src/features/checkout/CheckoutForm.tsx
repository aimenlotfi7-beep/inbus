import { useEffect, useState } from 'react';
import type { Evento, OpzionePartenza, Prodotto } from '../../api/types';
import { eventiApi } from '../../api/eventi';
import { prenotazioniApi } from '../../api/prenotazioni';
import { listaAttesaApi } from '../../api/listaAttesa';
import { applicaScontoOfferta } from '../../api/prezzi';
import { ErroreApi } from '../../api/client';
import { clienteAuthApi } from '../../api/clienteAuth';
import { clienteLoggato, logoutCliente } from '../../features/clienteSessione';
import { SelettoreFermata } from './SelettoreFermata';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'confermato-attesa' | 'errore';
interface Partecipante { nome: string; cognome: string; }

/** Se il cliente arriva da un link con offerta dedicata (/offerta/:slug),
 *  lo sconto percentuale si applica al prezzo normale di qualunque
 *  fermata scelga — non è un prezzo fisso, dato che il prezzo varia già
 *  per fermata. */
export interface OffertaCheckout { id: string; nome: string; scontoPercentuale: number; }

/**
 * Modulo di prenotazione a step (come la creazione evento nel
 * gestionale): 1) fermata+passeggeri, 2) dati richiedente e
 * partecipanti, 3) pagamento — usato sia dentro il popup della home
 * (CheckoutModal) sia direttamente nella pagina dedicata dell'evento.
 */
export function CheckoutForm({ evento, offerta, onChiudi }: { evento: Evento; offerta?: OffertaCheckout; onChiudi?: () => void }) {
  const [stato, setStato] = useState<Stato>('caricamento');
  // Quale pulsante specifico è stato premuto — 'invio' da solo non basta,
  // altrimenti "Acquista" e "Prenota" si accenderebbero insieme (era
  // proprio questo il bug: entrambi mostravano "Invio..." a prescindere
  // da quale avesse premuto davvero il cliente).
  const [azioneInCorso, setAzioneInCorso] = useState<'acquista' | 'prenota' | 'lista-attesa' | null>(null);
  // Se l'evento ha più di un viaggio, prima bisogna sceglierne uno —
  // diventa a tutti gli effetti un quarto step, prima degli altri tre.
  // Con zero o un solo viaggio, si passa dritti come sempre.
  const multiViaggio = evento.prodotti.length >= 2;
  const [viaggioScelto, setViaggioScelto] = useState<Prodotto | null>(multiViaggio ? null : (evento.prodotti[0] ?? null));
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [opzioni, setOpzioni] = useState<OpzionePartenza[]>([]);
  const [fermataId, setFermataId] = useState('');
  const [passeggeri, setPasseggeri] = useState(1);

  // Modulo richiedente — si autocompila se l'email corrisponde a una
  // prenotazione precedente, ma resta sempre modificabile.
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [creditoDisponibile, setCreditoDisponibile] = useState(0);
  const [usaCredito, setUsaCredito] = useState(false);
  const [couponCodice, setCouponCodice] = useState('');
  const [couponVerificato, setCouponVerificato] = useState<{ sconto: number; tipo: 'PERCENTUALE' | 'FISSO'; valore: string } | null>(null);
  const [couponErrore, setCouponErrore] = useState('');
  const [verificandoCoupon, setVerificandoCoupon] = useState(false);

  // Un modulo nome+cognome per ogni passeggero OLTRE al richiedente.
  const [partecipanti, setPartecipanti] = useState<Partecipante[]>([]);

  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [pnrConfermato, setPnrConfermato] = useState('');
  // Solo interfaccia per ora — non c'è ancora un vero gateway di
  // pagamento collegato (serve un fornitore tipo Stripe). I campi carta
  // non vengono validati né inviati da nessuna parte.
  const [metodoPagamento, setMetodoPagamento] = useState<'carta' | 'apple' | 'google'>('carta');

  useEffect(() => {
    // Se serve ancora scegliere il viaggio, non c'è ancora nulla da
    // caricare — si aspetta la scelta.
    if (multiViaggio && !viaggioScelto) { setStato('pronto'); return; }
    setStato('caricamento');
    eventiApi.opzioniPartenza(evento.id, viaggioScelto?.id).then((o) => {
      setOpzioni(o);
      const primaConPosti = o.find((x) => x.postiDisponibili > 0);
      setFermataId((primaConPosti ?? o[0])?.fermataId ?? '');
      setStato('pronto');
    });
  }, [evento.id, viaggioScelto?.id, multiViaggio]);

  useEffect(() => {
    setPartecipanti((prev) => {
      const necessari = Math.max(0, passeggeri - 1);
      if (prev.length === necessari) return prev;
      if (prev.length < necessari) return [...prev, ...Array(necessari - prev.length).fill(null).map(() => ({ nome: '', cognome: '' }))];
      return prev.slice(0, necessari);
    });
  }, [passeggeri]);

  // Non c'è più bisogno di "indovinare" i dati digitando l'email: se il
  // cliente è già loggato (obbligatorio per prenotare), li prendiamo
  // direttamente dal suo account vero.
  useEffect(() => {
    if (!clienteLoggato()) return;
    clienteAuthApi.me().then((dati) => {
      setEmail(dati.email);
      if (dati.nome) setNome(dati.nome);
      if (dati.cognome) setCognome(dati.cognome);
      if (dati.telefono) setTelefono(dati.telefono);
      setCreditoDisponibile(Number(dati.creditoDisponibile));
    }).catch(() => {
      // Il token non è più valido — lo togliamo, il modulo mostrerà
      // l'invito ad accedere di nuovo.
      logoutCliente();
    });
  }, []);

  function aggiornaPartecipante(idx: number, campo: keyof Partecipante, valore: string) {
    setPartecipanti((prev) => prev.map((p, i) => i === idx ? { ...p, [campo]: valore } : p));
  }

  const opzioneScelta = opzioni.find((o) => o.fermataId === fermataId);
  // Con i limiti per fermata, una singola fermata può esaurirsi da sola
  // anche se il resto del bus ha ancora posti — vanno distinti i due casi
  // per mostrare il messaggio giusto e proporre la lista d'attesa solo
  // quando serve davvero.
  const tutteEsaurite = opzioni.length === 0 || opzioni.every((o) => o.postiDisponibili === 0);
  const fermataEsaurita = !opzioneScelta || opzioneScelta.postiDisponibili === 0;
  const prezzoUnitario = opzioneScelta
    ? (offerta ? applicaScontoOfferta(opzioneScelta.prezzoEffettivo, offerta.scontoPercentuale) : opzioneScelta.prezzoEffettivo)
    : 0;
  const totale = opzioneScelta ? prezzoUnitario * passeggeri : 0;
  // Il credito si applica solo all'acquisto completo (non all'acconto),
  // mai oltre il totale — coerente con la stessa regola applicata dal
  // server (che comunque la ricontrolla per conto suo, non ci si fida
  // di questo calcolo lato cliente per l'importo vero addebitato).
  const creditoApplicato = usaCredito ? Math.min(creditoDisponibile, totale) : 0;
  const totaleConCredito = totale - creditoApplicato;
  const moduloRichiedenteCompleto = Boolean(email && nome && cognome && telefono);
  const partecipantiCompleti = partecipanti.every((p) => p.nome.trim() && p.cognome.trim());

  async function verificaCoupon() {
    if (!couponCodice.trim() || !opzioneScelta) return;
    setVerificandoCoupon(true);
    setCouponErrore('');
    setCouponVerificato(null);
    try {
      const r = await fetch(`${API_URL}/api/coupon/valida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice: couponCodice.trim(), importo: totale, eventoId: evento.id }),
      });
      const dati = await r.json();
      if (!r.ok) throw new Error(dati.errore ?? 'Coupon non valido.');
      setCouponVerificato(dati);
    } catch (e) {
      setCouponErrore(e instanceof Error ? e.message : 'Coupon non valido.');
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
      const promoterCodice = new URLSearchParams(window.location.search).get('promo') || undefined;
      const parametriUrl = new URLSearchParams(window.location.search);
      const utmSource = parametriUrl.get('utm_source') || undefined;
      const utmMedium = parametriUrl.get('utm_medium') || undefined;
      const utmCampaign = parametriUrl.get('utm_campaign') || undefined;
      const utmContent = parametriUrl.get('utm_content') || undefined;
      const prenotazione = await prenotazioniApi.crea({
        eventoId: evento.id,
        lineaId: opzioneScelta.lineaId,
        fermataId: opzioneScelta.fermataId,
        passeggeri,
        tipoPagamento,
        metodoPagamento: 'CARTA',
        cliente: { email, nome, cognome, telefono },
        partecipanti,
        ...(promoterCodice && { promoterCodice }),
        ...(offerta && { offertaId: offerta.id }),
        ...(usaCredito && tipoPagamento === 'COMPLETO' && { usaCredito: true }),
        ...(couponVerificato && tipoPagamento === 'COMPLETO' && { couponCodice: couponCodice.trim() }),
        ...(utmSource && { utmSource }),
        ...(utmMedium && { utmMedium }),
        ...(utmCampaign && { utmCampaign }),
        ...(utmContent && { utmContent }),
      });
      setPnrConfermato(prenotazione.pnr);
      setStato('confermato');
    } catch (e) {
      setMessaggioErrore(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
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
        lineaId: opzioneScelta?.lineaId,
        fermataId: opzioneScelta?.fermataId,
        passeggeri,
        cliente: { email, nome, cognome, telefono },
        partecipanti,
      });
      setStato('confermato-attesa');
    } catch (e) {
      setMessaggioErrore(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
      setStato('errore');
      setAzioneInCorso(null);
    }
  }

  if (stato === 'confermato') {
    return (
      <div className="checkout-form">
        <h3>Prenotazione confermata 🎉</h3>
        <div className="checkout-summary">Il tuo PNR è <b>{pnrConfermato}</b>. I biglietti arriveranno all'email <b>{email}</b>.</div>
        {onChiudi && <button className="search-cta" onClick={onChiudi}>Chiudi</button>}
      </div>
    );
  }

  if (stato === 'confermato-attesa') {
    return (
      <div className="checkout-form">
        <h3>Sei in lista d'attesa 📩</h3>
        <div className="checkout-summary">
          Ti scriveremo a <b>{email}</b> appena si libera un posto per <b>{evento.artista}</b>, con un link per
          completare subito la prenotazione.
        </div>
        {onChiudi && <button className="search-cta" onClick={onChiudi}>Chiudi</button>}
      </div>
    );
  }

  return (
    <div className="checkout-form">
      <h3>Prenota</h3>

      {offerta && (
        <p style={{ background: '#e8f7ea', border: '1px solid #b6e3bb', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
          🎉 Offerta "{offerta.nome}": -{offerta.scontoPercentuale.toFixed(0)}% su tutte le fermate.
        </p>
      )}

      {stato === 'caricamento' && <p>Carico le fermate disponibili...</p>}

      {stato !== 'caricamento' && (
        <>
          <div className="checkout-stepper">
            {(multiViaggio
              ? [{ numero: 0, label: 'Il tuo viaggio' }, { numero: 1, label: 'Fermata e passeggeri' }, { numero: 2, label: 'I tuoi dati' }, { numero: 3, label: 'Pagamento' }]
              : [{ numero: 1, label: 'Fermata e passeggeri' }, { numero: 2, label: 'I tuoi dati' }, { numero: 3, label: 'Pagamento' }]
            ).map((s) => {
              const stepAttuale = multiViaggio ? (viaggioScelto ? step : 0) : step;
              return (
                <div key={s.numero} className={`checkout-step-dot${stepAttuale === s.numero ? ' active' : stepAttuale > s.numero ? ' completato' : ''}`}>
                  <span>{stepAttuale > s.numero ? '✓' : s.numero + (multiViaggio ? 1 : 0)}</span> {s.label}
                </div>
              );
            })}
          </div>

          {/* Riepilogo sempre visibile, in ogni step — evento, data,
              fermata (appena scelta), passeggeri, totale via via che si
              conosce: il cliente non deve mai perdere di vista cosa sta
              per comprare. */}
          <div className="checkout-riepilogo-persistente">
            <div>
              <b>{evento.artista}</b>
              <span className="checkout-riepilogo-riga">
                {new Date(evento.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                {viaggioScelto && ` · ${viaggioScelto.nome}`}
                {(viaggioScelto?.arrivoOrario ?? (!multiViaggio ? evento.prodotti[0]?.arrivoOrario : null)) && (
                  <> · arrivo {viaggioScelto?.arrivoOrario ?? evento.prodotti[0]?.arrivoOrario}</>
                )}
                {opzioneScelta && ` · ${opzioneScelta.fermataCitta} → ${evento.citta}`}
                {viaggioScelto || !multiViaggio ? ` · ${passeggeri} passegger${passeggeri > 1 ? 'i' : 'o'}` : ''}
              </span>
            </div>
            {opzioneScelta && <div className="checkout-riepilogo-totale">€{(step === 3 ? totaleConCredito : totale).toFixed(2)}</div>}
          </div>

          {multiViaggio && !viaggioScelto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13.5, opacity: .75, marginTop: -6 }}>Questo evento ha più opzioni di viaggio — scegli quella che preferisci.</p>
              {evento.prodotti.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="checkout-viaggio-card"
                  onClick={() => setViaggioScelto(v)}
                >
                  <b>{v.nome}</b>
                  {v.arrivoOrario && <span>Arrivo previsto alle {v.arrivoOrario}</span>}
                </button>
              ))}
            </div>
          )}

          {(!multiViaggio || viaggioScelto) && (
          <>
          {step === 1 && (
            <>
              {multiViaggio && (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 12, padding: '5px 10px' }} onClick={() => setViaggioScelto(null)}>
                  ← Cambia viaggio
                </button>
              )}
              {tutteEsaurite && (
                <p style={{ background: '#fff4e0', border: '1px solid #f0d9a8', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
                  Al momento non ci sono posti disponibili. Puoi comunque compilare i tuoi dati e iscriverti alla
                  lista d'attesa: ti avviseremo via email non appena si libera un posto.
                </p>
              )}
              {!tutteEsaurite && fermataEsaurita && (
                <p style={{ background: '#fff4e0', border: '1px solid #f0d9a8', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
                  I posti da questa fermata sono esauriti. Scegli un'altra fermata, oppure iscriviti alla lista
                  d'attesa apposta per questa: ti avviseremo se si libera un posto qui.
                </p>
              )}

              <label className="field-label">Fermata di partenza</label>
              <SelettoreFermata
                opzioni={opzioni}
                valore={fermataId}
                onSeleziona={setFermataId}
                testoOpzione={(o) => {
                  const prezzoMostrato = offerta ? applicaScontoOfferta(o.prezzoEffettivo, offerta.scontoPercentuale) : o.prezzoEffettivo;
                  return `${o.fermataCitta} (${o.fermataOrario || 'orario da definire'}) — €${prezzoMostrato.toFixed(2)}`
                    + (offerta ? ` (invece di €${o.prezzoEffettivo.toFixed(2)})` : '')
                    + (o.postiDisponibili === 0 ? ' — ESAURITO, lista d\'attesa' : '');
                }}
              />

              <label className="field-label">Passeggeri</label>
              <div className="qty-control">
                <button type="button" onClick={() => setPasseggeri((p) => Math.max(1, p - 1))} aria-label="Togli passeggero">−</button>
                <input
                  type="text"
                  inputMode="numeric"
                  style={{ width: 40, textAlign: 'center' }}
                  value={passeggeri}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v === '') { setPasseggeri(1); return; }
                    setPasseggeri(Math.min(20, Math.max(1, Number(v))));
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" onClick={() => setPasseggeri((p) => Math.min(20, p + 1))} aria-label="Aggiungi passeggero">+</button>
              </div>

              <div className="checkout-step-nav">
                <span />
                <button className="search-cta" style={{ width: 'auto', margin: 0, padding: '12px 28px', opacity: opzioneScelta ? 1 : .5 }} disabled={!opzioneScelta} onClick={() => setStep(2)}>
                  Avanti →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {!clienteLoggato() ? (
                <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                  <p className="field-label" style={{ marginBottom: 10 }}>Serve un account per prenotare</p>
                  <p style={{ fontSize: 13, opacity: .75, marginBottom: 18 }}>
                    Ti serve solo un minuto — dopo aver effettuato l'accesso, tornerai qui a completare la
                    prenotazione con la fermata e i passeggeri già scelti.
                  </p>
                  <a href={`/accedi?dopo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="search-cta" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', marginBottom: 10 }}>
                    Accedi
                  </a>
                  <a href={`/registrati?dopo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="search-cta-secondaria" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
                    Registrati
                  </a>
                </div>
              ) : (
                <>
                  <p className="field-label" style={{ marginBottom: 6 }}>I tuoi dati (richiedente)</p>
                  <p style={{ fontSize: 12, opacity: .7, marginTop: -4, marginBottom: 8 }}>Presi dal tuo account.</p>
                  <label className="field-label">Email</label>
                  <input type="email" value={email} disabled style={{ opacity: .6 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="field-label">Nome</label>
                      <input type="text" autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Cognome</label>
                      <input type="text" autoComplete="family-name" value={cognome} onChange={(e) => setCognome(e.target.value)} />
                    </div>
                  </div>
                  <label className="field-label">Telefono</label>
                  <input type="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />

                  {partecipanti.length > 0 && (
                    <>
                      <p className="field-label" style={{ marginTop: 18, marginBottom: 6 }}>Altri passeggeri</p>
                      {partecipanti.map((p, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                          <input placeholder={`Nome passeggero ${idx + 2}`} value={p.nome} onChange={(e) => aggiornaPartecipante(idx, 'nome', e.target.value)} />
                          <input placeholder="Cognome" value={p.cognome} onChange={(e) => aggiornaPartecipante(idx, 'cognome', e.target.value)} />
                        </div>
                      ))}
                    </>
                  )}

                  <div className="checkout-step-nav">
                    <button className="search-cta-secondaria" style={{ width: 'auto', margin: 0, padding: '12px 24px' }} onClick={() => setStep(1)}>← Indietro</button>
                    <button
                      className="search-cta"
                      style={{ width: 'auto', margin: 0, padding: '12px 28px', opacity: (moduloRichiedenteCompleto && partecipantiCompleti) ? 1 : .5 }}
                      disabled={!moduloRichiedenteCompleto || !partecipantiCompleti}
                      onClick={() => setStep(3)}
                    >
                      Avanti →
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

              {fermataEsaurita ? (
                <>
                  <p style={{ fontSize: 13.5, marginBottom: 14 }}>
                    Confermi l'iscrizione alla lista d'attesa per <b>{passeggeri}</b> passeggero/i su "{evento.artista}"{opzioneScelta ? ` da ${opzioneScelta.fermataCitta}` : ''}?
                  </p>
                  <button
                    className="search-cta"
                    style={{ opacity: stato === 'invio' ? .5 : 1 }}
                    disabled={stato === 'invio'}
                    onClick={iscrivitiListaAttesa}
                  >
                    {azioneInCorso === 'lista-attesa' ? 'Invio...' : "Iscriviti alla lista d'attesa"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ background: '#faf7f0', border: '1px solid #e5ded0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{evento.artista}</p>
                    <p style={{ margin: 0, opacity: .75 }}>
                      {opzioneScelta?.fermataCitta}{opzioneScelta?.fermataOrario ? ` — ore ${opzioneScelta.fermataOrario}` : ''} · {passeggeri} passeggero{passeggeri > 1 ? 'i' : ''}
                    </p>
                  </div>

                  <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '0 0 6px' }}>
                    {creditoApplicato > 0 ? (
                      <>
                        <span style={{ textDecoration: 'line-through', opacity: .5, fontSize: 16, marginRight: 8 }}>€{totale.toFixed(2)}</span>
                        €{totaleConCredito.toFixed(2)}
                      </>
                    ) : (
                      <>€{totale.toFixed(2)}</>
                    )}
                  </p>
                  <p style={{ fontSize: 12, opacity: .7, marginTop: -4 }}>I biglietti arriveranno via email al richiedente.</p>

                  {creditoDisponibile > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '10px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={usaCredito} onChange={(e) => setUsaCredito(e.target.checked)} style={{ width: 'auto' }} />
                      Usa il tuo credito fedeltà (€{creditoDisponibile.toFixed(2)} disponibili)
                    </label>
                  )}

                  <div style={{ margin: '10px 0' }}>
                    <label className="field-label">Hai un codice coupon?</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={couponCodice}
                        onChange={(e) => { setCouponCodice(e.target.value.toUpperCase()); setCouponVerificato(null); setCouponErrore(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), verificaCoupon())}
                        placeholder="Facoltativo"
                        style={{ textTransform: 'uppercase', flex: 1 }}
                        disabled={!!couponVerificato}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={verificaCoupon}
                        disabled={!couponCodice.trim() || verificandoCoupon || !!couponVerificato}
                      >
                        {verificandoCoupon ? '...' : couponVerificato ? '✓ Applicato' : 'Applica'}
                      </button>
                    </div>
                    {couponErrore && <p style={{ color: '#c0392b', fontSize: 12, marginTop: 6 }}>{couponErrore}</p>}
                    {couponVerificato && (
                      <p style={{ fontSize: 13, marginTop: 6 }}>
                        Sconto: <b>-€{couponVerificato.sconto.toFixed(2)}</b> — nuovo totale (pagando tutto subito): <b>€{Math.max(0, totale - couponVerificato.sconto).toFixed(2)}</b>
                      </p>
                    )}
                    <p style={{ fontSize: 11.5, opacity: .65, marginTop: 6 }}>
                      Il coupon si applica solo pagando tutto subito ("Acquista"). Se prenoti con acconto, potrai
                      usarlo quando salderai il resto.
                    </p>
                  </div>

                  <p className="section-label" style={{ marginTop: 18 }}>Metodo di pagamento</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button type="button" className={`mini-tab${metodoPagamento === 'carta' ? ' active' : ''}`} onClick={() => setMetodoPagamento('carta')}>💳 Carta</button>
                    <button type="button" className={`mini-tab${metodoPagamento === 'apple' ? ' active' : ''}`} onClick={() => setMetodoPagamento('apple')}> Apple Pay</button>
                    <button type="button" className={`mini-tab${metodoPagamento === 'google' ? ' active' : ''}`} onClick={() => setMetodoPagamento('google')}>G Pay</button>
                  </div>

                  {metodoPagamento === 'carta' && (
                    <div style={{ marginBottom: 14 }}>
                      <label className="field-label">Numero carta</label>
                      <input type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" autoComplete="cc-number" />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                        <div>
                          <label className="field-label">Scadenza</label>
                          <input type="text" placeholder="MM/AA" autoComplete="cc-exp" />
                        </div>
                        <div>
                          <label className="field-label">CVV</label>
                          <input type="text" inputMode="numeric" placeholder="123" autoComplete="cc-csc" />
                        </div>
                      </div>
                    </div>
                  )}
                  {metodoPagamento !== 'carta' && (
                    <p style={{ fontSize: 13, opacity: .7, marginBottom: 14 }}>
                      Al momento di completare l'ordine ti verrà mostrata la richiesta di conferma di {metodoPagamento === 'apple' ? 'Apple Pay' : 'Google Pay'}.
                    </p>
                  )}

                  <button
                    className="search-cta"
                    style={{ marginTop: 10, opacity: stato === 'invio' ? .5 : 1 }}
                    disabled={stato === 'invio'}
                    onClick={() => confermaPrenotazione('COMPLETO')}
                  >
                    {azioneInCorso === 'acquista' ? 'Invio...' : 'Acquista'}
                  </button>

                  <button
                    className="search-cta-secondaria"
                    style={{ opacity: stato === 'invio' ? .5 : 1 }}
                    disabled={stato === 'invio'}
                    onClick={() => confermaPrenotazione('ACCONTO')}
                  >
                    {azioneInCorso === 'prenota' ? 'Invio...' : 'Prenota'}
                  </button>
                  <p style={{ fontSize: 11, opacity: .65, marginTop: 6, textAlign: 'center' }}>
                    Con "Prenota" versi un acconto di €{Number(evento.accontoEur ?? 10).toFixed(2)} a passeggero
                    ({(Number(evento.accontoEur ?? 10) * passeggeri).toFixed(2)}€ totali ora) e salderai il resto entro
                    15 giorni prima della partenza.
                  </p>
                  <p style={{ fontSize: 11, opacity: .6, marginTop: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    🔒 I tuoi dati sono trattati in modo riservato, secondo la nostra informativa privacy.
                  </p>
                </>
              )}

              <div className="checkout-step-nav">
                <button className="search-cta-secondaria" style={{ width: 'auto', margin: 0, padding: '12px 24px' }} onClick={() => setStep(2)}>← Indietro</button>
                <span />
              </div>
            </>
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}
