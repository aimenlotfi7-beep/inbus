import { useEffect, useState } from 'react';
import type { Evento, OpzionePartenza } from '../../api/types';
import { eventiApi } from '../../api/eventi';
import { prenotazioniApi } from '../../api/prenotazioni';
import { listaAttesaApi } from '../../api/listaAttesa';
import { utentiApi } from '../../api/utenti';
import { ErroreApi } from '../../api/client';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'confermato-attesa' | 'errore';
interface Partecipante { nome: string; cognome: string; }

/** Se il cliente arriva da un link con offerta dedicata (/offerta/:slug),
 *  lo sconto percentuale si applica al prezzo normale di qualunque
 *  fermata scelga — non è un prezzo fisso, dato che il prezzo varia già
 *  per fermata. */
export interface OffertaCheckout { id: string; nome: string; scontoPercentuale: number; }

const STEP = [
  { numero: 1, label: 'Fermata e passeggeri' },
  { numero: 2, label: 'I tuoi dati' },
  { numero: 3, label: 'Pagamento' },
] as const;

/**
 * Modulo di prenotazione a step (come la creazione evento nel
 * gestionale): 1) fermata+passeggeri, 2) dati richiedente e
 * partecipanti, 3) pagamento — usato sia dentro il popup della home
 * (CheckoutModal) sia direttamente nella pagina dedicata dell'evento.
 */
export function CheckoutForm({ evento, offerta, onChiudi }: { evento: Evento; offerta?: OffertaCheckout; onChiudi?: () => void }) {
  const [stato, setStato] = useState<Stato>('caricamento');
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
  const [autocompilato, setAutocompilato] = useState(false);

  // Un modulo nome+cognome per ogni passeggero OLTRE al richiedente.
  const [partecipanti, setPartecipanti] = useState<Partecipante[]>([]);

  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [pnrConfermato, setPnrConfermato] = useState('');

  useEffect(() => {
    eventiApi.opzioniPartenza(evento.id).then((o) => {
      setOpzioni(o);
      const primaConPosti = o.find((x) => x.postiDisponibili > 0);
      setFermataId((primaConPosti ?? o[0])?.fermataId ?? '');
      setStato('pronto');
    });
  }, [evento.id]);

  useEffect(() => {
    setPartecipanti((prev) => {
      const necessari = Math.max(0, passeggeri - 1);
      if (prev.length === necessari) return prev;
      if (prev.length < necessari) return [...prev, ...Array(necessari - prev.length).fill(null).map(() => ({ nome: '', cognome: '' }))];
      return prev.slice(0, necessari);
    });
  }, [passeggeri]);

  async function emailCambiata(v: string) {
    setEmail(v);
    if (!v.includes('@')) return;
    try {
      const dati = await utentiApi.datiPerCheckout(v);
      if (dati) {
        if (dati.nome) setNome(dati.nome);
        if (dati.cognome) setCognome(dati.cognome);
        if (dati.telefono) setTelefono(dati.telefono);
        setAutocompilato(true);
      }
    } catch {
      // Preriempimento facoltativo: se fallisce, il cliente compila a mano.
    }
  }

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
    ? (offerta ? opzioneScelta.prezzoEffettivo * (1 - offerta.scontoPercentuale / 100) : opzioneScelta.prezzoEffettivo)
    : 0;
  const totale = opzioneScelta ? prezzoUnitario * passeggeri : 0;
  const moduloRichiedenteCompleto = Boolean(email && nome && cognome && telefono);
  const partecipantiCompleti = partecipanti.every((p) => p.nome.trim() && p.cognome.trim());

  async function confermaPrenotazione(tipoPagamento: 'COMPLETO' | 'ACCONTO') {
    if (!opzioneScelta) return;
    setStato('invio');
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
    }
  }

  async function iscrivitiListaAttesa() {
    setStato('invio');
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
            {STEP.map((s) => (
              <div key={s.numero} className={`checkout-step-dot${step === s.numero ? ' active' : step > s.numero ? ' completato' : ''}`}>
                <span>{step > s.numero ? '✓' : s.numero}</span> {s.label}
              </div>
            ))}
          </div>

          {step === 1 && (
            <>
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
              <select value={fermataId} onChange={(e) => setFermataId(e.target.value)}>
                {opzioni.map((o) => {
                  const prezzoMostrato = offerta ? o.prezzoEffettivo * (1 - offerta.scontoPercentuale / 100) : o.prezzoEffettivo;
                  return (
                    <option key={o.fermataId} value={o.fermataId}>
                      {o.fermataCitta} ({o.fermataOrario || 'orario da definire'}) — €{prezzoMostrato.toFixed(2)}
                      {offerta ? ` (invece di €${o.prezzoEffettivo.toFixed(2)})` : ''}
                      {o.postiDisponibili === 0 ? ' — ESAURITO, lista d\'attesa' : ''}
                    </option>
                  );
                })}
              </select>

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
              <p className="field-label" style={{ marginBottom: 6 }}>I tuoi dati (richiedente)</p>
              {autocompilato && <p style={{ fontSize: 12, opacity: .7, marginTop: -4, marginBottom: 8 }}>Precompilato dai tuoi dati — puoi modificarlo.</p>}
              <label className="field-label">Email</label>
              <input type="email" value={email} onChange={(e) => emailCambiata(e.target.value)} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="field-label">Nome</label>
                  <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Cognome</label>
                  <input type="text" value={cognome} onChange={(e) => setCognome(e.target.value)} />
                </div>
              </div>
              <label className="field-label">Telefono</label>
              <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />

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
                    {stato === 'invio' ? 'Invio...' : "Iscriviti alla lista d'attesa"}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '0 0 6px' }}>€{totale.toFixed(2)}</p>
                  <p style={{ fontSize: 12, opacity: .7, marginTop: -4 }}>I biglietti arriveranno via email al richiedente.</p>

                  <button
                    className="search-cta"
                    style={{ marginTop: 10, opacity: stato === 'invio' ? .5 : 1 }}
                    disabled={stato === 'invio'}
                    onClick={() => confermaPrenotazione('COMPLETO')}
                  >
                    {stato === 'invio' ? 'Invio...' : 'Acquista'}
                  </button>

                  <button
                    className="search-cta-secondaria"
                    style={{ opacity: stato === 'invio' ? .5 : 1 }}
                    disabled={stato === 'invio'}
                    onClick={() => confermaPrenotazione('ACCONTO')}
                  >
                    {stato === 'invio' ? 'Invio...' : 'Prenota'}
                  </button>
                  <p style={{ fontSize: 11, opacity: .65, marginTop: 6, textAlign: 'center' }}>
                    Con "Prenota" versi un acconto di €{Number(evento.accontoEur ?? 10).toFixed(2)} a passeggero
                    ({(Number(evento.accontoEur ?? 10) * passeggeri).toFixed(2)}€ totali ora) e salderai il resto entro
                    15 giorni prima della partenza.
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
    </div>
  );
}
