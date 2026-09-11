import { useEffect, useState, type ReactNode } from 'react';
import { Modale } from './Modale';

/** Finestra di conferma del gestionale, al posto di window.confirm() e
 *  window.prompt(): stesso aspetto delle altre modali, testo con grassetti
 *  e a capo, un pulsante chiaro per l'azione. Si usa come una funzione
 *  qualunque — `if (!(await conferma({ … }))) return;` — senza stato per
 *  la modale in ogni schermata. La disegna <ConfermeHost/>, montato una
 *  volta sola nel layout del gestionale (come il <Toaster/> delle notifiche). */
export interface RichiestaConferma {
  titolo: string;
  testo: ReactNode;
  conferma: string;
  annulla?: string;
  /** Pulsante rosso: per azioni che cancellano, inviano o non si annullano. */
  pericolosa?: boolean;
  /** Un campo di testo nella finestra (es. il motivo di un rifiuto): il
   *  valore si legge con confermaConTesto(). */
  campoTesto?: { etichetta: string; placeholder?: string };
}

type Esito = { ok: boolean; testo: string };

let apriConferma: ((richiesta: RichiestaConferma) => Promise<Esito>) | null = null;

export function conferma(richiesta: RichiestaConferma): Promise<boolean> {
  // Nessun host montato (non dovrebbe succedere dentro il gestionale):
  // meglio la finestra del browser che eseguire l'azione senza chiedere.
  if (!apriConferma) return Promise.resolve(window.confirm(`${richiesta.titolo}\n\n${typeof richiesta.testo === 'string' ? richiesta.testo : ''}`));
  return apriConferma(richiesta).then((esito) => esito.ok);
}

/** Come conferma(), con un campo di testo: restituisce quello che è stato
 *  scritto (anche vuoto) se si conferma, null se si annulla. */
export function confermaConTesto(richiesta: RichiestaConferma & { campoTesto: NonNullable<RichiestaConferma['campoTesto']> }): Promise<string | null> {
  if (!apriConferma) return Promise.resolve(window.prompt(`${richiesta.titolo}\n\n${richiesta.campoTesto.etichetta}`));
  return apriConferma(richiesta).then((esito) => (esito.ok ? esito.testo : null));
}

export function ConfermeHost() {
  const [attiva, setAttiva] = useState<(RichiestaConferma & { risolvi: (esito: Esito) => void }) | null>(null);
  const [testo, setTesto] = useState('');

  useEffect(() => {
    apriConferma = (richiesta) => new Promise((risolvi) => { setTesto(''); setAttiva({ ...richiesta, risolvi }); });
    return () => { apriConferma = null; };
  }, []);

  if (!attiva) return null;
  const chiudi = (ok: boolean) => { attiva.risolvi({ ok, testo }); setAttiva(null); };
  return (
    <Modale titolo={attiva.titolo} onClose={() => chiudi(false)}>
      <div style={{ marginBottom: 16, lineHeight: 1.55 }}>{attiva.testo}</div>
      {attiva.campoTesto && (
        <div className="campo">
          <label htmlFor="conferma-campo-testo">{attiva.campoTesto.etichetta}</label>
          <textarea
            id="conferma-campo-testo" autoFocus maxLength={500}
            value={testo} placeholder={attiva.campoTesto.placeholder}
            onChange={(e) => setTesto(e.target.value)}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={() => chiudi(false)}>{attiva.annulla ?? 'Annulla'}</button>
        <button
          type="button" className="btn btn-primary" autoFocus={!attiva.campoTesto}
          style={attiva.pericolosa ? { background: 'var(--pink)', borderColor: 'var(--pink)', color: '#fff' } : undefined}
          onClick={() => chiudi(true)}
        >
          {attiva.conferma}
        </button>
      </div>
    </Modale>
  );
}
