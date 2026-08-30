import { useEffect, useRef, useState } from 'react';
import { chatApi, type Conversazione, type MessaggioChat } from '../../api/chat';
import { PanelHead } from '../shared/PanelHead';

const ETICHETTA_STATO: Record<Conversazione['stato'], { testo: string; classe: string }> = {
  APERTA: { testo: '🟡 Aperta', classe: 'attenzione' },
  IN_CORSO: { testo: '🔵 In corso', classe: 'coperta' },
  CHIUSA: { testo: '⚪ Chiusa', classe: 'non-coperta' },
};

/** Ogni quanto ricontrollare messaggi/conversazioni da sole, senza che
 *  l'admin debba ricaricare la pagina a mano. */
const INTERVALLO_AGGIORNAMENTO_MS = 4000;

export function ChatScreen() {
  const [conversazioni, setConversazioni] = useState<Conversazione[] | null>(null);
  const [filtroStato, setFiltroStato] = useState<Conversazione['stato'] | 'TUTTE'>('TUTTE');
  const [selezionata, setSelezionata] = useState<Conversazione | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [testo, setTesto] = useState('');
  const selezionataRef = useRef<Conversazione | null>(null);
  selezionataRef.current = selezionata;

  function ricaricaLista() {
    chatApi.listaConversazioni(filtroStato === 'TUTTE' ? undefined : filtroStato).then(setConversazioni);
  }
  useEffect(ricaricaLista, [filtroStato]);

  // Aggiornamento automatico — sia la lista (per vedere subito nuove
  // conversazioni/messaggi non letti) sia la chat aperta al momento
  // (per vedere le risposte del cliente senza dover ricaricare).
  useEffect(() => {
    const id = setInterval(() => {
      ricaricaLista();
      const attuale = selezionataRef.current;
      if (attuale) chatApi.messaggiConversazione(attuale.id).then(setMessaggi);
    }, INTERVALLO_AGGIORNAMENTO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStato]);

  function apri(c: Conversazione) {
    setSelezionata(c);
    chatApi.messaggiConversazione(c.id).then(setMessaggi);
    if (c.nonLetti > 0) chatApi.segnaLetti(c.id).then(ricaricaLista);
  }

  async function invia() {
    if (!testo.trim() || !selezionata) return;
    await chatApi.rispondi(selezionata.id, testo);
    setTesto('');
    chatApi.messaggiConversazione(selezionata.id).then(setMessaggi);
    ricaricaLista();
  }

  async function chiudi() {
    if (!selezionata) return;
    if (!confirm(`Chiudere la conversazione con ${selezionata.clienteNome}? Se scrive di nuovo, se ne aprirà una nuova (questa resta comunque consultabile nello storico).`)) return;
    const id = selezionata.id;
    await chatApi.chiudi(id);
    setSelezionata((s) => s && s.id === id ? { ...s, stato: 'CHIUSA' } : s);
    ricaricaLista();
  }
  async function riapri() {
    if (!selezionata) return;
    const id = selezionata.id;
    await chatApi.riapri(id);
    setSelezionata((s) => s && s.id === id ? { ...s, stato: 'IN_CORSO' } : s);
    ricaricaLista();
  }

  return (
    <div>
      <PanelHead titolo="Chat" />

      {/* Pulsanti stato — una sola fascia ben allineata sopra l'elenco,
          non più stretti dentro la colonna sinistra. */}
      <div className="mini-tabs" style={{ marginBottom: 14 }}>
        {(['TUTTE', 'APERTA', 'IN_CORSO', 'CHIUSA'] as const).map((s) => (
          <button key={s} type="button" className={`mini-tab${filtroStato === s ? ' active' : ''}`} onClick={() => setFiltroStato(s)}>
            {s === 'TUTTE' ? 'Tutte' : ETICHETTA_STATO[s].testo}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, height: '64vh' }}>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conversazioni === null && <p className="testo-intro">Carico...</p>}
          {conversazioni?.length === 0 && <p className="testo-intro">Nessuna conversazione.</p>}
          {conversazioni?.map((c) => (
            <button
              key={c.id}
              onClick={() => apri(c)}
              style={{
                textAlign: 'left', background: selezionata?.id === c.id ? 'var(--pink)' : 'var(--dusk)',
                border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                color: selezionata?.id === c.id ? '#fff' : 'var(--paper)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 13.5 }}>{c.clienteNome}</b>
                {c.nonLetti > 0 && <span style={{ background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10, padding: '1px 7px' }}>{c.nonLetti}</span>}
              </div>
              <div style={{ fontSize: 11.5, opacity: .75 }}>{c.eventoArtista}</div>
              <div style={{ fontSize: 10.5, opacity: .6, marginTop: 2 }}>{ETICHETTA_STATO[c.stato].testo} · {new Date(c.ultimoMessaggioIl).toLocaleString('it-IT')}</div>
            </button>
          ))}
        </div>

        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!selezionata && <div style={{ margin: 'auto', color: 'var(--mist)' }}>Scegli una conversazione dall'elenco.</div>}
          {selezionata && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <b>{selezionata.clienteNome}</b> <span style={{ color: 'var(--mist)', fontSize: 12 }}>· {selezionata.eventoArtista}</span>
                  <div style={{ fontSize: 11 }}><span className={`badge ${ETICHETTA_STATO[selezionata.stato].classe}`}>{ETICHETTA_STATO[selezionata.stato].testo}</span></div>
                </div>
                {selezionata.stato === 'CHIUSA'
                  ? <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={riapri}>Riapri</button>
                  : <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={chiudi}>Chiudi conversazione</button>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messaggi.map((m) => (
                  <div key={m.id} style={{
                    maxWidth: '75%', padding: '9px 13px', borderRadius: 12, fontSize: 13.5,
                    alignSelf: m.autore === 'ADMIN' ? 'flex-end' : 'flex-start',
                    background: m.autore === 'ADMIN' ? 'var(--pink)' : 'var(--night)',
                    color: m.autore === 'ADMIN' ? '#fff' : 'var(--paper)',
                  }}>
                    {m.testo}
                    <div style={{ fontSize: 10, opacity: .7, marginTop: 4 }}>{m.nome} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
                  </div>
                ))}
              </div>
              {selezionata.stato !== 'CHIUSA' && (
                <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
                  <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi una risposta..."
                    onKeyDown={(e) => e.key === 'Enter' && invia()}
                    style={{ flex: 1, minWidth: 0, background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--paper)' }} />
                  <button className="btn btn-primary" style={{ flexShrink: 0, padding: '10px 18px' }} onClick={invia}>Invia</button>
                </div>
              )}
              {selezionata.stato === 'CHIUSA' && (
                <p style={{ padding: 12, textAlign: 'center', color: 'var(--mist)', fontSize: 12 }}>
                  Conversazione chiusa — riapri per rispondere ancora.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
