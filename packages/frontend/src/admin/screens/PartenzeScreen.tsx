import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';
import { useNavigazione } from '../shared/NavigazioneContext';

type Tab = 'da-confermare' | 'confermato' | 'passate';
type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

/**
 * Sezione Partenze — lavoro OPERATIVO puro (costruire i bus veri,
 * seguire le partenze): la parte commerciale (orari, preventivi,
 * prezzi) vive ora nella sezione separata "Preventivi" — vedi lì per
 * il perché della divisione (due lavori diversi, spesso persone
 * diverse). Un tragitto entra qui SOLO da quando ha già un preventivo
 * registrato (prezzato) — prima di allora vive solo in "Preventivi".
 *
 * Una card per EVENTO (non più per tragitto): un evento con più
 * servizi/tragitti conta come UNA card, che può però comparire in PIÙ
 * tab insieme se le sue parti sono in stati diversi.
 *
 * - "Linee Bus": preventivo fatto, già in vendita — qui si aggiungono
 *   le Linee (bus veri) direttamente. Persistente: un tragitto ci
 *   resta SEMPRE una volta prezzato, anche dopo essere stato
 *   confermato del tutto (etichetta verde "✓ Confermata", contorno
 *   verde) — non sparisce più da qui, per poter sempre tornare a
 *   vedere/aggiungere capienza.
 * - "Confermato": un insieme A PARTE, deciso così esplicitamente — ci
 *   entra SOLO chi ha avuto almeno una volta un bus vero registrato
 *   (stato interno "CONFERMATO", che una volta raggiunto non torna mai
 *   indietro da solo). Contorno verde se la capienza basta ancora,
 *   rosso con l'avviso "posti mancanti" se sono arrivate più
 *   prenotazioni di quante i bus già registrati ne coprano.
 * - "Passate": la data dell'evento è già passata, qualunque fosse lo
 *   stato — qui si trova sempre tutta la storia. Resta un semplice
 *   archivio, mai un'etichetta di stato né un contorno colorato.
 *
 * Un evento passato vive SEMPRE e SOLO in "Passate", mai nelle altre.
 */
export function PartenzeScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [partenze, setPartenze] = useState<Partenza[]>([]);
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittiIds: string[]; azione: 'fermate' | 'preventivo' | 'linee' | 'espandi'; tabOrigine: 'fermate' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate' } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const TAB_VALIDE: Tab[] = ['da-confermare', 'confermato', 'passate'];
  const tabDaUrl = new URLSearchParams(window.location.search).get('partenzeTab') as Tab | null;
  const [tab, setTab] = useState<Tab>(tabDaUrl && TAB_VALIDE.includes(tabDaUrl) ? tabDaUrl : 'da-confermare');
  const [caricamento, setCaricamento] = useState(true);
  const navigaSezione = useNavigazione();

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
  function tabsDi(p: Partenza): Tab[] {
    if (passata(p)) return ['passate'];
    // Un tragitto ancora "Da confermare" (senza preventivo) non entra
    // in NESSUNA di queste tab — vive solo in "Preventivi", finché non
    // viene prezzato.
    if (p.stato === 'DA_CONFERMARE') return [];
    if (p.stato === 'PREZZATO') return ['da-confermare'];
    // "Confermato" resta un insieme A PARTE — vedi commento in cima al
    // file.
    return ['da-confermare', 'confermato'];
  }
  // Se il compito di QUESTA tab specifica è già stato fatto per questo
  // tragitto — "Passate" non ce l'ha, resta solo archivio.
  function fattoInTab(p: Partenza, tabAttuale: Tab): boolean {
    if (tabAttuale === 'da-confermare') return p.stato === 'CONFERMATO' && !scoperta(p);
    if (tabAttuale === 'confermato') return !scoperta(p); // qui dentro lo stato è già sempre CONFERMATO, per costruzione
    return false;
  }
  // Etichetta SEMPRE presente per ogni card, verde se il compito di
  // questa tab è fatto, rossa/arancio se manca ancora. "Passate" non
  // ce l'ha — resta un semplice archivio, mai un contorno colorato.
  function etichettaStato(p: Partenza, tabAttuale: Tab): { fatto: boolean; testo: string } {
    if (tabAttuale === 'da-confermare') {
      if (fattoInTab(p, tabAttuale)) return { fatto: true, testo: '✓ Confermata' };
      if (scoperta(p)) return { fatto: false, testo: `⚠ ${p.totalePasseggeri - p.postiTotali} posti mancanti` };
      return { fatto: false, testo: '◔ Serve una Linea' };
    }
    if (tabAttuale === 'confermato') {
      if (scoperta(p)) return { fatto: false, testo: `⚠ ${p.totalePasseggeri - p.postiTotali} posti mancanti` };
      return { fatto: true, testo: '' };
    }
    return { fatto: true, testo: '' }; // Passate: nessuna etichetta di stato, mai contorno
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
    const azione: 'linee' | 'espandi' = tab === 'da-confermare' ? 'linee' : 'espandi';
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
        // La barra con le 5 tab dentro un tragitto ora salta tra DUE
        // schermate diverse (Preventivi e Partenze) — "Orari"/
        // "Prezzo" vivono nell'altra sezione, ci si arriva con lo
        // stesso cambio di sezione interno già usato per Linee↔
        // Partenze.
        onNavigaTab={(t) => {
          if (t === 'da-confermare') { setSelezionato(null); setTab(t); }
          else navigaSezione('preventivi', { preventiviTab: t });
        }}
        onClose={() => setSelezionato(null)}
        onSalvato={ricarica}
      />
    );
  }

  const ETICHETTE: Record<Tab, string> = {
    'da-confermare': 'Linee Bus',
    confermato: 'Confermato',
    passate: 'Passate',
  };

  return (
    <div>
      <PanelHead titolo="Partenze" />
      <p className="testo-intro">Ogni card è un evento — se ha più servizi o percorsi, si aprono dentro.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="mini-tabs" style={{ justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {(['da-confermare', 'confermato', 'passate'] as Tab[]).map((t) => {
          // Solo quanti sono ANCORA da fare in questa tab — resta un
          // indicatore di quanto lavoro manca, non un totale grezzo.
          const daFareInTab = new Set(partenze.filter((p) => tabsDi(p).includes(t) && !fattoInTab(p, t)).map((p) => p.evento.id));
          return (
            <button key={t} type="button" className={`mini-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {ETICHETTE[t]}{daFareInTab.size > 0 ? ` (${daFareInTab.size})` : ''}
            </button>
          );
        })}
      </div>

      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Caricamento...</p>
      ) : (
        <div className="cards-list">
          {cardsFiltrate.map((gruppo) => {
            const stati = gruppo.map((p) => etichettaStato(p, tab));
            const tuttoFatto = stati.every((s) => s.fatto);
            // Se alcuni sono fatti e altri no (evento a più servizi), o
            // se sono tutti da fare ma con etichette diverse (es. un
            // servizio "Serve una Linea" e un altro "posti mancanti"),
            // mostro solo un conteggio generico invece di scegliere a
            // caso quale delle due mostrare.
            const daFare = stati.filter((s) => !s.fatto);
            const etichetteDaFareUniche = [...new Set(daFare.map((s) => s.testo))];
            const nienteDaMostrare = stati.every((s) => !s.testo);
            const testoBadge = nienteDaMostrare ? undefined
              : tuttoFatto ? '✓ Fatto'
              : etichetteDaFareUniche.length === 1 ? etichetteDaFareUniche[0]
              : `${daFare.length} da lavorare`;
            return (
              <EventoCardCompatta
                key={gruppo[0].evento.id}
                evento={gruppo[0].evento}
                onClick={() => apriGruppo(gruppo)}
                richiedeIntervento={tab !== 'passate' && !tuttoFatto}
                completata={tab !== 'passate' && tuttoFatto}
                badge={testoBadge && <span style={{ color: tuttoFatto ? 'var(--green)' : undefined }}>{testoBadge}</span>}
                extra={
                  <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 2 }}>
                    {gruppo.map((p) => p.servizioNome ?? p.tragittoNome).join(', ')}
                    {` · ${gruppo.reduce((s, p) => s + p.totalePasseggeri, 0)}/${gruppo.reduce((s, p) => s + p.postiTotali, 0)} posti`}
                  </p>
                }
              />
            );
          })}
          {!cardsFiltrate.length && (
            <p style={{ color: 'var(--mist)' }}>
              {ricerca ? 'Nessuna partenza trovata.'
                : tab === 'da-confermare' ? 'Nessuna Linea Bus da costruire al momento.'
                : tab === 'confermato' ? 'Nessuna partenza confermata al momento.'
                : 'Nessun evento passato ancora.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
