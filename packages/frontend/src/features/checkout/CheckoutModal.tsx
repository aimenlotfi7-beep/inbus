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

export function CheckoutModal({ evento, offerta, onClose }: { evento: Evento; offerta?: OffertaCheckout; onClose: () => void }) {
  const [stato, setStato] = useState<Stato>('caricamento');
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
      // Preseleziona la prima fermata con posti, se ce n'è una — altrimenti
      // la prima in assoluto (serve comunque per la lista d'attesa, come
      // preferenza).
      const primaConPosti = o.find((x) => x.postiDisponibili > 0);
      setFermataId((primaConPosti ?? o[0])?.fermataId ?? '');
      setStato('pronto');
    });
  }, [evento.id]);

  // Tanti moduli partecipante quanti sono i passeggeri oltre al
  // richiedente (se passeggeri=1, nessun modulo partecipante: c'è solo
  // il richiedente, che vale come unico passeggero).
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
  // Il cliente non vede mai il numero esatto di posti: qui serve solo
  // internamente per decidere se mostrare il checkout normale o la
  // lista d'attesa.
  const nessunPostoDisponibile = opzioni.length === 0 || opzioni.every((o) => o.postiDisponibili === 0);
  const prezzoUnitario = opzioneScelta
    ? (offerta ? opzioneScelta.prezzoEffettivo * (1 - offerta.scontoPercentuale / 100) : opzioneScelta.prezzoEffettivo)
    : 0;
  const totale = opzioneScelta ? prezzoUnitario * passeggeri : 0;
  const moduloRichiedenteCompleto = Boolean(email && nome && cognome && telefono);
  const partecipantiCompleti = partecipanti.every((p) => p.nome.trim() && p.cognome.trim());
  const puoConfermare = moduloRichiedenteCompleto && partecipantiCompleti && !!opzioneScelta;

  async function confermaPrenotazione(tipoPagamento: 'COMPLETO' | 'ACCONTO') {
    if (!opzioneScelta) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      const promoterCodice = new URLSearchParams(window.location.search).get('promo') || undefined;
      // Catturati automaticamente dall'indirizzo se il cliente arriva da
      // un link pubblicitario (es. ...?utm_source=meta&utm_medium=paid_social)
      // — così sai sempre da dove arriva ogni prenotazione, senza dover
      // fare nulla in più.
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

  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {stato === 'confermato' && (
          <>
            <h3>Prenotazione confermata 🎉</h3>
            <div className="checkout-summary">Il tuo PNR è <b>{pnrConfermato}</b>. I biglietti arriveranno all'email <b>{email}</b>.</div>
            <button className="search-cta" onClick={onClose}>Chiudi</button>
          </>
        )}

        {stato === 'confermato-attesa' && (
          <>
            <h3>Sei in lista d'attesa 📩</h3>
            <div className="checkout-summary">
              Ti scriveremo a <b>{email}</b> appena si libera un posto per <b>{evento.artista}</b>, con un link per
              completare subito la prenotazione.
            </div>
            <button className="search-cta" onClick={onClose}>Chiudi</button>
          </>
        )}

        {stato !== 'confermato' && stato !== 'confermato-attesa' && (
          <>
            <h3>{evento.artista}</h3>
            <div className="checkout-summary">{evento.luogo}, {evento.citta} · {new Date(evento.data).toLocaleDateString('it-IT')}</div>

            {offerta && (
              <p style={{ background: '#e8f7ea', border: '1px solid #b6e3bb', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
                🎉 Offerta "{offerta.nome}": -{offerta.scontoPercentuale.toFixed(0)}% su tutte le fermate.
              </p>
            )}

            {stato === 'caricamento' && <p>Carico le fermate disponibili...</p>}

            {stato !== 'caricamento' && (
              <>
                {nessunPostoDisponibile && (
                  <p style={{ background: '#fff4e0', border: '1px solid #f0d9a8', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
                    Al momento non ci sono posti disponibili. Iscriviti alla lista d'attesa: ti avviseremo via email
                    non appena si libera un posto, con un link per completare subito la prenotazione compilata ora.
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

                <p className="field-label" style={{ marginTop: 18, marginBottom: 6 }}>I tuoi dati (richiedente)</p>
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

                {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

                {nessunPostoDisponibile ? (
                  <button
                    className="search-cta"
                    style={{ marginTop: 14, opacity: (stato === 'invio' || !moduloRichiedenteCompleto || !partecipantiCompleti) ? .5 : 1 }}
                    disabled={stato === 'invio' || !moduloRichiedenteCompleto || !partecipantiCompleti}
                    onClick={iscrivitiListaAttesa}
                  >
                    {stato === 'invio' ? 'Invio...' : "Iscriviti alla lista d'attesa"}
                  </button>
                ) : (
                  <>
                    <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '18px 0 6px' }}>€{totale.toFixed(2)}</p>
                    <p style={{ fontSize: 12, opacity: .7, marginTop: -4 }}>I biglietti arriveranno via email al richiedente.</p>

                    <button
                      className="search-cta"
                      style={{ marginTop: 10, opacity: (stato === 'invio' || !puoConfermare) ? .5 : 1 }}
                      disabled={stato === 'invio' || !puoConfermare}
                      onClick={() => confermaPrenotazione('COMPLETO')}
                    >
                      {stato === 'invio' ? 'Invio...' : 'Acquista'}
                    </button>

                    <button
                      className="search-cta-secondaria"
                      style={{ opacity: (stato === 'invio' || !puoConfermare) ? .5 : 1 }}
                      disabled={stato === 'invio' || !puoConfermare}
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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
