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
  // Ordinate per regione (alfabetico, "Senza regione" sempre in
  // fondo) e poi per città dentro ogni regione — come Fornitori e
  // Fermate nel gestionale, per lo stesso identico motivo: con molte
  // fermate diventa più facile scorrere una lista organizzata invece
  // di una sola sequenza alfabetica lunga.
  const opzioniOrdinate = [...opzioni].sort((a, b) => {
    const ra = a.fermataRegione ?? 'zzz', rb = b.fermataRegione ?? 'zzz';
    if (ra !== rb) return ra.localeCompare(rb, 'it');
    return a.fermataCitta.localeCompare(b.fermataCitta, 'it');
  });
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
          background: '#fff', border: '1px solid #e5ded0', borderRadius: 10, maxHeight: 260, overflowY: 'auto',
          boxShadow: '0 6px 18px rgba(0,0,0,.12)',
        }}>
          {filtrate.length === 0 && <p style={{ padding: '10px 14px', fontSize: 13, opacity: .6, margin: 0 }}>Nessuna fermata trovata.</p>}
          {filtrate.map((o, i) => {
            // Intestazione di regione solo quando cambia rispetto alla
            // fermata precedente nell'elenco già ordinato — non una per
            // fermata, una per gruppo. Quelle senza regione stanno in
            // fondo sotto "Altre fermate"; se nessuna ha una regione (la
            // prima dell'elenco ordinato non ce l'ha) niente intestazioni:
            // "Senza regione" è un dato interno, non da mostrare al cliente.
            const almenoUnaRegione = !!filtrate[0].fermataRegione;
            const regionePrecedente = i > 0 ? (filtrate[i - 1].fermataRegione ?? 'Altre fermate') : null;
            const regioneCorrente = o.fermataRegione ?? 'Altre fermate';
            const nuovaRegione = almenoUnaRegione && regioneCorrente !== regionePrecedente;
            return (
              <div key={o.fermataId}>
                {nuovaRegione && (
                  <p style={{ margin: 0, padding: '9px 14px 5px', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4, color: 'inherit', background: 'rgba(0,0,0,.04)' }}>{regioneCorrente}</p>
                )}
                <button
                  type="button"
                  onClick={() => scegli(o)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13.5,
                    background: o.fermataId === valore ? '#faf4ea' : 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  {testoOpzione(o)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
