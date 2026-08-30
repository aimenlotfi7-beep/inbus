import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';

type Tab = 'fermate' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate';
type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

/**
 * Sezione Partenze — una card per EVENTO (non più per tragitto): un
 * evento con più servizi/tragitti conta come UNA card, che può però
 * comparire in PIÙ tab insieme se le sue parti sono in stati diversi
 * (es. "Andata" già Confermata, "Ritorno" ancora Da prezzare — la
 * card compare sia in "Da prezzare" che in "Confermato", ma ogni
 * "copia" apre una vista filtrata solo sulla parte rilevante per
 * quella tab, non tutto l'evento insieme).
 *
 * - "Fermate": nessun preventivo ancora — qui si calcolano gli orari
 *   di ogni fermata e si esporta l'elenco (CSV/PDF) da mandare al
 *   fornitore per farsi fare il preventivo. Un tragitto qui vive
 *   SEMPRE anche in "Da prezzare" insieme — sono due scopi diversi
 *   sullo stesso tragitto, non due stati diversi: prima si esporta,
 *   poi (quando il preventivo torna dal fornitore) si registra.
 * - "Da prezzare": nessun preventivo ancora — qui si applica il
 *   preventivo che è tornato dal fornitore
 * - "Da confermare": preventivo fatto, già in vendita, ma senza ancora
 *   una Linea (bus vero) — qui si aggiungono le Linee direttamente.
 *   Ci finisce ANCHE un tragitto già "Confermato" che è tornato
 *   scoperto perché sono arrivate più prenotazioni di quante ne
 *   coprano i bus già registrati.
 * - "Confermato": almeno una Linea registrata E capienza sufficiente
 * - "Passate": la data dell'evento è già passata, qualunque fosse lo
 *   stato — qui si trova sempre tutta la storia
 *
 * Un evento passato vive SEMPRE e SOLO in "Passate", mai nelle altre.
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [partenze, setPartenze] = useState<Partenza[]>([]);
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittiIds: string[]; azione: 'fermate' | 'preventivo' | 'linee' | 'espandi'; tabOrigine: Tab } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [tab, setTab] = useState<Tab>('fermate');
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
  // Un tragitto può appartenere a PIÙ tab insieme (non solo per il
  // caso "evento con parti in stati diversi", ma anche perché "Fermate"
  // e "Da prezzare" sono due scopi diversi sullo STESSO tragitto — vedi
  // sopra), quindi restituisce un elenco, non una tab sola.
  function tabsDi(p: Partenza): Tab[] {
    if (passata(p)) return ['passate'];
    if (p.stato === 'DA_CONFERMARE') return ['fermate', 'da-prezzare'];
    if (p.stato === 'PREZZATO') return ['da-confermare'];
    // CONFERMATO: resta lì solo se la capienza basta — altrimenti
    // torna in "Da confermare", dove si aggiunge capienza.
    return [scoperta(p) ? 'da-confermare' : 'confermato'];
  }
  // Notifica ovunque ci sia qualcosa da fare. "Confermato" e "Passate"
  // non hanno mai notifiche: la prima è a posto per definizione, la
  // seconda è solo storico.
  function notifica(p: Partenza, tabAttuale: Tab): { conta: boolean; etichetta: string } {
    if (tabAttuale === 'fermate') return { conta: true, etichetta: '◔ Da calcolare/esportare' };
    if (tabAttuale === 'da-prezzare') return { conta: true, etichetta: '◔ Da prezzare' };
    if (tabAttuale === 'da-confermare') {
      if (scoperta(p)) return { conta: true, etichetta: `⚠ ${p.totalePasseggeri - p.postiTotali} posti mancanti` };
      return { conta: true, etichetta: '◔ Serve una Linea' };
    }
    return { conta: false, etichetta: '' };
  }

  const partenzePerTab = partenze.filter((p) => tabsDi(p).includes(tab));
  // Raggruppo per evento — dentro la tab corrente, un evento con più
  // tragitti/servizi qui dentro diventa UNA sola card.
  const eventiRaggruppati = new Map<string, Partenza[]>();
  for (const p of partenzePerTab) {
    const lista = eventiRaggruppati.get(p.evento.id) ?? [];
    lista.push(p);
    eventiRaggruppati.set(p.evento.id, lista);
  }
  const cardsGrezze = [...eventiRaggruppati.values()];
  const cardsFiltrate = ricerca.trim()
    ? cardsGrezze.filter((gruppo) => `${gruppo[0].evento.artista} ${gruppo[0].evento.citta} ${gruppo[0].evento.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : cardsGrezze;

  // Sempre un fetch fresco dal server, non l'oggetto già in memoria —
  // quella lista potrebbe non riflettere l'ultimo stato vero.
  async function apriGruppo(gruppo: Partenza[]) {
    const azione: 'fermate' | 'preventivo' | 'linee' | 'espandi' =
      tab === 'fermate' ? 'fermate' : tab === 'da-prezzare' ? 'preventivo' : tab === 'da-confermare' ? 'linee' : 'espandi';
    const tragittiIds = gruppo.map((p) => p.tragittoId);
    const eventoId = gruppo[0].evento.id;
    const eventoInMemoria = eventi.find((ev) => ev.id === eventoId);
    if (eventoInMemoria) setSelezionato({ evento: eventoInMemoria, tragittiIds, azione, tabOrigine: tab }); // subito, non far vedere niente mentre carica
    try {
      const fresco = await eventiApi.getById(eventoId);
      setSelezionato({ evento: fresco, tragittiIds, azione, tabOrigine: tab });
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
        contestoPartenze={{ tragittiIds: selezionato.tragittiIds, azione: selezionato.azione, tabOrigine: selezionato.tabOrigine }}
        onNavigaTab={(t) => { setSelezionato(null); setTab(t); }}
        onClose={() => setSelezionato(null)}
        onSalvato={ricarica}
      />
    );
  }

  const ETICHETTE: Record<Tab, string> = {
    fermate: 'Fermate',
    'da-prezzare': 'Da prezzare',
    'da-confermare': 'Da confermare',
    confermato: 'Confermato',
    passate: 'Passate',
  };

  return (
    <div>
      <PanelHead titolo="Partenze" />
      <p className="testo-intro">Ogni card è un evento — se ha più servizi o percorsi, si aprono dentro.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="mini-tabs" style={{ justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {(['fermate', 'da-prezzare', 'da-confermare', 'confermato', 'passate'] as Tab[]).map((t) => {
          const eventiInTab = new Set(partenze.filter((p) => tabsDi(p).includes(t)).map((p) => p.evento.id));
          return (
            <button key={t} type="button" className={`mini-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {ETICHETTE[t]}{eventiInTab.size > 0 ? ` (${eventiInTab.size})` : ''}
            </button>
          );
        })}
      </div>

      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Caricamento...</p>
      ) : (
        <div className="cards-list">
          {cardsFiltrate.map((gruppo) => {
            // Se ci sono più voci nel gruppo con la stessa notifica,
            // la mostro una volta sola; se sono diverse (es. un
            // servizio "Serve una Linea" e un altro "posti mancanti"),
            // mostro solo un conteggio generico invece di scegliere a
            // caso quale delle due mostrare.
            const notifiche = gruppo.map((p) => notifica(p, tab)).filter((n) => n.conta);
            const etichetteUniche = [...new Set(notifiche.map((n) => n.etichetta))];
            const etichettaBadge = etichetteUniche.length === 1 ? etichetteUniche[0] : notifiche.length > 0 ? `${notifiche.length} da lavorare` : undefined;
            return (
              <EventoCardCompatta
                key={gruppo[0].evento.id}
                evento={gruppo[0].evento}
                onClick={() => apriGruppo(gruppo)}
                richiedeIntervento={notifiche.length > 0}
                badge={etichettaBadge}
                extra={
                  <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 2 }}>
                    {gruppo.map((p) => p.servizioNome ?? p.tragittoNome).join(', ')}
                    {tab !== 'fermate' && tab !== 'da-prezzare' && ` · ${gruppo.reduce((s, p) => s + p.totalePasseggeri, 0)}/${gruppo.reduce((s, p) => s + p.postiTotali, 0)} posti`}
                  </p>
                }
              />
            );
          })}
          {!cardsFiltrate.length && (
            <p style={{ color: 'var(--mist)' }}>
              {ricerca ? 'Nessuna partenza trovata.'
                : tab === 'fermate' ? 'Nessuna partenza da lavorare qui al momento.'
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
