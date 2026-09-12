import { useEffect, useRef } from 'react';
import { Icona } from '../Icone';

/** I passaggi della prenotazione, in un'unica riga: cerchio col numero
 *  (giallo = passo attivo, pieno con la spunta = fatto, contorno = ancora
 *  da fare) ed etichetta sempre visibile — anche sui telefoni, dove la
 *  riga scorre in orizzontale invece di nascondere i nomi. Lo usano il
 *  modulo (CheckoutForm) e il carrello (CarrelloPage), così i tre passi
 *  "Fermata e posti → I tuoi dati → Riepilogo" restano gli stessi da
 *  una pagina all'altra. */
export function Stepper({ voci, attivo }: { voci: string[]; attivo: number }) {
  // Se la riga non ci sta (a 320px nel carrello), il passo attivo restava
  // fuori dallo schermo: la riga scorre da sola fino a mostrarlo. Solo in
  // orizzontale, dentro la riga: la pagina non si muove.
  const rigaRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const riga = rigaRef.current;
    const voce = riga?.children[attivo];
    if (!riga || !voce) return;
    const oltre = voce.getBoundingClientRect().right - riga.getBoundingClientRect().right;
    if (oltre > 0) riga.scrollLeft += oltre;
  }, [attivo, voci.length]);

  return (
    <ol ref={rigaRef} className="stepper" aria-label="Passaggi della prenotazione">
      {voci.map((voce, i) => {
        const stato = i < attivo ? 'completato' : i === attivo ? 'attivo' : 'futuro';
        return (
          <li key={voce} className={`stepper-voce ${stato}`} aria-current={stato === 'attivo' ? 'step' : undefined}>
            <span className="stepper-cerchio" aria-hidden="true">
              {stato === 'completato' ? <Icona nome="spunta" dimensione={16} strokeWidth={2.4} /> : i + 1}
            </span>
            <span className="stepper-etichetta">
              {stato === 'completato' && <span className="sr-only">Fatto: </span>}
              {voce}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
