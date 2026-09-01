import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';
import { useNavigazione } from '../shared/NavigazioneContext';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';

type Tab = 'fermate' | 'da-prezzare';
type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

/**
 * Sezione Preventivi — separata da Partenze (prima erano tab della
 * stessa schermata), perché sono due lavori diversi fatti spesso da
 * persone diverse: qui ci lavora chi tratta con i fornitori e decide
 * i prezzi; "Partenze" (Linee/Confermate/Passate) è invece lavoro
 * operativo puro — costruire i bus veri, seguire le partenze il
 * giorno dell'evento.
 *
 * Un tragitto qui vive SEMPRE (finché l'evento non è passato — a quel
 * punto sparisce anche da qui, non serve più un preventivo per un
 * evento già andato), con un'etichetta indipendente per ognuna delle
 * due tab — un compito fatto non fa sparire il tragitto dall'altra
 * tab né lo fa uscire da qui: resta sempre visibile, per poterlo
 * rivedere in ogni momento.
 *
 * - "Orari": qui si calcolano gli orari di ogni fermata (partenza,
 *   fermate intermedie, arrivo alle due Teste) e si esporta l'elenco
 *   da mandare al fornitore per farsi fare il preventivo.
 * - "Preventivo": qui si registra il costo tornato dal fornitore per
 *   l'intero percorso, e si decide subito il prezzo di vendita per
 *   ogni fermata — un'unica schermata, le due cose si decidono quasi
 *   sempre insieme.
 *
 * Una volta prezzato, il tragitto compare ANCHE in "Partenze" (tab
 * Linee) — da lì in poi si continua a lavorarci, ma resta visibile
 * anche qui.
 */
export function PreventiviScreen() {
  const mappaTooltip = useMappaTooltip();
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [partenze, setPartenze] = useState<Partenza[]>([]);
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittiIds: string[]; azione: 'fermate' | 'preventivo' | 'linee' | 'espandi'; tabOrigine: 'fermate' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate' } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const TAB_VALIDE: Tab[] = ['fermate', 'da-prezzare'];
  const tabDaUrl = new URLSearchParams(window.location.search).get('preventiviTab') as Tab | null;
  const [tab, setTab] = useState<Tab>(tabDaUrl && TAB_VALIDE.includes(tabDaUrl) ? tabDaUrl : 'fermate');
  const [caricamento, setCaricamento] = useState(true);
  const navigaSezione = useNavigazione();

  function ricarica() {
    setCaricamento(true);
    Promise.all([eventiApi.list(), eventiApi.elencoPartenze()])
      .then(([e, p]) => { setEventi(e); setPartenze(p); })
      .finally(() => setCaricamento(false));
  }
  useEffect(ricarica, []);
  useEffect(() => {
    window.addEventListener('focus', ricarica);
    return () => window.removeEventListener('focus', ricarica);
  }, []);

  const adesso = Date.now();
  function passata(p: Partenza) {
    return new Date(p.evento.data).getTime() < adesso;
  }
  // Un tragitto passato non ha più senso da prezzare — sparisce anche
  // da qui (l'archivio storico vive solo in "Partenze").
  function fattoInTab(p: Partenza, tabAttuale: Tab): boolean {
    if (tabAttuale === 'fermate') return p.fermateCompilate;
    return !!p.preventivoCosto;
  }
  function etichettaStato(p: Partenza, tabAttuale: Tab): { fatto: boolean; testo: string } {
    if (tabAttuale === 'fermate') return fattoInTab(p, tabAttuale) ? { fatto: true, testo: '✓ Fatto' } : { fatto: false, testo: '◔ Da calcolare/esportare' };
    return fattoInTab(p, tabAttuale) ? { fatto: true, testo: '✓ Fatto' } : { fatto: false, testo: '◔ Da prezzare' };
  }

  const partenzePerTab = partenze.filter((p) => !passata(p));
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

  async function apriGruppo(gruppo: Partenza[]) {
    const azione: 'fermate' | 'preventivo' = tab === 'fermate' ? 'fermate' : 'preventivo';
    const tragittiIds = gruppo.map((p) => p.tragittoId);
    const eventoId = gruppo[0].evento.id;
    const eventoInMemoria = eventi.find((ev) => ev.id === eventoId);
    if (eventoInMemoria) setSelezionato({ evento: eventoInMemoria, tragittiIds, azione, tabOrigine: tab });
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
        // schermate diverse (Preventivi e Partenze), non più restando
        // sulla stessa — "Orari"/"Preventivo" restano qui, il resto
        // vive in Partenze: stesso meccanismo già usato per Linee↔
        // Partenze, un cambio di sezione interno con la tab di
        // destinazione già pronta, non una nuova navigazione del
        // browser.
        onNavigaTab={(t) => {
          if (t === 'fermate' || t === 'da-prezzare') { setSelezionato(null); setTab(t); }
          else navigaSezione('partenze', { partenzeTab: t });
        }}
        onClose={() => setSelezionato(null)}
        onSalvato={ricarica}
      />
    );
  }

  const ETICHETTE: Record<Tab, string> = { fermate: 'Orari', 'da-prezzare': 'Preventivo' };

  return (
    <div>
      <PanelHead titolo="Preventivi" info={mappaTooltip.preventivi_intro ?? TOOLTIP_DEFAULT.preventivi_intro} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      <div className="mini-tabs" style={{ justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {(['fermate', 'da-prezzare'] as Tab[]).map((t) => {
          const daFareInTab = new Set(partenzePerTab.filter((p) => !fattoInTab(p, t)).map((p) => p.evento.id));
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
            const daFare = stati.filter((s) => !s.fatto);
            const etichetteDaFareUniche = [...new Set(daFare.map((s) => s.testo))];
            const testoBadge = tuttoFatto ? '✓ Fatto'
              : etichetteDaFareUniche.length === 1 ? etichetteDaFareUniche[0]
              : `${daFare.length} da lavorare`;
            return (
              <EventoCardCompatta
                key={gruppo[0].evento.id}
                evento={gruppo[0].evento}
                onClick={() => apriGruppo(gruppo)}
                richiedeIntervento={!tuttoFatto}
                completata={tuttoFatto}
                badge={<span style={{ color: tuttoFatto ? 'var(--green)' : undefined }}>{testoBadge}</span>}
                extra={
                  <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 2 }}>
                    {gruppo.map((p) => p.servizioNome ?? p.tragittoNome).join(', ')}
                  </p>
                }
              />
            );
          })}
          {!cardsFiltrate.length && (
            <p style={{ color: 'var(--mist)' }}>
              {ricerca ? 'Nessuna partenza trovata.'
                : tab === 'fermate' ? 'Nessuna partenza da lavorare per gli orari, al momento.'
                : 'Nessuna partenza da prezzare al momento.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
