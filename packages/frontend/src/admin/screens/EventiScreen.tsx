import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import { ErroreApi } from '../../api/client';
import { prezzoMinimoEvento } from '../../api/prezzi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

export function EventiScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<Evento | null>(null);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() {
    eventiApi.list().then(setEventi);
  }
  useEffect(ricarica, []);

  function apriNuovo() { setInModifica(null); setModaleAperta(true); }
  function apriModifica(ev: Evento) { setInModifica(ev); setModaleAperta(true); }

  async function elimina(ev: Evento) {
    if (!confirm(`Eliminare l'evento "${ev.artista}"?`)) return;
    try {
      await eventiApi.remove(ev.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : "Eliminazione non riuscita: impossibile contattare il server.");
    }
  }

  return (
    <div>
      <PanelHead titolo="Eventi" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo evento</button>} />

      <div className="cards-list">
        {eventi.map((ev) => (
          <div key={ev.id} className="evento-card" onClick={() => apriModifica(ev)}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
            <h3 style={{ fontSize: 17, margin: '6px 0 4px' }}>{ev.artista}</h3>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{ev.luogo}, {ev.citta}</p>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>
              {new Date(ev.data).toLocaleDateString('it-IT')}
              {(() => { const p = prezzoMinimoEvento(ev); return p !== null ? ` · da €${p.toFixed(2)}` : ''; })()}
            </p>
            <button className="btn btn-ghost" style={{ marginTop: 10, fontSize: 11, color: 'var(--pink)' }} onClick={(e) => { e.stopPropagation(); elimina(ev); }}>Elimina</button>
          </div>
        ))}
        {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento ancora.</p>}
      </div>

      {modaleAperta && (
        <SchedaEventoModale evento={inModifica} tabIniziale="dettagli" onClose={() => setModaleAperta(false)} onSalvato={ricarica} />
      )}
    </div>
  );
}
