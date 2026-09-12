import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

/** Un campo password con il pulsante "Mostra"/"Nascondi" dentro il
 *  campo: senza, chi sbaglia a digitare non ha modo di accorgersene e
 *  riceve solo "credenziali non valide". Stesse classi di CampoTesto
 *  (.campo / .campo-etichetta / .campo-input) più .campo-password per
 *  il pulsante; il pulsante è terziario, alto almeno 44px e dichiara
 *  con aria-pressed se la password è in chiaro.
 *
 *  `azione` è il posto per un link a destra dell'etichetta
 *  ("Password dimenticata?"). */
export function CampoPassword({ id, etichetta, aiuto, errore, azione, className, ...input }: {
  id: string;
  etichetta: string;
  aiuto?: string;
  errore?: string;
  azione?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visibile, setVisibile] = useState(false);
  const idAiuto = `${id}-aiuto`;
  const idErrore = `${id}-errore`;
  return (
    <div className={`campo${className ? ` ${className}` : ''}`}>
      <div className="campo-etichetta-riga">
        <label className="campo-etichetta" htmlFor={id}>{etichetta}</label>
        {azione}
      </div>
      <div className="campo-password">
        <input
          id={id}
          className="campo-input"
          type={visibile ? 'text' : 'password'}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? idErrore : aiuto ? idAiuto : undefined}
          {...input}
        />
        <button
          type="button"
          className="btn btn-tertiary campo-password-azione"
          aria-pressed={visibile}
          aria-controls={id}
          onClick={() => setVisibile((v) => !v)}
        >
          {visibile ? 'Nascondi' : 'Mostra'}
        </button>
      </div>
      {errore
        ? <p className="campo-errore" id={idErrore} role="alert">{errore}</p>
        : aiuto ? <p className="campo-aiuto" id={idAiuto}>{aiuto}</p> : null}
    </div>
  );
}
