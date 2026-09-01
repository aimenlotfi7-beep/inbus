import L from 'leaflet';

/** Lo stesso rombo smussato usato nella Cartina dei Percorsi — qui
 *  parametrizzato per colore, così può segnare categorie diverse di
 *  fermate (es. "sempre Testa"/"mai Testa"/"a volte Testa") invece del
 *  grigio unico usato quando disegna un percorso vero. */
export function creaPinDiamante(coloreFill: string, coloreBordo: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="33" rx="5" ry="2" fill="#000" opacity="0.18"/>
      <g transform="translate(14,14) rotate(45)">
        <rect x="-9" y="-9" width="18" height="18" rx="5" fill="${coloreFill}" stroke="${coloreBordo}" stroke-width="1"/>
      </g>
      <circle cx="14" cy="14" r="4" fill="#fff"/>
    </svg>`,
    iconSize: [28, 36],
    iconAnchor: [14, 14], // il centro del rombo indica il punto esatto — l'ombra sotto è solo un effetto visivo, non il riferimento
    popupAnchor: [0, -12],
  });
}
