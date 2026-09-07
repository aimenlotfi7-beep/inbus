import { OrarioInput } from '../../shared/OrarioInput';

export interface ArrivoCondiviso { attivo: boolean; citta: string; indirizzo: string; orario: string }

/** Il blocco "Imposta lo stesso arrivo per tutti i tragitti di …" (per
 *  servizio). Solo presentazione: la propagazione ai tragitti e la
 *  regola "una sola città per evento" restano nel genitore, che passa
 *  qui la città bloccata (se stabilita da un altro servizio) e le due
 *  azioni. */
export function ArrivoPerTutti({ valore, etichettaContesto, bloccataDaAltroServizio, onFlag, onCampo }: {
  valore: ArrivoCondiviso;
  etichettaContesto: string;
  /** Città di arrivo dell'evento se stabilita da un tragitto FUORI da questo servizio: il campo si blocca su questa. */
  bloccataDaAltroServizio: string | undefined;
  onFlag: (attivo: boolean) => void;
  onCampo: (campo: 'citta' | 'indirizzo' | 'orario', valore: string) => void;
}) {
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={valore.attivo} onChange={(e) => onFlag(e.target.checked)} style={{ width: 'auto' }} />
        Imposta lo stesso arrivo per tutti i tragitti di {etichettaContesto}
      </label>
      {valore.attivo && (
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label>Città di arrivo
            <input
              value={bloccataDaAltroServizio ?? valore.citta}
              disabled={!!bloccataDaAltroServizio}
              style={bloccataDaAltroServizio ? { opacity: .6, background: 'var(--night)', cursor: 'not-allowed' } : undefined}
              title={bloccataDaAltroServizio ? 'Città di arrivo di tutto l\'evento, stabilita da un tragitto di un altro servizio.' : undefined}
              onChange={(e) => onCampo('citta', e.target.value)}
              placeholder="es. Roma"
            />
          </label>
          <label>Indirizzo di arrivo
            <input value={valore.indirizzo} onChange={(e) => onCampo('indirizzo', e.target.value)} placeholder="es. Piazzale Clodio, Roma" />
          </label>
          <label>Orario di arrivo
            <OrarioInput value={valore.orario} onChange={(v) => onCampo('orario', v)} />
          </label>
        </div>
      )}
    </div>
  );
}
