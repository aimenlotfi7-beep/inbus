import DOMPurify from 'dompurify';

/** Il contenuto passato a dangerouslySetInnerHTML in questo progetto
 *  arriva sempre da admin fidati (pagine/FAQ gestite da "Contenuti",
 *  anteprima dei template email) — mai da un input diretto di un
 *  cliente. Il rischio concreto è quindi basso, ma sanifichiamo
 *  comunque come prevenzione: se un account admin venisse mai
 *  compromesso, o un ruolo con permessi più limitati potesse un giorno
 *  modificare questo contenuto, un tag <script> o un onclick scritto lì
 *  dentro non verrebbe comunque eseguito nel browser di chi legge. */
export function sanificaHtml(html: string): string {
  return DOMPurify.sanitize(html);
}
