import type { InputHTMLAttributes } from 'react';

/** Un campo di testo del checkout: etichetta visibile, input con le
 *  classi di base.css (.campo / .campo-etichetta / .campo-input) e, sotto,
 *  l'aiuto oppure l'errore. L'errore è annunciato (role="alert") e
 *  collegato al campo (aria-describedby, aria-invalid), l'aiuto solo
 *  collegato. Lo usano il modulo, il carrello e le pagine collegate. */
export function CampoTesto({ id, etichetta, aiuto, errore, className, ...input }: {
  id: string;
  etichetta: string;
  aiuto?: string;
  errore?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const idAiuto = `${id}-aiuto`;
  const idErrore = `${id}-errore`;
  return (
    <div className={`campo${className ? ` ${className}` : ''}`}>
      <label className="campo-etichetta" htmlFor={id}>{etichetta}</label>
      <input
        id={id}
        className="campo-input"
        aria-invalid={errore ? true : undefined}
        aria-describedby={errore ? idErrore : aiuto ? idAiuto : undefined}
        {...input}
      />
      {errore
        ? <p className="campo-errore" id={idErrore} role="alert">{errore}</p>
        : aiuto ? <p className="campo-aiuto" id={idAiuto}>{aiuto}</p> : null}
    </div>
  );
}
