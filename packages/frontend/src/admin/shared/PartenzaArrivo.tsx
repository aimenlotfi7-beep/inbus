import type { Tragitto } from '../../api/types';

/** Da dove parte e dove arriva un tragitto, in una riga: in ogni voce di
 *  Partenze e nella pagina delle linee. Partenza sempre in verde e arrivo
 *  sempre in blu, come nella modifica degli orari e nella scheda del
 *  tragitto in Eventi. La partenza è la prima fermata attiva. */
export function PartenzaArrivo({ tragitto }: { tragitto: Tragitto | undefined }) {
  if (!tragitto) return null;
  const partenza = primaFermataAttiva(tragitto);
  const arrivo = [tragitto.arrivoCitta, tragitto.arrivoIndirizzo].filter(Boolean).join(', ');
  const cella = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } as const;
  const etichetta = { fontSize: 'var(--testo-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' } as const;
  return (
    <div className="section-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 14, background: 'var(--dusk-2)' }}>
      <div style={cella}>
        <span style={{ ...etichetta, color: COLORE_PARTENZA }}>Partenza</span>
        <b>{partenza ? partenza.citta : 'Nessuna fermata'}</b>
        <span style={{ fontSize: 'var(--testo-sm)', color: partenza?.orario ? 'var(--mist)' : 'var(--pink)' }}>{partenza ? (partenza.orario ?? 'orario da impostare') : ''}</span>
      </div>
      <span aria-hidden="true" style={{ color: 'var(--mist)' }}>→</span>
      <div style={{ ...cella, textAlign: 'right' }}>
        <span style={{ ...etichetta, color: COLORE_ARRIVO }}>Arrivo</span>
        <b style={{ color: arrivo ? undefined : 'var(--pink)' }}>{arrivo || 'Da impostare in Eventi'}</b>
        <span style={{ fontSize: 'var(--testo-sm)', color: tragitto.arrivoOrario ? 'var(--mist)' : 'var(--pink)' }}>{tragitto.arrivoOrario ?? 'orario da impostare'}</span>
      </div>
    </div>
  );
}

export const COLORE_PARTENZA = 'var(--green)';
export const COLORE_ARRIVO = 'var(--blue)';

/** La fermata da cui parte davvero il bus: la prima non esclusa. */
export function primaFermataAttiva<F extends { attivo?: boolean | null }>(tragitto: { fermate: F[] }): F | undefined {
  return tragitto.fermate.find((f) => f.attivo !== false);
}
