import { useEffect, useRef, useState } from 'react';
import type { OpzionePartenza } from '../../api/types';

/** Campo "cerca la tua fermata" — vuoto di default (non ne sceglie una
 *  a caso), scrivendo filtra per città, un pulsante apre comunque
 *  l'elenco completo (in ordine alfabetico) per chi preferisce
 *  scorrere invece di scrivere. */
export function SelettoreFermata({ opzioni, valore, onSeleziona, testoOpzione }: {
  opzioni: OpzionePartenza[];
  valore: string;
  onSeleziona: (fermataId: string) => void;
  testoOpzione: (o: OpzionePartenza) => string;
}) {
  const opzioniOrdinate = [...opzioni].sort((a, b) => a.fermataCitta.localeCompare(b.fermataCitta, 'it'));
  const scelta = opzioniOrdinate.find((o) => o.fermataId === valore) ?? null;

  const [testo, setTesto] = useState(scelta ? testoOpzione(scelta) : '');
  const [aperto, setAperto] = useState(false);
  const contenitoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTesto(scelta ? testoOpzione(scelta) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore]);

  useEffect(() => {
    function chiudiSeFuori(e: MouseEvent) {
      if (contenitoreRef.current && !contenitoreRef.current.contains(e.target as Node)) setAperto(false);
    }
    document.addEventListener('mousedown', chiudiSeFuori);
    return () => document.removeEventListener('mousedown', chiudiSeFuori);
  }, []);

  const filtrate = testo.trim() && (!scelta || testoOpzione(scelta) !== testo)
    ? opzioniOrdinate.filter((o) => o.fermataCitta.toLowerCase().includes(testo.trim().toLowerCase()))
    : opzioniOrdinate;

  function scegli(o: OpzionePartenza) {
    onSeleziona(o.fermataId);
    setTesto(testoOpzione(o));
    setAperto(false);
  }

  return (
    <div ref={contenitoreRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Seleziona una fermata..."
        value={testo}
        onChange={(e) => { setTesto(e.target.value); setAperto(true); }}
        onFocus={() => setAperto(true)}
      />
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-label="Mostra tutte le fermate"
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: .6, padding: 4,
        }}
      >
        ▾
      </button>

      {aperto && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #e3e3ea', borderRadius: 10, maxHeight: 260, overflowY: 'auto',
          boxShadow: '0 6px 18px rgba(0,0,0,.12)',
        }}>
          {filtrate.length === 0 && <p style={{ padding: '10px 14px', fontSize: 13, opacity: .6, margin: 0 }}>Nessuna fermata trovata.</p>}
          {filtrate.map((o) => (
            <button
              key={o.fermataId}
              type="button"
              onClick={() => scegli(o)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13.5,
                background: o.fermataId === valore ? '#faf4ea' : 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              {testoOpzione(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
