import { useEffect, useState } from 'react';
import { ascoltaNotifiche, type Notifica } from './notifiche';

/** Montato una volta in AdminApp. Mostra le notifiche in basso a
 *  destra; gli errori restano più a lungo (vanno letti), i successi
 *  spariscono in fretta. Cliccare chiude subito. role="status" /
 *  aria-live: gli screen reader le leggono senza rubare il fuoco. */
export function Toaster() {
  const [lista, setLista] = useState<Notifica[]>([]);
  useEffect(() => ascoltaNotifiche((n) => {
    setLista((prev) => [...prev, n]);
    setTimeout(() => setLista((prev) => prev.filter((x) => x.id !== n.id)), n.tipo === 'errore' ? 9000 : 4500);
  }), []);
  if (lista.length === 0) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {lista.map((n) => (
        <div key={n.id} className={`toast toast-${n.tipo}`} onClick={() => setLista((prev) => prev.filter((x) => x.id !== n.id))} title="Clicca per chiudere">
          <span className="toast-icona" aria-hidden="true">{n.tipo === 'errore' ? '✕' : n.tipo === 'successo' ? '✓' : 'i'}</span>
          <span>{n.testo}</span>
        </div>
      ))}
    </div>
  );
}
