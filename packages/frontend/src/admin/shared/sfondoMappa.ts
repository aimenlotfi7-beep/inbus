import L from 'leaflet';

/** Lo sfondo di tutte le cartine del gestionale, in un punto solo. Tile
 *  standard di OpenStreetMap: gratuite e senza chiave, chiedono solo di
 *  citare la fonte (l'attribuzione in basso a destra) e un uso moderato,
 *  com'è quello di un gestionale interno. Prima c'era CARTO "Positron",
 *  che online ha iniziato a coprire la mappa con la scritta "API KEY
 *  REQUIRED". La classe "sfondo-mappa" smorza i colori (gestionale.css)
 *  per tenere l'aspetto chiaro di prima, con pin e linee in evidenza. */
export function aggiungiSfondoMappa(mappa: L.Map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
    className: 'sfondo-mappa',
  }).addTo(mappa);
}
