// Conversions API di Meta — manda gli eventi anche dal SERVER, non
// solo dal browser (Pixel). Perché conta: il Pixel nel browser si
// perde se il cliente ha Safari, un ad-blocker, o chiude la scheda
// prima che l'evento parta — succede più spesso di quanto sembri. Il
// server non ha nessuno di questi problemi.
//
// Deduplica: quando lo stesso evento (es. un acquisto) viene mandato
// SIA dal Pixel nel browser SIA da qui, Meta li riconosce come lo
// stesso evento SOLO se hanno lo stesso event_id — altrimenti li conta
// due volte. L'event_id lo genera il FRONTEND (prima di inviare
// l'ordine) e lo manda qui dentro il payload della prenotazione: sia
// il Pixel (lato browser) sia questa funzione (lato server) devono
// usare LO STESSO id per lo stesso evento.
//
// Ogni chiamata è best-effort: un problema con l'API di Meta non deve
// mai far fallire una prenotazione già confermata sul database.

import { createHash } from 'crypto';

function sha256(testo: string): string {
  return createHash('sha256').update(testo.trim().toLowerCase()).digest('hex');
}

interface DatiEventoMeta {
  nomeEvento: 'Purchase' | 'InitiateCheckout' | 'Refund';
  /** Generato dal frontend, condiviso con l'eventuale chiamata Pixel
   *  gemella nel browser — è la chiave di deduplica. */
  eventId: string;
  urlOrigine: string;
  valore?: number;
  valuta?: string;
  email?: string;
  telefono?: string;
  /** IP e user-agent del cliente (non del server) — aumentano quanto
   *  bene Meta riesce ad abbinare l'evento a una persona reale
   *  ("match quality"), più alto è meglio l'algoritmo ottimizza. */
  ipCliente?: string;
  userAgentCliente?: string;
  /** Cookie _fbp/_fbc, se il browser del cliente li aveva già (il
   *  Pixel li imposta da solo) — stesso motivo, match quality. */
  fbp?: string;
  fbc?: string;
}

export async function inviaEventoMetaCapi(pixelId: string, token: string, dati: DatiEventoMeta): Promise<void> {
  try {
    const userData: Record<string, unknown> = {};
    if (dati.email) userData.em = [sha256(dati.email)];
    if (dati.telefono) userData.ph = [sha256(dati.telefono.replace(/\D/g, ''))];
    if (dati.ipCliente) userData.client_ip_address = dati.ipCliente;
    if (dati.userAgentCliente) userData.client_user_agent = dati.userAgentCliente;
    if (dati.fbp) userData.fbp = dati.fbp;
    if (dati.fbc) userData.fbc = dati.fbc;

    const corpo = {
      data: [{
        event_name: dati.nomeEvento,
        event_time: Math.floor(Date.now() / 1000),
        event_id: dati.eventId,
        event_source_url: dati.urlOrigine,
        action_source: 'website',
        user_data: userData,
        ...(dati.valore != null && {
          custom_data: { value: dati.valore, currency: dati.valuta ?? 'EUR' },
        }),
      }],
      access_token: token,
    };

    const risposta = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!risposta.ok) {
      console.error(`[meta-capi] risposta non ok (${risposta.status}):`, await risposta.text());
    }
  } catch (e) {
    console.error('[meta-capi] invio evento fallito:', e instanceof Error ? e.message : e);
  }
}
