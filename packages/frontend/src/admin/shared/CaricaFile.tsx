import { useEffect, useRef, useState } from 'react';
import { caricaFile, verificaCaricamentoAttivo } from '../../api/upload';
import { ErroreApi } from '../../api/client';

/** Pulsante "Carica file" riusabile — carica davvero il file (invece di
 *  dover incollare un link a mano) e passa l'URL risultante al chiamante
 *  tramite onCaricato. Usato ovunque nel gestionale serva un'immagine o
 *  un PDF: foto evento, intestazione biglietto, immagini nelle email.
 *
 *  Se il caricamento non è ancora configurato (nessun servizio di
 *  archiviazione collegato), il pulsante lo dice subito — disattivato,
 *  con una spiegazione al passaggio del mouse — invece di sembrare
 *  funzionante e fallire solo al click. */
export function CaricaFile({ onCaricato, accept = 'image/*', etichetta = '+ Carica file' }: {
  onCaricato: (url: string) => void;
  accept?: string;
  etichetta?: string;
}) {
  const [caricando, setCaricando] = useState(false);
  const [attivo, setAttivo] = useState<boolean | null>(null); // null = ancora da verificare
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { verificaCaricamentoAttivo().then(setAttivo); }, []);

  async function gestisciSelezione(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di ricaricare subito lo stesso file una seconda volta, se serve
    if (!file) return;

    setCaricando(true);
    try {
      const url = await caricaFile(file);
      onCaricato(url);
    } catch (err) {
      alert(err instanceof ErroreApi ? `Caricamento non riuscito: ${err.message}` : 'Caricamento non riuscito: errore di rete.');
    } finally {
      setCaricando(false);
    }
  }

  const nonAncoraAttivo = attivo === false;

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} onChange={gestisciSelezione} style={{ display: 'none' }} />
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: 12, padding: '3px 10px', opacity: nonAncoraAttivo ? 0.5 : 1, cursor: nonAncoraAttivo ? 'not-allowed' : 'pointer' }}
        onClick={() => !nonAncoraAttivo && inputRef.current?.click()}
        disabled={caricando || attivo === null}
        title={nonAncoraAttivo ? 'Caricamento file non ancora configurato — usa il link qui accanto per ora' : undefined}
      >
        {caricando ? 'Carico...' : etichetta}
      </button>
    </>
  );
}
