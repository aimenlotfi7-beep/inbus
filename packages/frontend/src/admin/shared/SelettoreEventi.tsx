import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';

interface EventoBase { id: string; artista: string; data: string; luogo: string; citta: string }

/** Elenco di checkbox per scegliere a quali eventi associare qualcosa
 *  (un organizzatore, in questo caso) — l'associazione deve sempre
 *  essere esplicita, mai "tutti di default". */
export function SelettoreEventi({ selezionati, onChange }: { selezionati: string[]; onChange: (ids: string[]) => void }) {
  const [eventi, setEventi] = useState<EventoBase[]>([]);
  const [ricerca, setRicerca] = useState('');

  useEffect(() => {
    eventiApi.list().then((lista) => setEventi(lista.map((e) => ({ id: e.id, artista: e.artista, data: e.data, luogo: e.luogo, citta: e.citta }))));
  }, []);

  const filtrati = ricerca.trim()
    ? eventi.filter((e) => `${e.artista} ${e.citta} ${e.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventi;

  function toggle(id: string) {
    onChange(selezionati.includes(id) ? selezionati.filter((x) => x !== id) : [...selezionati, id]);
  }

  return (
    <div>
      <input
        placeholder="Cerca evento da associare..."
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 4px' }}>
        {filtrati.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--mist)', padding: '8px 10px' }}>Nessun evento trovato.</p>}
        {filtrati.map((e) => (
          <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={selezionati.includes(e.id)} onChange={() => toggle(e.id)} />
            <span>{e.artista} — {e.citta}, {new Date(e.data).toLocaleDateString('it-IT')}</span>
          </label>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 6 }}>{selezionati.length} event{selezionati.length === 1 ? 'o' : 'i'} selezionat{selezionati.length === 1 ? 'o' : 'i'}.</p>
    </div>
  );
}
