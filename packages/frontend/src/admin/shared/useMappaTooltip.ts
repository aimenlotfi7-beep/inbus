import { useEffect, useState } from 'react';
import { pagineApi } from '../../api/pagine';

/** Carica i testi tooltip personalizzati (se un admin ne ha modificato
 *  qualcuno dalla sezione Sistema → Testi tooltip) — stessa logica che
 *  prima viveva duplicata dentro SchedaEventoModale, qui estratta per
 *  poterla riusare in qualunque altra schermata voglia i suoi tooltip,
 *  senza riscrivere la stessa chiamata ogni volta. Passa il risultato
 *  a <EtichettaTooltip mappaTooltip={...} />. */
export function useMappaTooltip() {
  const [mappaTooltip, setMappaTooltip] = useState<Record<string, string>>({});
  useEffect(() => {
    pagineApi.listContenuti().then((lista) => {
      const mappa: Record<string, string> = {};
      for (const c of lista) if (c.chiave.startsWith('tooltip_')) mappa[c.chiave.slice(8)] = c.valore;
      setMappaTooltip(mappa);
    });
  }, []);
  return mappaTooltip;
}
