import { useEffect, useState } from 'react';
import { comunicazioniApi, type Comunicazione } from '../../../api/comunicazioni';
import { ErroreApi } from '../../../api/client';
import type { Evento } from '../../../api/types';

export function ComunicazioniTab({ evento }: { evento: Evento }) {
  const [storico, setStorico] = useState<Comunicazione[]>([]);
  const [caricamentoStorico, setCaricamentoStorico] = useState(true);

  const [servizioIds, setServizioIds] = useState<string[]>([]);
  const [tragittoId, setTragittoId] = useState('');
  const [fermataId, setFermataId] = useState('');
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [canaleEmail, setCanaleEmail] = useState(true);
  const [canaleChat, setCanaleChat] = useState(false);

  const [numeroDestinatari, setNumeroDestinatari] = useState<number | null>(null);
  const [calcolando, setCalcolando] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(false);

  function ricaricaStorico() {
    setCaricamentoStorico(true);
    comunicazioniApi.list(evento.id).then(setStorico).finally(() => setCaricamentoStorico(false));
  }
  useEffect(ricaricaStorico, [evento.id]);

  const tutteLeTratte = [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)];
  const tratteDisponibili = servizioIds.length === 1
    ? evento.servizi.find((s) => s.id === servizioIds[0])?.tragitti ?? []
    : tutteLeTratte;
  const tragittoScelto = tutteLeTratte.find((t) => t.id === tragittoId);

  useEffect(() => {
    setTragittoId('');
    setFermataId('');
  }, [servizioIds]);
  useEffect(() => {
    setFermataId('');
  }, [tragittoId]);

  useEffect(() => {
    setCalcolando(true);
    setNumeroDestinatari(null);
    const timeout = setTimeout(() => {
      comunicazioniApi.anteprima(evento.id, { servizioIds, tragittoId: tragittoId || undefined, fermataId: fermataId || undefined })
        .then((r) => setNumeroDestinatari(r.numeroDestinatari))
        .finally(() => setCalcolando(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [evento.id, servizioIds, tragittoId, fermataId]);

  function toggleServizio(id: string) {
    setServizioIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function invia() {
    if (!oggetto.trim() || !corpo.trim()) { setErrore('Scrivi oggetto e testo prima di inviare.'); return; }
    const canali: ('EMAIL' | 'CHAT')[] = [...(canaleEmail ? ['EMAIL' as const] : []), ...(canaleChat ? ['CHAT' as const] : [])];
    if (canali.length === 0) { setErrore('Scegli almeno un canale di invio.'); return; }
    if (!confirm(`Inviare questa comunicazione a ${numeroDestinatari ?? '?'} client${numeroDestinatari === 1 ? 'e' : 'i'}?`)) return;

    setInviando(true);
    setErrore('');
    try {
      await comunicazioniApi.invia(evento.id, { servizioIds, tragittoId: tragittoId || undefined, fermataId: fermataId || undefined, oggetto, corpo, canali });
      setOggetto('');
      setCorpo('');
      setFatto(true);
      setTimeout(() => setFatto(false), 3000);
      ricaricaStorico();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Invio non riuscito, riprova.');
    } finally {
      setInviando(false);
    }
  }

  return (
    <div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <p className="section-label" style={{ marginBottom: 10 }}>A chi</p>

        <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 6 }}>
          Servizi (nessuno selezionato = tutto l'evento)
        </p>
        {evento.servizi.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {evento.servizi.map((s) => (
              <label key={s.id} className={`mini-tab${servizioIds.includes(s.id) ? ' active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={servizioIds.includes(s.id)} onChange={() => toggleServizio(s.id)} style={{ margin: 0 }} />
                {s.nome}
              </label>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 14 }}>Questo evento non ha servizi distinti.</p>
        )}

        <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 6 }}>Tratta specifica (facoltativo)</p>
        <select value={tragittoId} onChange={(e) => setTragittoId(e.target.value)} style={{ marginBottom: 14 }}>
          <option value="">Tutte le tratte {servizioIds.length === 1 ? 'di questo servizio' : ''}</option>
          {tratteDisponibili.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>

        {tragittoScelto && tragittoScelto.fermate.length > 0 && (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--mist)', marginBottom: 6 }}>Fermata specifica (facoltativo)</p>
            <select value={fermataId} onChange={(e) => setFermataId(e.target.value)}>
              <option value="">Tutte le fermate della tratta</option>
              {tragittoScelto.fermate.map((f) => <option key={f.id} value={f.id}>{f.citta} — {f.indirizzo}</option>)}
            </select>
          </>
        )}

        <p style={{ fontSize: 13, marginTop: 14, fontWeight: 600 }}>
          {calcolando ? 'Calcolo...' : `${numeroDestinatari ?? 0} destinatari${numeroDestinatari === 1 ? 'o' : ''}`}
        </p>
      </div>

      <div className="section-card" style={{ marginBottom: 16 }}>
        <p className="section-label" style={{ marginBottom: 10 }}>Il messaggio</p>
        <input placeholder="Oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} style={{ marginBottom: 10 }} />
        <textarea placeholder="Testo del messaggio..." value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={5} style={{ width: '100%', marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={canaleEmail} onChange={(e) => setCanaleEmail(e.target.checked)} /> Email
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={canaleChat} onChange={(e) => setCanaleChat(e.target.checked)} /> Chat (nella loro conversazione di questo evento)
          </label>
        </div>
        {errore && <p style={{ color: 'var(--pink)', fontSize: 13, marginBottom: 10 }}>{errore}</p>}
        {fatto && <p style={{ color: 'var(--green)', fontSize: 13, marginBottom: 10 }}>✓ Comunicazione inviata.</p>}
        <button className="btn btn-primary" onClick={invia} disabled={inviando || numeroDestinatari === 0}>
          {inviando ? 'Invio...' : `Invia a ${numeroDestinatari ?? 0} client${numeroDestinatari === 1 ? 'e' : 'i'}`}
        </button>
      </div>

      <div className="section-card">
        <p className="section-label" style={{ marginBottom: 10 }}>Storico comunicazioni</p>
        {caricamentoStorico && <p style={{ fontSize: 13, color: 'var(--mist)' }}>Carico...</p>}
        {!caricamentoStorico && storico.length === 0 && <p style={{ fontSize: 13, color: 'var(--mist)' }}>Nessuna comunicazione inviata ancora per questo evento.</p>}
        {storico.map((c) => (
          <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{c.oggetto}</p>
            <p style={{ fontSize: 12, color: 'var(--mist)', margin: '2px 0 0' }}>
              {new Date(c.creataIl).toLocaleString('it-IT')} · {c.numeroDestinatari} destinatari · {c.canali.join(' + ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
