import { useEffect, useRef, useState } from 'react';
import { chatApi, type Conversazione, type MessaggioChat } from '../../api/chat';
import { PanelHead } from '../shared/PanelHead';
import { conferma } from '../shared/conferma';
import { notifica } from '../shared/notifiche';
import { motivoErrore } from '../shared/errori';
import { formattaDataOra } from '../../shared/formato';

const ETICHETTA_STATO: Record<Conversazione['stato'], { testo: string; classe: string }> = {
  APERTA: { testo: 'Aperta', classe: 'attenzione' },
  IN_CORSO: { testo: 'In corso', classe: 'coperta' },
  CHIUSA: { testo: 'Chiusa', classe: 'non-coperta' },
};

/** Ogni quanto ricontrollare messaggi/conversazioni da sole, senza che
 *  l'admin debba ricaricare la pagina a mano. */
const INTERVALLO_AGGIORNAMENTO_MS = 4000;

export function ChatScreen() {
  const [conversazioni, setConversazioni] = useState<Conversazione[] | null>(null);
  const [erroreLista, setErroreLista] = useState('');
  const [filtroStato, setFiltroStato] = useState<Conversazione['stato'] | 'TUTTE'>('TUTTE');
  const [selezionata, setSelezionata] = useState<Conversazione | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [testo, setTesto] = useState('');
  const [inviando, setInviando] = useState(false);
  const selezionataRef = useRef<Conversazione | null>(null);
  selezionataRef.current = selezionata;

  function ricaricaLista() {
    chatApi.listaConversazioni(filtroStato === 'TUTTE' ? undefined : filtroStato)
      .then((lista) => { setConversazioni(lista); setErroreLista(''); })
      .catch((e) => setErroreLista(motivoErrore(e)));
  }
  useEffect(ricaricaLista, [filtroStato]);

  /** I messaggi di una conversazione, solo se è ancora quella aperta quando
   *  arrivano: prima, cambiando conversazione durante il caricamento, i
   *  messaggi di una finivano sotto un'altra. */
  function caricaMessaggi(id: string) {
    chatApi.messaggiConversazione(id)
      .then((m) => { if (selezionataRef.current?.id === id) setMessaggi(m); })
      .catch(() => { /* il giro successivo riprova; l'errore resta nella lista */ });
  }

  // Aggiornamento automatico — sia la lista (per vedere subito nuove
  // conversazioni/messaggi non letti) sia la chat aperta al momento
  // (per vedere le risposte del cliente senza dover ricaricare).
  useEffect(() => {
    const id = setInterval(() => {
      ricaricaLista();
      const attuale = selezionataRef.current;
      if (attuale) caricaMessaggi(attuale.id);
    }, INTERVALLO_AGGIORNAMENTO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStato]);

  function apri(c: Conversazione) {
    selezionataRef.current = c;
    setSelezionata(c);
    setMessaggi([]);
    setTesto('');
    caricaMessaggi(c.id);
    if (c.nonLetti > 0) chatApi.segnaLetti(c.id).then(ricaricaLista).catch(() => {});
  }

  async function invia() {
    // Un secondo Invio mentre la risposta parte non la manda due volte.
    if (!testo.trim() || !selezionata || inviando) return;
    setInviando(true);
    try {
      await chatApi.rispondi(selezionata.id, testo);
      setTesto('');
      caricaMessaggi(selezionata.id);
      ricaricaLista();
    } catch (e) {
      notifica(`Risposta non inviata: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInviando(false);
    }
  }

  async function chiudi() {
    if (!selezionata) return;
    const ok = await conferma({
      titolo: `Chiudere la conversazione con ${selezionata.clienteNome}?`,
      testo: 'Se il cliente scrive di nuovo se ne apre una nuova; questa resta consultabile nello storico.',
      conferma: 'Chiudi conversazione',
    });
    if (!ok) return;
    const id = selezionata.id;
    try {
      await chatApi.chiudi(id);
      setSelezionata((s) => s && s.id === id ? { ...s, stato: 'CHIUSA' } : s);
      ricaricaLista();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }
  async function riapri() {
    if (!selezionata) return;
    const id = selezionata.id;
    try {
      await chatApi.riapri(id);
      setSelezionata((s) => s && s.id === id ? { ...s, stato: 'IN_CORSO' } : s);
      ricaricaLista();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
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
          {erroreLista && <p className="avviso avviso-errore" role="alert">Conversazioni non caricate: {erroreLista}</p>}
          {conversazioni === null && !erroreLista && <p className="testo-intro">Carico…</p>}
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
                <b style={{ fontSize: 'var(--testo-base)' }}>{c.clienteNome}</b>
                {c.nonLetti > 0 && <span style={{ background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 'var(--testo-2xs)', padding: '1px 7px' }}>{c.nonLetti}</span>}
              </div>
              <div style={{ fontSize: 'var(--testo-sm)', opacity: .75 }}>{c.eventoArtista}</div>
              <div style={{ fontSize: 'var(--testo-xs)', opacity: .6, marginTop: 2 }}>{ETICHETTA_STATO[c.stato].testo} · {formattaDataOra(c.ultimoMessaggioIl)}</div>
            </button>
          ))}
        </div>

        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!selezionata && <div style={{ margin: 'auto', color: 'var(--mist)' }}>Scegli una conversazione dall'elenco.</div>}
          {selezionata && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <b>{selezionata.clienteNome}</b> <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>· {selezionata.eventoArtista}</span>
                  <div style={{ fontSize: 'var(--testo-xs)' }}><span className={`badge ${ETICHETTA_STATO[selezionata.stato].classe}`}>{ETICHETTA_STATO[selezionata.stato].testo}</span></div>
                </div>
                {selezionata.stato === 'CHIUSA'
                  ? <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)' }} onClick={riapri}>Riapri</button>
                  : <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)' }} onClick={chiudi}>Chiudi conversazione</button>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messaggi.map((m) => (
                  <div key={m.id} style={{
                    maxWidth: '75%', padding: '9px 13px', borderRadius: 12, fontSize: 'var(--testo-base)',
                    alignSelf: m.autore === 'ADMIN' ? 'flex-end' : 'flex-start',
                    background: m.autore === 'ADMIN' ? 'var(--pink)' : 'var(--night)',
                    color: m.autore === 'ADMIN' ? '#fff' : 'var(--paper)',
                  }}>
                    {m.testo}
                    <div style={{ fontSize: 'var(--testo-2xs)', opacity: .7, marginTop: 4 }}>{m.nome} · {formattaDataOra(m.creatoIl)}</div>
                  </div>
                ))}
              </div>
              {selezionata.stato !== 'CHIUSA' && (
                <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
                  <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi una risposta…"
                    onKeyDown={(e) => e.key === 'Enter' && invia()}
                    style={{ flex: 1, minWidth: 0, background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--paper)' }} />
                  <button className="btn btn-primary" style={{ flexShrink: 0, padding: '10px 18px' }} onClick={invia} disabled={inviando}>{inviando ? 'Invio…' : 'Invia'}</button>
                </div>
              )}
              {selezionata.stato === 'CHIUSA' && (
                <p style={{ padding: 12, textAlign: 'center', color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>
                  Conversazione chiusa: riapri per rispondere ancora.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
