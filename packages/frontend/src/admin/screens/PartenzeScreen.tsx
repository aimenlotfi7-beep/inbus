import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

type Tab = 'prezzato' | 'da-confermare' | 'confermato' | 'passate';
type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

/**
 * Sezione Partenze — una card per ogni PARTENZA (tragitto), non più per
 * evento intero: un evento a più servizi (Andata/Ritorno) ha una card
 * per ciascuno, dato che ognuno vive per conto suo (stato, preventivo,
 * posti tutti indipendenti). Le card si raggruppano da sole nei 4 stati
 * — nessuno stato da segnare a mano, gira tutto sui dati veri:
 *
 * - "Prezzato": preventivo registrato, già in vendita, bus vero ancora
 *   da opzionare
 * - "Da confermare": nessun preventivo ancora, non in vendita
 * - "Confermato": bus vero registrato (almeno una Linea)
 * - "Passate": la data dell'evento è già passata, qualunque fosse lo
 *   stato — qui si trova sempre tutta la storia, anche se non era mai
 *   arrivata a "Confermato"
 *
 * Un evento passato vive SEMPRE e SOLO in "Passate", mai nelle altre
 * tre, anche se il suo stato tecnico sarebbe ancora "Da confermare" —
 * un evento già svolto non ha più senso lavorarlo.
 *
 * Cliccando una card si apre la scheda dell'evento già sulla tab
 * Partenze, con quel tragitto specifico già aperto e (per Prezzato/Da
 * confermare) il pannello preventivo già pronto — non serve
 * ritrovarlo in mezzo agli altri.
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [partenze, setPartenze] = useState<Partenza[]>([]);
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittoId: string; azione: 'preventivo' | 'espandi' } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [tab, setTab] = useState<Tab>('da-confermare');
  const [caricamento, setCaricamento] = useState(true);

  function ricarica() {
    setCaricamento(true);
    Promise.all([eventiApi.list(), eventiApi.elencoPartenze()])
      .then(([e, p]) => { setEventi(e); setPartenze(p); })
      .finally(() => setCaricamento(false));
  }
  useEffect(ricarica, []);
  // Se elimini/modifichi un evento da un'altra scheda o finestra del
  // browser, questa lista non se ne accorgerebbe da sola finché non la
  // ricarichi a mano — aggiorno automaticamente quando la finestra
  // riprende il focus.
  useEffect(() => {
    window.addEventListener('focus', ricarica);
    return () => window.removeEventListener('focus', ricarica);
  }, []);

  const adesso = Date.now();
  function passata(p: Partenza) {
    return new Date(p.evento.data).getTime() < adesso;
  }
  function tabDi(p: Partenza): Tab {
    if (passata(p)) return 'passate';
    if (p.stato === 'DA_CONFERMARE') return 'da-confermare';
    if (p.stato === 'PREZZATO') return 'prezzato';
    return 'confermato';
  }
  // Notifica solo dove ha senso agire: posti superati (Prezzato o
  // Confermato — a Prezzato può capitare, essendo già in vendita anche
  // senza un bus vero ancora). "Da confermare" non ha bisogno di un
  // conteggio: ESSERE in quella tab è già di per sé la notifica (non
  // c'è ancora nessun preventivo). "Passate" è solo storico, nessuna
  // azione richiesta lì.
  function notifica(p: Partenza): number {
    const tabAttuale = tabDi(p);
    if (tabAttuale === 'prezzato' || tabAttuale === 'confermato') {
      return p.totalePasseggeri > p.postiTotali ? p.totalePasseggeri - p.postiTotali : 0;
    }
    return 0;
  }

  const partenzePerTab = partenze.filter((p) => tabDi(p) === tab);
  const partenzeFiltrate = ricerca.trim()
    ? partenzePerTab.filter((p) => `${p.evento.artista} ${p.evento.citta} ${p.evento.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : partenzePerTab;

  // Sempre un fetch fresco dal server, non l'oggetto già in memoria —
  // quella lista potrebbe non riflettere l'ultimo stato vero.
  async function apriPartenza(p: Partenza) {
    const azione: 'preventivo' | 'espandi' = (tab === 'prezzato' || tab === 'da-confermare') ? 'preventivo' : 'espandi';
    const eventoInMemoria = eventi.find((ev) => ev.id === p.evento.id);
    if (eventoInMemoria) setSelezionato({ evento: eventoInMemoria, tragittoId: p.tragittoId, azione }); // subito, non far vedere niente mentre carica
    try {
      const fresco = await eventiApi.getById(p.evento.id);
      setSelezionato({ evento: fresco, tragittoId: p.tragittoId, azione });
    } catch {
      // Se il fetch fallisce, resta la versione già in memoria (se c'era).
    }
  }

  if (selezionato) {
    return (
      <SchedaEventoModale
        evento={selezionato.evento}
        tabIniziale="partenze"
        soloQuestaTab
        tragittoFocus={{ tragittoId: selezionato.tragittoId, azione: selezionato.azione }}
        onClose={() => setSelezionato(null)}
        onSalvato={ricarica}
      />
    );
  }

  const ETICHETTE: Record<Tab, string> = {
    prezzato: 'Prezzato',
    'da-confermare': 'Da confermare',
    confermato: 'Confermato',
    passate: 'Passate',
  };

  return (
    <div>
      <PanelHead titolo="Partenze" />
      <p className="testo-intro">Ogni card è una partenza (un tragitto) — un evento a più servizi ne ha una per ciascuno.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="mini-tabs" style={{ justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {(['prezzato', 'da-confermare', 'confermato', 'passate'] as Tab[]).map((t) => {
          const conteggio = partenze.filter((p) => tabDi(p) === t).length;
          return (
            <button key={t} type="button" className={`mini-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {ETICHETTE[t]}{conteggio > 0 ? ` (${conteggio})` : ''}
            </button>
          );
        })}
      </div>

      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Caricamento...</p>
      ) : (
        <div className="cards-list">
          {partenzeFiltrate.map((p) => {
            const conta = notifica(p);
            return (
              <EventoCardCompatta
                key={p.tragittoId}
                evento={p.evento}
                onClick={() => apriPartenza(p)}
                richiedeIntervento={conta > 0}
                badge={conta > 0 ? <>⚠ {conta}</> : undefined}
                extra={
                  <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 2 }}>
                    {p.tragittoNome}{p.servizioNome ? ` · ${p.servizioNome}` : ''}
                    {tab !== 'da-confermare' && ` · ${p.totalePasseggeri}/${p.postiTotali} posti`}
                    {tab === 'prezzato' && p.preventivoCosto && ` · preventivo €${Number(p.preventivoCosto).toFixed(0)}`}
                  </p>
                }
              />
            );
          })}
          {!partenzeFiltrate.length && (
            <p style={{ color: 'var(--mist)' }}>
              {ricerca ? 'Nessuna partenza trovata.'
                : tab === 'prezzato' ? 'Nessuna partenza prezzata al momento.'
                : tab === 'da-confermare' ? 'Nessuna partenza da confermare al momento.'
                : tab === 'confermato' ? 'Nessuna partenza confermata al momento.'
                : 'Nessun evento passato ancora.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
