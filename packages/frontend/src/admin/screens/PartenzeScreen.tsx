import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

type Tab = 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate';
type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

/**
 * Sezione Partenze — una card per ogni PARTENZA (tragitto), non più per
 * evento intero: un evento a più servizi (Andata/Ritorno) ha una card
 * per ciascuno, dato che ognuno vive per conto suo (stato, preventivo,
 * posti tutti indipendenti). Le card si raggruppano da sole nei 4 stati
 * — nessuno stato da segnare a mano, gira tutto sui dati veri:
 *
 * - "Da prezzare": nessun preventivo ancora, non in vendita — qui si
 *   applica il preventivo di partenza
 * - "Da confermare": preventivo fatto, già in vendita, ma senza ancora
 *   una Linea (bus vero) — qui si aggiungono le Linee. Ci finisce
 *   ANCHE un tragitto già "Confermato" che è tornato scoperto perché
 *   sono arrivate più prenotazioni di quante ne coprano i bus già
 *   registrati: la capienza mancante si copre da qui, aggiungendo un
 *   altro bus alla Linea esistente o una Linea nuova.
 * - "Confermato": almeno una Linea registrata E capienza sufficiente
 * - "Passate": la data dell'evento è già passata, qualunque fosse lo
 *   stato — qui si trova sempre tutta la storia, anche se non era mai
 *   arrivata a "Confermato"
 *
 * Un evento passato vive SEMPRE e SOLO in "Passate", mai nelle altre
 * tre, anche se il suo stato tecnico sarebbe ancora "Da prezzare" — un
 * evento già svolto non ha più senso lavorarlo.
 *
 * Cliccando una card si apre la scheda dell'evento già sulla tab
 * Partenze, con quel tragitto specifico già aperto e l'azione giusta
 * già pronta (preventivo, o direttamente la pagina Linee) — non serve
 * ritrovarla in mezzo alle altre.
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [partenze, setPartenze] = useState<Partenza[]>([]);
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittoId: string; azione: 'preventivo' | 'linee' | 'espandi' } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [tab, setTab] = useState<Tab>('da-prezzare');
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
  function scoperta(p: Partenza) {
    return p.totalePasseggeri > p.postiTotali;
  }
  function tabDi(p: Partenza): Tab {
    if (passata(p)) return 'passate';
    if (p.stato === 'DA_CONFERMARE') return 'da-prezzare';
    if (p.stato === 'PREZZATO') return 'da-confermare';
    // CONFERMATO: resta lì solo se la capienza basta — altrimenti
    // torna in "Da confermare", dove si aggiunge capienza.
    return scoperta(p) ? 'da-confermare' : 'confermato';
  }
  // Notifica ovunque ci sia qualcosa da fare — non solo un contatore
  // sulla tab, un indicatore chiaro su ogni singola card. "Confermato"
  // e "Passate" non hanno mai notifiche: la prima è a posto per
  // definizione (altrimenti sarebbe già tornata in "Da confermare"),
  // la seconda è solo storico.
  function notifica(p: Partenza): { conta: boolean; etichetta: string } {
    const tabAttuale = tabDi(p);
    if (tabAttuale === 'da-prezzare') return { conta: true, etichetta: '◔ Da prezzare' };
    if (tabAttuale === 'da-confermare') {
      if (scoperta(p)) return { conta: true, etichetta: `⚠ ${p.totalePasseggeri - p.postiTotali} posti mancanti` };
      return { conta: true, etichetta: '◔ Serve una Linea' };
    }
    return { conta: false, etichetta: '' };
  }

  const partenzePerTab = partenze.filter((p) => tabDi(p) === tab);
  const partenzeFiltrate = ricerca.trim()
    ? partenzePerTab.filter((p) => `${p.evento.artista} ${p.evento.citta} ${p.evento.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : partenzePerTab;

  // Sempre un fetch fresco dal server, non l'oggetto già in memoria —
  // quella lista potrebbe non riflettere l'ultimo stato vero.
  async function apriPartenza(p: Partenza) {
    const azione: 'preventivo' | 'linee' | 'espandi' =
      tab === 'da-prezzare' ? 'preventivo' : tab === 'da-confermare' ? 'linee' : 'espandi';
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
    'da-prezzare': 'Da prezzare',
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
        {(['da-prezzare', 'da-confermare', 'confermato', 'passate'] as Tab[]).map((t) => {
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
            const n = notifica(p);
            return (
              <EventoCardCompatta
                key={p.tragittoId}
                evento={p.evento}
                onClick={() => apriPartenza(p)}
                richiedeIntervento={n.conta}
                badge={n.conta ? <>{n.etichetta}</> : undefined}
                extra={
                  <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 2 }}>
                    {p.tragittoNome}{p.servizioNome ? ` · ${p.servizioNome}` : ''}
                    {tab !== 'da-prezzare' && ` · ${p.totalePasseggeri}/${p.postiTotali} posti`}
                    {tab === 'da-confermare' && p.preventivoCosto && ` · preventivo €${Number(p.preventivoCosto).toFixed(0)}`}
                  </p>
                }
              />
            );
          })}
          {!partenzeFiltrate.length && (
            <p style={{ color: 'var(--mist)' }}>
              {ricerca ? 'Nessuna partenza trovata.'
                : tab === 'da-prezzare' ? 'Nessuna partenza da prezzare al momento.'
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
