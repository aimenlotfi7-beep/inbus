import { useEffect, useState } from 'react';
import type { Evento, OpzionePartenza } from '../../api/types';
import { eventiApi } from '../../api/eventi';
import { prenotazioniApi } from '../../api/prenotazioni';
import { ErroreApi } from '../../api/client';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'errore';

export function CheckoutModal({ evento, onClose }: { evento: Evento; onClose: () => void }) {
  const [stato, setStato] = useState<Stato>('caricamento');
  const [opzioni, setOpzioni] = useState<OpzionePartenza[]>([]);
  const [fermataId, setFermataId] = useState('');
  const [passeggeri, setPasseggeri] = useState(1);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [pnrConfermato, setPnrConfermato] = useState('');

  useEffect(() => {
    eventiApi.opzioniPartenza(evento.id).then((o) => {
      setOpzioni(o);
      if (o[0]) setFermataId(o[0].fermataId);
      setStato('pronto');
    });
  }, [evento.id]);

  const opzioneScelta = opzioni.find((o) => o.fermataId === fermataId);
  const totale = opzioneScelta ? opzioneScelta.prezzoEffettivo * passeggeri : 0;

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
        cliente: { email, nome },
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
            <div className="checkout-summary">Il tuo PNR è <b>{pnrConfermato}</b>. Riceverai i dettagli via email.</div>
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

                <label className="field-label">Nome</label>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />

                <label className="field-label">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

                <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '18px 0 6px' }}>€{totale.toFixed(2)}</p>

                {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

                <button
                  className="search-cta"
                  style={{ marginTop: 10, opacity: (stato === 'invio' || !email || !nome || !opzioneScelta) ? .5 : 1 }}
                  disabled={stato === 'invio' || !email || !nome || !opzioneScelta}
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
