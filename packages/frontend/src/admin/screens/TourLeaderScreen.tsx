import { useEffect, useState } from 'react';
import { tourLeaderApi, type TourLeader } from '../../api/tourleader';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';

const ETICHETTE: Record<TourLeader['stato'], string> = { CANDIDATO: 'Candidato', ATTIVO: 'Attivo', ARCHIVIATO: 'Archiviato' };

export function TourLeaderScreen() {
  const [lista, setLista] = useState<TourLeader[]>([]);
  const [ricerca, setRicerca] = useState('');
  function ricarica() { tourLeaderApi.list().then(setLista); }
  useEffect(ricarica, []);

  const listaFiltrata = ricerca.trim()
    ? lista.filter((t) => `${t.nome} ${t.cognome} ${t.email} ${t.citta ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : lista;

  async function cambiaStato(t: TourLeader, stato: TourLeader['stato']) {
    await tourLeaderApi.update(t.id, { stato });
    ricarica();
  }
  async function elimina(t: TourLeader) {
    if (!confirm(`Eliminare ${t.nome} ${t.cognome}?`)) return;
    await tourLeaderApi.remove(t.id);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Tour Leader" />
      <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 16 }}>
        Le candidature arrivano dal form pubblico di autocandidatura. Cambia lo stato per approvarle o archiviarle.
      </p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o città..." />
      <TabellaGenerica
        righe={listaFiltrata}
        colonne={[
          { etichetta: 'Nome', render: (t) => `${t.nome} ${t.cognome}` },
          { etichetta: 'Contatti', render: (t) => `${t.email}${t.telefono ? ' · ' + t.telefono : ''}` },
          { etichetta: 'Città', render: (t) => t.citta ?? '—' },
          {
            etichetta: 'Stato',
            render: (t) => (
              <select value={t.stato} onChange={(e) => cambiaStato(t, e.target.value as TourLeader['stato'])} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--paper)' }}>
                {Object.entries(ETICHETTE).map(([valore, etichetta]) => (
                  <option key={valore} value={valore}>{etichetta}</option>
                ))}
              </select>
            ),
          },
        ]}
        onElimina={elimina}
      />
    </div>
  );
}
