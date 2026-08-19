// Chiave usata per ricordare l'accesso del cliente all'area personale
// (dura solo per la scheda del browser aperta, sparisce chiudendola —
// scelta voluta, non è un vero login con password). Definita una sola
// volta qui: sia AccountPage sia il resto del sito (es. l'intestazione,
// per sapere se mostrare "Accedi" o "Il mio account") leggono da qui,
// invece di avere ognuno la propria copia della stessa chiave.
export const CHIAVE_EMAIL_CLIENTE = 'inbus_cliente_email';

export function emailClienteLoggato(): string | null {
  return sessionStorage.getItem(CHIAVE_EMAIL_CLIENTE);
}
