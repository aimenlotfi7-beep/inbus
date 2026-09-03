const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ErroreApi extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Dove reindirizzare quando il token di QUESTA chiave risulta scaduto o
// non valido (401) — ogni tipo di sessione ha il proprio login
// separato. L'admin manca apposta: la sua sessione è tenuta in uno
// stato React (dentro AdminApp.tsx), non in una pagina/rotta a sé, va
// gestita diversamente (vedi più sotto, evento invece di redirect).
const LOGIN_PER_CHIAVE: Record<string, string> = {
  inbus_cliente_token: '/accedi',
  inbus_promoter_token: '/promoter',
  inbus_organizzatore_token: '/organizzatore',
  inbus_tourleader_token: '/scansione/accedi',
};

/** Un 401 di QUALUNQUE chiamata significa "questo token non è (più)
 *  valido" — prima ogni pagina lo scopriva per conto suo, mostrando un
 *  errore generico invece di riportare la persona al login. Centralizzato
 *  qui una volta sola, per ogni tipo di sessione dell'app. */
function gestisci401(chiaveToken: string) {
  localStorage.removeItem(chiaveToken);
  if (chiaveToken === 'inbus_admin_token') {
    // L'admin non ha una pagina di login a sé — AdminApp.tsx ascolta
    // questo evento e torna da solo alla schermata di accesso, senza
    // un ricaricamento completo della pagina (che perderebbe lo stato
    // dell'intera app admin per niente).
    window.dispatchEvent(new Event('inbus-401-admin'));
    return;
  }
  const percorsoLogin = LOGIN_PER_CHIAVE[chiaveToken];
  if (!percorsoLogin || window.location.pathname === percorsoLogin) return; // già lì, o chiave sconosciuta: non fare nulla
  const dopo = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = chiaveToken === 'inbus_cliente_token' ? `${percorsoLogin}?dopo=${dopo}&motivo=scaduta` : percorsoLogin;
}

async function richiesta<T>(path: string, opzioni: RequestInit = {}, chiaveToken = 'inbus_admin_token'): Promise<T> {
  const token = localStorage.getItem(chiaveToken);
  const res = await fetch(`${API_URL}${path}`, {
    ...opzioni,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opzioni.headers,
    },
  });

  if (!res.ok) {
    const corpo = await res.json().catch(() => ({ errore: res.statusText }));
    // Solo se avevamo davvero un token da perdere — un 401 su una
    // chiamata SENZA token (endpoint pubblici che per qualche motivo
    // rispondono così) non è una sessione scaduta, non c'è nessun
    // login da cui essere stati sloggati.
    if (res.status === 401 && token) gestisci401(chiaveToken);
    throw new ErroreApi(corpo.errore ?? 'Errore sconosciuto', res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => richiesta<T>(path),
  post: <T>(path: string, body?: unknown) =>
    richiesta<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    richiesta<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => richiesta<T>(path, { method: 'DELETE' }),
};

/** Come `api`, ma autentica con un token diverso da quello admin — usato
 *  dal portale Promoter (`inbus_promoter_token`), che ha il proprio login
 *  separato da quello del gestionale. */
export function apiConToken(chiaveToken: string) {
  return {
    get: <T>(path: string) => richiesta<T>(path, {}, chiaveToken),
    post: <T>(path: string, body?: unknown) =>
      richiesta<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, chiaveToken),
    put: <T>(path: string, body?: unknown) =>
      richiesta<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }, chiaveToken),
  };
}
