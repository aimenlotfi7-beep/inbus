/** L'indirizzo del database dei test automatici, con le sicure che impediscono
 *  di usare per sbaglio quello vero: i test cancellano e riscrivono i dati.
 *
 *  Si legge SOLO da TEST_DATABASE_URL (mai da DATABASE_URL, che nel .env della
 *  radice punta alla produzione). Senza, il database locale di Docker
 *  "inbus_test", separato da "inbus". Il nome deve finire con "_test" e il
 *  server deve essere questo computer (in GitHub, il database creato apposta
 *  per il giro di test). */
export const INDIRIZZO_PREDEFINITO = 'postgres://inbus:inbus@localhost:5432/inbus_test';

export function indirizzoDatabaseDiProva(): string {
  const indirizzo = process.env.TEST_DATABASE_URL || INDIRIZZO_PREDEFINITO;
  controllaDatabaseDiProva(indirizzo);
  return indirizzo;
}

export function controllaDatabaseDiProva(indirizzo: string | undefined): void {
  let url: URL;
  try {
    url = new URL(indirizzo ?? '');
  } catch {
    throw new Error('Test fermati: indirizzo del database di prova non valido.');
  }
  const nome = url.pathname.replace(/^\//, '');
  if (!nome.endsWith('_test')) {
    throw new Error(`Test fermati: il database "${nome}" non finisce con "_test". I test cancellano i dati: si usano solo su un database di prova.`);
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(`Test fermati: il database è su "${url.hostname}", non su questo computer.`);
  }
}
