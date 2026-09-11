import { useEffect, useState } from 'react';
import { utentiApi, type Utente } from '../../api/utenti';

/** Cerca-e-scegli UN cliente — diverso da SelettoreEventi (checkbox
 *  multiplo): un voucher appartiene a una sola persona. */
export function SelettoreCliente({ utenteId, onChange }: { utenteId: string | null; onChange: (id: string | null) => void }) {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [aperto, setAperto] = useState(false);

  useEffect(() => { utentiApi.list().then(setUtenti).catch(() => {}); }, []);

  const scelto = utenti.find((u) => u.id === utenteId);
  const filtrati = ricerca.trim()
    ? utenti.filter((u) => `${u.nome ?? ''} ${u.cognome ?? ''} ${u.email}`.toLowerCase().includes(ricerca.trim().toLowerCase())).slice(0, 30)
    : [];

  if (scelto && !aperto) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{scelto.nome ?? ''} {scelto.cognome ?? ''} — {scelto.email}</span>
        <button type="button" className="btn btn-ghost" onClick={() => { onChange(null); setRicerca(''); }}>Cambia</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        placeholder="Cerca cliente per nome o email..."
        value={ricerca}
        onChange={(e) => { setRicerca(e.target.value); setAperto(true); }}
        onFocus={() => setAperto(true)}
      />
      {aperto && ricerca.trim() && (
        <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {filtrati.length === 0 && <p style={{ padding: '10px 14px', fontSize: 'var(--testo-md)', color: 'var(--mist)' }}>Nessun cliente trovato.</p>}
          {filtrati.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onChange(u.id); setAperto(false); setRicerca(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 'var(--testo-base)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              {u.nome ?? ''} {u.cognome ?? ''} — {u.email}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
