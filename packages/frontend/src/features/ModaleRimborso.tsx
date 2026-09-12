import { useEffect, useId, useRef, useState } from 'react';
import { MESSAGGIO_CONNESSIONE } from '../shared/errori';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** La richiesta di rimborso in un <dialog> vero, al posto del
 *  window.prompt di prima: il motivo si scrive in una casella di testo
 *  normale (si può rileggere e correggere), l'errore compare dentro la
 *  finestra e l'esito lo mostra la pagina, inline — niente alert().
 *  Esc e il pulsante "Annulla" chiudono allo stesso modo. */
export function ModaleRimborso({ pnr, email, onChiudi, onInviata }: {
  pnr: string;
  email: string;
  onChiudi: () => void;
  /** Chiamata a richiesta accettata: la pagina mostra l'esito dove serve. */
  onInviata: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState('');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const id = useId();

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await fetch(`${API_URL}/api/richieste-rimborso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pnr, email, motivo: motivo.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).errore ?? 'Richiesta non riuscita.');
      onInviata();
      onChiudi();
    } catch (err) {
      // TypeError = la richiesta non è partita (rete): il suo testo è inglese.
      setErrore(err instanceof TypeError ? MESSAGGIO_CONNESSIONE : err instanceof Error ? err.message : 'Richiesta non riuscita, riprova.');
      setInvio(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="modale-conferma" aria-labelledby={`${id}-titolo`} onClose={onChiudi}>
      <form onSubmit={invia}>
        <h2 id={`${id}-titolo`}>Richiedi il rimborso</h2>
        <p>
          La richiesta riguarda la prenotazione <b>{pnr}</b>. La valuta il nostro staff: ti rispondiamo via email
          appena c'è un esito.
        </p>

        <div className="campo">
          <label className="campo-etichetta" htmlFor={`${id}-motivo`}>Motivo della richiesta (facoltativo)</label>
          <textarea
            id={`${id}-motivo`}
            className="campo-input"
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder="Raccontaci in due righe cos'è successo"
          />
        </div>

        {errore && <p className="avviso avviso-errore" role="alert">{errore}</p>}

        <div className="modale-conferma-azioni">
          <button type="submit" className="btn btn-primary" disabled={invio}>
            {invio ? 'Invio in corso…' : 'Invia richiesta'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>Annulla</button>
        </div>
      </form>
    </dialog>
  );
}
