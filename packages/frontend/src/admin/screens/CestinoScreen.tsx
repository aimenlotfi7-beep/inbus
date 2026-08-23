import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';

type Tab = 'eventi' | 'tratte';
type Tratta = { id: string; nome: string; eliminatoIl: string; eventoId: string; eventoArtista: string };

/**
 * Il cestino non cancella mai niente per davvero (le prenotazioni
 * collegate resterebbero orfane) — nasconde solo "eliminato" ovunque,
 * recuperabile da qui. Una tab per ogni tipo di cosa che si può
 * eliminare, così cresce facilmente se in futuro se ne aggiungono altri.
 */
export function CestinoScreen() {
  const [tab, setTab] = useState<Tab>('eventi');
  const [eventiEliminati, setEventiEliminati] = useState<(Evento & { eliminatoIl: string })[] | null>(null);
  const [tratteEliminate, setTratteEliminate] = useState<Tratta[] | null>(null);

  function ricaricaEventi() {
    eventiApi.cestino.eventi().then(setEventiEliminati);
  }
  function ricaricaTratte() {
    eventiApi.cestino.tratte().then(setTratteEliminate);
  }
  useEffect(() => {
    ricaricaEventi();
    ricaricaTratte();
  }, []);

  async function ripristinaEvento(id: string, nome: string) {
    if (!confirm(`Ripristinare "${nome}"? Tornerà visibile ovunque, come prima di essere eliminato.`)) return;
    await eventiApi.cestino.ripristinaEvento(id);
    ricaricaEventi();
  }
  async function ripristinaTratta(id: string, nome: string) {
    if (!confirm(`Ripristinare la tratta "${nome}"? Tornerà visibile nel suo evento.`)) return;
    await eventiApi.cestino.ripristinaTratta(id);
    ricaricaTratte();
  }

  return (
    <div>
      <PanelHead titolo="Cestino" info="Niente viene mai cancellato per davvero — se ha prenotazioni collegate, andrebbero perse. Qui trovi tutto quello che hai eliminato, sempre recuperabile." />

      <div className="mini-tabs" style={{ marginBottom: 18 }}>
        <button type="button" className={`mini-tab${tab === 'eventi' ? ' active' : ''}`} onClick={() => setTab('eventi')}>
          Eventi {eventiEliminati && eventiEliminati.length > 0 ? `(${eventiEliminati.length})` : ''}
        </button>
        <button type="button" className={`mini-tab${tab === 'tratte' ? ' active' : ''}`} onClick={() => setTab('tratte')}>
          Tratte {tratteEliminate && tratteEliminate.length > 0 ? `(${tratteEliminate.length})` : ''}
        </button>
      </div>

      {tab === 'eventi' && (
        <>
          {eventiEliminati === null && <p className="testo-intro">Carico...</p>}
          {eventiEliminati?.length === 0 && <p className="testo-intro">Il cestino eventi è vuoto.</p>}
          {eventiEliminati?.map((ev) => (
            <div key={ev.id} className="riga-cliccabile" style={{ cursor: 'default' }}>
              <span className="riga-titolo">
                {ev.artista}
                <br />
                <span style={{ color: 'var(--mist)', fontSize: 12 }}>
                  {ev.luogo}, {ev.citta} · eliminato il {new Date(ev.eliminatoIl).toLocaleDateString('it-IT')}
                </span>
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => ripristinaEvento(ev.id, ev.artista)}>
                ↺ Ripristina
              </button>
            </div>
          ))}
        </>
      )}

      {tab === 'tratte' && (
        <>
          {tratteEliminate === null && <p className="testo-intro">Carico...</p>}
          {tratteEliminate?.length === 0 && <p className="testo-intro">Il cestino tratte è vuoto.</p>}
          {tratteEliminate?.map((t) => (
            <div key={t.id} className="riga-cliccabile" style={{ cursor: 'default' }}>
              <span className="riga-titolo">
                {t.nome}
                <br />
                <span style={{ color: 'var(--mist)', fontSize: 12 }}>
                  Evento: {t.eventoArtista} · eliminata il {new Date(t.eliminatoIl).toLocaleDateString('it-IT')}
                </span>
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => ripristinaTratta(t.id, t.nome)}>
                ↺ Ripristina
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
