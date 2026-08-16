import { useEffect, useState } from 'react';
import type { Evento, OpzionePartenza } from '../../api/types';
import { eventiApi } from '../../api/eventi';
import { prenotazioniApi } from '../../api/prenotazioni';
import { utentiApi } from '../../api/utenti';
import { ErroreApi } from '../../api/client';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'errore';
interface Partecipante { nome: string; cognome: string; }

export function CheckoutModal({ evento, onClose }: { evento: Evento; onClose: () => void }) {
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
      if (o[0]) setFermataId(o[0].fermataId);
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
  const totale = opzioneScelta ? opzioneScelta.prezzoEffettivo * passeggeri : 0;
  const moduloRichiedenteCompleto = Boolean(email && nome && cognome && telefono);
  const partecipantiCompleti = partecipanti.every((p) => p.nome.trim() && p.cognome.trim());
  const puoConfermare = moduloRichiedenteCompleto && partecipantiCompleti && !!opzioneScelta;

  async function confermaPrenotazione() {
    if (!opzioneScelta) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      const promoterCodice = new URLSearchParams(window.location.search).get('promo') || undefined;
      const prenotazione = await prenotazioniApi.crea({
        eventoId: evento.id,
        lineaId: opzioneScelta.lineaId,
        fermataId: opzioneScelta.fermataId,
        passeggeri,
        tipoPagamento: 'COMPLETO',
        metodoPagamento: 'CARTA',
        cliente: { email, nome, cognome, telefono },
        partecipanti,
        ...(promoterCodice && { promoterCodice }),
      });
      setPnrConfermato(prenotazione.pnr);
      setStato('confermato');
    } catch (e) {
      setMessaggioErrore(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
      setStato('errore');
    }
  }

  return (
    <div className="modal-overlay show" onClick={onClose}>
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {stato === 'confermato' ? (
          <>
            <h3>Prenotazione confermata 🎉</h3>
            <div className="checkout-summary">Il tuo PNR è <b>{pnrConfermato}</b>. I biglietti arriveranno all'email <b>{email}</b>.</div>
            <button className="search-cta" onClick={onClose}>Chiudi</button>
          </>
        ) : (
          <>
            <h3>{evento.artista}</h3>
            <div className="checkout-summary">{evento.luogo}, {evento.citta} · {new Date(evento.data).toLocaleDateString('it-IT')}</div>

            {stato === 'caricamento' && <p>Carico le fermate disponibili...</p>}

            {stato !== 'caricamento' && (
              <>
                <label className="field-label">Fermata di partenza</label>
                <select value={fermataId} onChange={(e) => setFermataId(e.target.value)}>
                  {opzioni.map((o) => (
                    <option key={o.fermataId} value={o.fermataId}>
                      {o.fermataCitta} ({o.fermataOrario ?? 'orario da definire'}) — €{o.prezzoEffettivo.toFixed(2)} · {o.postiDisponibili} posti liberi
                    </option>
                  ))}
                </select>

                <label className="field-label">Passeggeri</label>
                <input type="text" inputMode="numeric" value={passeggeri}
                  onChange={(e) => setPasseggeri(Math.max(1, Number(e.target.value) || 1))} />

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

                <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '18px 0 6px' }}>€{totale.toFixed(2)}</p>
                <p style={{ fontSize: 12, opacity: .7, marginTop: -4 }}>I biglietti arriveranno via email al richiedente.</p>

                {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

                <button
                  className="search-cta"
                  style={{ marginTop: 10, opacity: (stato === 'invio' || !puoConfermare) ? .5 : 1 }}
                  disabled={stato === 'invio' || !puoConfermare}
                  onClick={confermaPrenotazione}
                >
                  {stato === 'invio' ? 'Invio...' : 'Conferma e paga'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
