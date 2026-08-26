import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';

interface EventoBase { id: string; artista: string; data: string; luogo: string; citta: string }

const LIMITE_RIGHE_MOSTRATE = 300;

/** Elenco di checkbox per scegliere a quali eventi associare qualcosa
 *  (un organizzatore, in questo caso) — l'associazione deve sempre
 *  essere esplicita, mai "tutti di default".
 *
 *  Il campo di ricerca resta sempre visibile; il riquadro con gli
 *  eventi si apre/chiude con la freccetta, e ha SEMPRE la stessa
 *  altezza (scorre dentro di sé) — anche con migliaia di eventi non
 *  cresce mai oltre quella dimensione. Se la ricerca non è ancora
 *  abbastanza specifica su un elenco enorme, mostriamo solo le prime
 *  righe con un avviso invece di renderle tutte. */
export function SelettoreEventi({ selezionati, onChange }: { selezionati: string[]; onChange: (ids: string[]) => void }) {
  const [eventi, setEventi] = useState<EventoBase[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [espanso, setEspanso] = useState(() => selezionati.length > 0);

  useEffect(() => {
    eventiApi.list().then((lista) => setEventi(lista.map((e) => ({ id: e.id, artista: e.artista, data: e.data, luogo: e.luogo, citta: e.citta }))));
  }, []);

  const filtrati = ricerca.trim()
    ? eventi.filter((e) => `${e.artista} ${e.citta} ${e.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : eventi;
  const daMostrare = filtrati.slice(0, LIMITE_RIGHE_MOSTRATE);
  const altreNascoste = filtrati.length - daMostrare.length;

  function toggle(id: string) {
    onChange(selezionati.includes(id) ? selezionati.filter((x) => x !== id) : [...selezionati, id]);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: espanso ? 8 : 0 }}>
        <input
          placeholder="Cerca evento da associare..."
          value={ricerca}
          onChange={(e) => { setRicerca(e.target.value); if (!espanso) setEspanso(true); }}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setEspanso((v) => !v)}
          aria-label={espanso ? 'Comprimi elenco eventi' : 'Espandi elenco eventi'}
          style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: 8, border: '1px solid var(--line)',
            background: 'var(--dusk)', color: 'var(--mist)', cursor: 'pointer', fontSize: 12,
            transform: espanso ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease',
          }}
        >
          ▾
        </button>
      </div>

      {espanso && (
        <div style={{ height: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 4px' }}>
          {daMostrare.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--mist)', padding: '8px 10px' }}>Nessun evento trovato.</p>}
          {daMostrare.map((e) => (
            <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={selezionati.includes(e.id)} onChange={() => toggle(e.id)} />
              <span>{e.artista} — {e.citta}, {new Date(e.data).toLocaleDateString('it-IT')}</span>
            </label>
          ))}
          {altreNascoste > 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--mist)', padding: '8px 10px', fontStyle: 'italic' }}>
              + altri {altreNascoste} eventi — restringi la ricerca per trovarli.
            </p>
          )}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 6 }}>{selezionati.length} event{selezionati.length === 1 ? 'o' : 'i'} selezionat{selezionati.length === 1 ? 'o' : 'i'}.</p>
    </div>
  );
}
