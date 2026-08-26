import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventiApi } from '../../api/eventi';
import { useCarrello } from './CarrelloContext';
import type { Evento, OpzionePartenza } from '../../api/types';

export function AggiungiAlCarrelloWidget({ evento }: { evento: Evento }) {
  const { aggiungi } = useCarrello();
  const [opzioni, setOpzioni] = useState<OpzionePartenza[] | null>(null);
  const [fermataId, setFermataId] = useState('');
  const [passeggeri, setPasseggeri] = useState(1);
  const [aggiunto, setAggiunto] = useState(false);
  const [erroreCaricamento, setErroreCaricamento] = useState('');

  useEffect(() => {
    eventiApi.opzioniPartenza(evento.id)
      .then((o) => { setOpzioni(o); if (o[0]) setFermataId(o[0].fermataId); })
      .catch(() => setErroreCaricamento('Impossibile caricare le fermate disponibili.'));
  }, [evento.id]);

  const opzioneScelta = opzioni?.find((o) => o.fermataId === fermataId);

  function handleAggiungi() {
    if (!opzioneScelta) return;
    aggiungi({
      eventoId: evento.id,
      eventoArtista: evento.artista,
      eventoData: evento.data,
      tragittoId: opzioneScelta.tragittoId,
      fermataId: opzioneScelta.fermataId,
      fermataCitta: opzioneScelta.fermataCitta,
      fermataOrario: opzioneScelta.fermataOrario,
      prezzoStimato: opzioneScelta.prezzoEffettivo,
      passeggeri,
    });
    setAggiunto(true);
    setTimeout(() => setAggiunto(false), 3000);
  }

  if (erroreCaricamento) return <p className="errore">{erroreCaricamento}</p>;
  if (evento.servizi.length > 0) {
    return (
      <p style={{ color: 'var(--mist)', fontSize: 13.5 }}>
        Questo evento ha più servizi tra cui scegliere — usa il <b>checkout diretto</b> qui sotto per selezionare quello giusto.
      </p>
    );
  }
  if (!opzioni) return <p style={{ color: 'var(--mist)' }}>Carico le fermate disponibili...</p>;
  if (opzioni.length === 0) return <p style={{ color: 'var(--mist)' }}>Nessuna fermata disponibile al momento.</p>;

  return (
    <div className="ticket">
      <div className="ticket-head"><b>Prenota</b><span>Aggiungi al carrello</span></div>

      <div className="field-row">
        <div className="field">
          <label>Fermata di partenza</label>
          <select value={fermataId} onChange={(e) => setFermataId(e.target.value)}>
            {opzioni.map((o) => <option key={o.fermataId} value={o.fermataId}>{o.fermataCitta} — €{o.prezzoEffettivo.toFixed(2)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ margin: '10px 0' }}>
        <label style={{ display: 'block', fontSize: 12.5, color: 'var(--mist)', marginBottom: 6 }}>Passeggeri</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setPasseggeri((p) => Math.max(1, p - 1))}>−</button>
          <b>{passeggeri}</b>
          <button type="button" className="btn btn-ghost" onClick={() => setPasseggeri((p) => Math.min(20, p + 1))}>+</button>
        </div>
      </div>

      {opzioneScelta && (
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          Totale stimato: <b>€{(opzioneScelta.prezzoEffettivo * passeggeri).toFixed(2)}</b>
        </p>
      )}

      <button type="button" className="search-cta" onClick={handleAggiungi} disabled={!opzioneScelta}>
        {aggiunto ? '✓ Aggiunto al carrello' : '🛒 Aggiungi al carrello'}
      </button>

      {aggiunto && (
        <p style={{ fontSize: 13, marginTop: 10, textAlign: 'center' }}>
          <Link to="/carrello" style={{ textDecoration: 'underline' }}>Vai al carrello</Link> per completare l'acquisto, oppure continua a guardare altri eventi.
        </p>
      )}
    </div>
  );
}
