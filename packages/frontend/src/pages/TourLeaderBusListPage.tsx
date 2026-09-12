import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controlloAccessiApi, type BusAssegnato, tokenTourLeader } from '../api/tourLeaderAuth';
import { TourLeaderLayout } from '../features/TourLeaderLayout';
import { formattaData } from '../shared/formato';

export function TourLeaderBusListPage() {
  const [bus, setBus] = useState<BusAssegnato[] | null>(null);
  const [errore, setErrore] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!tokenTourLeader()) { navigate('/scansione/accedi'); return; }
    controlloAccessiApi.busAssegnati()
      .then(setBus)
      .catch((e) => setErrore(e instanceof Error ? e.message : 'Impossibile caricare gli eventi.'));
  }, [navigate]);

  return (
    <TourLeaderLayout vocedAttiva="eventi">
      <h1 className="page-title">I tuoi eventi</h1>
      <p className="tl-intro">Ogni evento a cui sei assegnato: apri la lista dei passeggeri o scansiona i biglietti.</p>

      {errore && <p className="avviso avviso-errore tl-errore" role="alert">{errore}</p>}
      {!bus && !errore && <p className="tl-nota" role="status">Carico…</p>}
      {bus?.length === 0 && (
        <div className="stato-vuoto">
          <h3>Nessun evento assegnato</h3>
          <p>Quando lo staff ti assegna a un bus, l'evento compare qui.</p>
        </div>
      )}

      <div className="tl-elenco">
        {bus?.map((b) => (
          <div key={b.busId} className="tl-card">
            <p className="tl-card-titolo">{b.eventoArtista}</p>
            <p className="tl-card-riga">{formattaData(b.eventoData)} · Bus {b.riferimento}</p>
            <div className="tl-azioni">
              {/* La lista si riempie il giorno prima della partenza, dopo lo
                  smistamento per età: la pagina lo spiega se è ancora presto. */}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/scansione/bus/${b.busId}/passeggeri`)}>
                Lista passeggeri
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/scansione/bus/${b.busId}`)}>
                Scansiona biglietti
              </button>
            </div>
          </div>
        ))}
      </div>
    </TourLeaderLayout>
  );
}
