import { useEffect, useState } from 'react';
import { prenotazioniAdminApi, type PrenotazioneRiga, type EventoConPrenotazioni } from '../../api/prenotazioniAdmin';
import { PanelHead } from '../shared/PanelHead';
import { Modale } from '../shared/Modale';

export function PagamentiScreen() {
  const [righe, setRighe] = useState<PrenotazioneRiga[]>([]);
  const [eventi, setEventi] = useState<EventoConPrenotazioni[]>([]);
  const [eventoSelezionatoId, setEventoSelezionatoId] = useState<string | null>(null);
  const [dettaglioAcconti, setDettaglioAcconti] = useState(false);
  const [inviandoSollecito, setInviandoSollecito] = useState<string | null>(null);

  function ricarica() {
    prenotazioniAdminApi.listAll().then(setRighe);
    prenotazioniAdminApi.eventiConPrenotazioni().then(setEventi);
  }
  useEffect(ricarica, []);

  const confermate = righe.filter((r) => r.stato === 'CONFERMATA');
  const incassoTotale = confermate.reduce((s, r) => s + Number(r.totale), 0);
  const perMetodo = confermate.reduce<Record<string, number>>((acc, r) => {
    acc[r.metodoPagamento] = (acc[r.metodoPagamento] ?? 0) + Number(r.totale);
    return acc;
  }, {});
  const inAttesaSaldo = confermate.filter((r) => r.tipoPagamento === 'ACCONTO' && !r.saldoPagato);

  const eventoSelezionato = eventi.find((e) => e.id === eventoSelezionatoId) ?? null;
  const righeEvento = eventoSelezionatoId ? confermate.filter((r) => r.eventoId === eventoSelezionatoId) : [];
  const incassoEvento = righeEvento.reduce((s, r) => s + Number(r.totale), 0);
  const accontiEvento = righeEvento.filter((r) => r.tipoPagamento === 'ACCONTO' && !r.saldoPagato);

  async function sollecita(pnr: string) {
    setInviandoSollecito(pnr);
    try {
      const { inviata } = await prenotazioniAdminApi.inviaSollecito(pnr);
      alert(inviata ? `Sollecito inviato per ${pnr}.` : `Non è stato possibile inviare l'email per ${pnr} (controlla la configurazione email).`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Invio non riuscito.');
    } finally {
      setInviandoSollecito(null);
    }
  }

  return (
    <div>
      <PanelHead titolo="Pagamenti" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 24 }}>€{incassoTotale.toFixed(2)}</div>
          <div style={{ color: 'var(--mist)', fontSize: 12 }}>Incassato totale</div>
        </div>
        <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 24 }}>{inAttesaSaldo.length}</div>
          <div style={{ color: 'var(--mist)', fontSize: 12 }}>Acconti in attesa di saldo (tutti gli eventi)</div>
        </div>
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Incassi per metodo di pagamento</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480, marginBottom: 24 }}>
        {Object.entries(perMetodo).map(([metodo, importo]) => (
          <div key={metodo} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', fontSize: 13.5 }}>
            <span>{metodo}</span><span>€{importo.toFixed(2)}</span>
          </div>
        ))}
        {!Object.keys(perMetodo).length && <p style={{ color: 'var(--mist)' }}>Nessun pagamento registrato ancora.</p>}
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Suddivisione per evento</h3>
      <div className="mini-tabs" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
        {eventi.map((ev) => (
          <button key={ev.id} type="button" className={`mini-tab${eventoSelezionatoId === ev.id ? ' active' : ''}`} onClick={() => { setEventoSelezionatoId(ev.id); setDettaglioAcconti(false); }}>
            {ev.artista}
          </button>
        ))}
        {eventi.length === 0 && <p className="testo-intro">Nessun evento con prenotazioni ancora.</p>}
      </div>

      {eventoSelezionato && (
        <>
          <p className="testo-intro" style={{ marginTop: -8, marginBottom: 16 }}>
            {eventoSelezionato.luogo}, {eventoSelezionato.citta} · {new Date(eventoSelezionato.data).toLocaleDateString('it-IT')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 24 }}>€{incassoEvento.toFixed(2)}</div>
              <div style={{ color: 'var(--mist)', fontSize: 12 }}>Incassato per questo evento</div>
            </div>
            <button
              type="button"
              onClick={() => setDettaglioAcconti(true)}
              disabled={accontiEvento.length === 0}
              style={{ textAlign: 'left', background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, cursor: accontiEvento.length > 0 ? 'pointer' : 'default' }}
            >
              <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 24, color: accontiEvento.length > 0 ? 'var(--amber)' : undefined }}>{accontiEvento.length}</div>
              <div style={{ color: 'var(--mist)', fontSize: 12 }}>Acconti in attesa di saldo {accontiEvento.length > 0 ? '— clicca per i dettagli' : ''}</div>
            </button>
          </div>
        </>
      )}

      {dettaglioAcconti && eventoSelezionato && (
        <Modale titolo={`Acconti in attesa — ${eventoSelezionato.artista}`} onClose={() => setDettaglioAcconti(false)} larga>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PNR</th>
                  <th>Cliente</th>
                  <th>Prenotato il</th>
                  <th>Scadenza saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accontiEvento.map((r) => (
                  <tr key={r.id}>
                    <td>{r.pnr}</td>
                    <td>{r.clienteNome} {r.clienteCognome ?? ''}<br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{r.clienteEmail}</span></td>
                    <td>{new Date(r.creataIl).toLocaleDateString('it-IT')}</td>
                    <td>{r.scadenzaSaldo ? new Date(r.scadenzaSaldo).toLocaleDateString('it-IT') : '—'}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} disabled={inviandoSollecito === r.pnr} onClick={() => sollecita(r.pnr)}>
                        {inviandoSollecito === r.pnr ? 'Invio...' : 'Invia sollecito'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modale>
      )}
    </div>
  );
}
