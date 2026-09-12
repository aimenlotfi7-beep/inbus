import { useEffect, useState } from 'react';

/** true fino a 900px compresi: la stessa soglia dei fogli di stile del
 *  sito (base.css: mobile = max-width 900px, desktop = min-width 901px).
 *  Serve a montare il modulo di prenotazione in UN solo posto per volta
 *  — nel pannello laterale su desktop, nel foglio a schermo intero sui
 *  telefoni — invece di nasconderne una copia col CSS. */
export function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const aggiorna = () => setMobile(mq.matches);
    mq.addEventListener('change', aggiorna);
    return () => mq.removeEventListener('change', aggiorna);
  }, []);
  return mobile;
}
