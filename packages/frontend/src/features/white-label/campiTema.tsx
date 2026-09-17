import { useEffect, useState } from 'react';
import { caricaFile, verificaCaricamentoAttivo } from '../../api/upload';
import { notifica } from '../../admin/shared/notifiche';
import { motivoErrore } from '../../admin/shared/errori';

/** I campi dell'editor White Label: colore, immagine, misura, interruttore.
 *  Tutti con l'etichetta in italiano e la spiegazione sotto, perché è la
 *  schermata dove si decide come vede la pagina il cliente finale. */

export function Riga({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: React.ReactNode }) {
  return (
    <div className="wl-riga">
      <div className="wl-riga-testo">
        <label>{etichetta}</label>
        {aiuto && <small>{aiuto}</small>}
      </div>
      <div className="wl-riga-campo">{children}</div>
    </div>
  );
}

export function CampoColore({ etichetta, aiuto, valore, onCambia }: { etichetta: string; aiuto?: string; valore: string; onCambia: (v: string) => void }) {
  return (
    <Riga etichetta={etichetta} aiuto={aiuto}>
      <span className="wl-colore">
        <input type="color" value={valore} onChange={(e) => onCambia(e.target.value)} aria-label={`${etichetta}: scegli il colore`} />
        <input value={valore} onChange={(e) => onCambia(e.target.value)} aria-label={`${etichetta}: codice colore`} spellCheck={false} />
      </span>
    </Riga>
  );
}

export function CampoMisura({ etichetta, aiuto, valore, min, max, unita = 'px', onCambia }: {
  etichetta: string; aiuto?: string; valore: number; min: number; max: number; unita?: string; onCambia: (v: number) => void;
}) {
  return (
    <Riga etichetta={etichetta} aiuto={aiuto}>
      <span className="wl-misura">
        <input type="range" min={min} max={max} value={valore} onChange={(e) => onCambia(Number(e.target.value))} aria-label={etichetta} />
        <b>{valore}{unita}</b>
      </span>
    </Riga>
  );
}

export function CampoInterruttore({ etichetta, aiuto, valore, onCambia }: { etichetta: string; aiuto?: string; valore: boolean; onCambia: (v: boolean) => void }) {
  return (
    <div className="wl-riga">
      <div className="wl-riga-testo">
        <label htmlFor={`sw-${etichetta}`}>{etichetta}</label>
        {aiuto && <small>{aiuto}</small>}
      </div>
      <div className="wl-riga-campo">
        <span className="wl-scelta" role="group" aria-label={etichetta}>
          <button type="button" className="si" aria-pressed={valore} onClick={() => onCambia(true)}>Sì</button>
          <button type="button" className="no" aria-pressed={!valore} onClick={() => onCambia(false)}>No</button>
        </span>
      </div>
    </div>
  );
}

export function CampoTestoTema({ etichetta, aiuto, valore, segnaposto, onCambia }: {
  etichetta: string; aiuto?: string; valore: string | null; segnaposto?: string; onCambia: (v: string | null) => void;
}) {
  return (
    <Riga etichetta={etichetta} aiuto={aiuto}>
      <input value={valore ?? ''} placeholder={segnaposto} onChange={(e) => onCambia(e.target.value.trim() === '' ? null : e.target.value)} aria-label={etichetta} />
    </Riga>
  );
}

export function CampoScelta<T extends string>({ etichetta, aiuto, valore, opzioni, onCambia }: {
  etichetta: string; aiuto?: string; valore: T; opzioni: { valore: T; nome: string }[]; onCambia: (v: T) => void;
}) {
  return (
    <Riga etichetta={etichetta} aiuto={aiuto}>
      <select value={valore} onChange={(e) => onCambia(e.target.value as T)} aria-label={etichetta}>
        {opzioni.map((o) => <option key={o.valore} value={o.valore}>{o.nome}</option>)}
      </select>
    </Riga>
  );
}

/** Immagine del tema: si carica dal computer (se il caricamento file è
 *  attivo) oppure si incolla l'indirizzo di un'immagine già online. */
export function CampoImmagine({ etichetta, aiuto, valore, onCambia }: { etichetta: string; aiuto?: string; valore: string | null; onCambia: (v: string | null) => void }) {
  const [caricamentoAttivo, setCaricamentoAttivo] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => { verificaCaricamentoAttivo().then(setCaricamentoAttivo); }, []);

  async function scegli(file: File | undefined) {
    if (!file) return;
    setInCorso(true);
    try {
      onCambia(await caricaFile(file));
      notifica('Immagine caricata.', 'successo');
    } catch (e) {
      notifica(`Caricamento non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="wl-riga wl-riga-immagine">
      <div className="wl-riga-testo">
        <label>{etichetta}</label>
        {aiuto && <small>{aiuto}</small>}
      </div>
      <div className="wl-riga-campo">
        <div className="wl-immagine">
          {valore
            ? <img src={valore} alt="" />
            : <span className="wl-immagine-vuota">nessuna</span>}
          <div className="wl-immagine-azioni">
            <input value={valore ?? ''} placeholder="Indirizzo dell'immagine (https://…)" onChange={(e) => onCambia(e.target.value.trim() === '' ? null : e.target.value)} aria-label={`${etichetta}: indirizzo`} />
            <div className="wl-immagine-pulsanti">
              <label className={`btn btn-ghost btn-piccolo${caricamentoAttivo && !inCorso ? '' : ' disabilitato'}`}>
                {inCorso ? 'Carico…' : 'Carica dal computer'}
                <input type="file" accept="image/*" hidden disabled={!caricamentoAttivo || inCorso} onChange={(e) => scegli(e.target.files?.[0])} />
              </label>
              {valore && <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => onCambia(null)}>Togli</button>}
            </div>
            {!caricamentoAttivo && <small className="wl-nota">Caricamento file non attivo: incolla l'indirizzo di un'immagine già online.</small>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SezioneEditor({ titolo, aiuto, children }: { titolo: string; aiuto?: string; children: React.ReactNode }) {
  return (
    <section className="section-card wl-sezione">
      <h3>{titolo}</h3>
      {aiuto && <p className="wl-sezione-aiuto">{aiuto}</p>}
      <div className="wl-campi">{children}</div>
    </section>
  );
}
