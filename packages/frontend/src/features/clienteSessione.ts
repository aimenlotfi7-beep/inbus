// Sessione cliente vera (token, non più solo un'email "ricordata") —
// definita una sola volta qui: sia AccountPage sia il resto del sito
// (es. l'intestazione, per sapere se mostrare "Accedi" o "Il mio
// account") leggono da qui, invece di avere ognuno la propria copia
// della stessa chiave. Salvata in localStorage (non sessionStorage):
// l'accesso resta valido anche chiudendo e riaprendo il browser, per
// fino a 30 giorni (lo decide il server, non qui).
const CHIAVE_TOKEN_CLIENTE = 'inbus_cliente_token';

export function tokenCliente(): string | null {
  return localStorage.getItem(CHIAVE_TOKEN_CLIENTE);
}
export function salvaTokenCliente(token: string) {
  localStorage.setItem(CHIAVE_TOKEN_CLIENTE, token);
}
export function logoutCliente() {
  localStorage.removeItem(CHIAVE_TOKEN_CLIENTE);
}
export function clienteLoggato(): boolean {
  return !!tokenCliente();
}
