import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { controlloAccessiApi, type RisultatoRicerca, tokenTourLeader } from '../api/tourLeaderAuth';
import { TourLeaderLayout } from '../features/TourLeaderLayout';
import { Icona } from '../features/Icone';

export function TourLeaderCercaPage() {
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<RisultatoRicerca[] | null>(null);
  const [cercando, setCercando] = useState(false);
  const [checkinInCorso, setCheckinInCorso] = useState<string | null>(null);
  const [daConfermare, setDaConfermare] = useState<RisultatoRicerca | null>(null);
  const [errore, setErrore] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!tokenTourLeader()) navigate('/scansione/accedi');
  }, [navigate]);

  useEffect(() => {
    if (query.trim().length < 2) { setRisultati(null); return; }
    setCercando(true);
    const id = setTimeout(() => {
      controlloAccessiApi.cerca(query).then(setRisultati).catch(() => setRisultati([])).finally(() => setCercando(false));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  async function faiCheckin(r: RisultatoRicerca) {
    setDaConfermare(null);
    setErrore('');
    setCheckinInCorso(r.partecipanteId);
    try {
      await controlloAccessiApi.checkinManuale(r.partecipanteId);
      setRisultati((prev) => prev?.map((x) => x.partecipanteId === r.partecipanteId ? { ...x, giaSalito: true } : x) ?? null);
    } catch (e) {
      setErrore(`Check-in di ${r.nome} ${r.cognome} non riuscito: ${e instanceof Error ? e.message : 'controlla la connessione e riprova.'}`);
    } finally {
      setCheckinInCorso(null);
    }
  }

  return (
    <TourLeaderLayout vocedAttiva="cerca">
      <h1 className="page-title">Cerca passeggero</h1>
      <p className="tl-intro">Nome, cognome o codice di prenotazione, su tutti i tuoi eventi insieme.</p>

      <div className="campo tl-ricerca">
        <label className="campo-etichetta" htmlFor="tl-cerca">Cerca</label>
        <input
          id="tl-cerca" className="campo-input" type="search" autoFocus autoComplete="off"
          placeholder="Es. Mario Rossi, o IB4X7K2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {errore && <p className="avviso avviso-errore tl-errore" role="alert">{errore}</p>}
      {cercando && <p className="tl-nota" role="status">Cerco…</p>}
      {!cercando && query.trim().length >= 2 && risultati?.length === 0 && (
        <p className="tl-nota">Nessun passeggero trovato con questi dati, sui tuoi eventi.</p>
      )}

      <div className="tl-elenco">
        {risultati?.map((r) => (
          <div key={r.partecipanteId} className="tl-card tl-riga">
            <div>
              <p className="tl-card-titolo">{r.nome} {r.cognome}</p>
              <p className="tl-card-riga">PNR {r.pnr} · da {r.fermataCitta}</p>
            </div>
            {r.giaSalito ? (
              <span className="tl-a-bordo"><Icona nome="spunta" dimensione={16} strokeWidth={2.4} />Già a bordo</span>
            ) : (
              <button
                type="button" className="btn btn-primary btn-sm"
                onClick={() => setDaConfermare(r)}
                disabled={checkinInCorso === r.partecipanteId}
              >
                {checkinInCorso === r.partecipanteId ? 'Check-in…' : 'Check-in'}
              </button>
            )}
          </div>
        ))}
      </div>

      {daConfermare && (
        <ConfermaCheckin
          risultato={daConfermare}
          onConferma={() => faiCheckin(daConfermare)}
          onAnnulla={() => setDaConfermare(null)}
        />
      )}
    </TourLeaderLayout>
  );
}

/** Conferma della salita a mano, in un <dialog> al posto di
 *  window.confirm: il nome si legge bene e il pulsante è grande. */
function ConfermaCheckin({ risultato, onConferma, onAnnulla }: {
  risultato: RisultatoRicerca;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="modale-conferma" aria-labelledby="conferma-checkin-titolo" onClose={onAnnulla}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); onConferma(); }}>
        <h2 id="conferma-checkin-titolo">Confermi la salita?</h2>
        <p><b>{risultato.nome} {risultato.cognome}</b> · PNR {risultato.pnr} · da {risultato.fermataCitta}</p>
        <div className="modale-conferma-azioni">
          <button type="submit" className="btn btn-primary">Conferma la salita</button>
          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>Annulla</button>
        </div>
      </form>
    </dialog>
  );
}
