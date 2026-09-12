/** Come scorrere con scrollIntoView/scrollTo: liscio, ma istantaneo per
 *  chi ha chiesto meno animazioni al sistema (prefers-reduced-motion).
 *  La regola CSS in base.css copre transizioni e animazioni, non gli
 *  scorrimenti avviati da JavaScript. */
export function comportamentoScorrimento(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
