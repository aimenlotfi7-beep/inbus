const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ErroreApi extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
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
