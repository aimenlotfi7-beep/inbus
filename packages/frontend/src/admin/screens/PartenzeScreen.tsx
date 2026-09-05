import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';

export type TabPartenze = 'fermate' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate';
type Partenza = Awaited<ReturnType<typeof eventiApi.elencoPartenze>>[number];

const TITOLI: Record<TabPartenze, string> = {
  fermate: 'Orari', 'da-prezzare': 'Prezzi', 'da-confermare': 'Da Confermare', confermato: 'Confermato', passate: 'Passate',
};

/**
 * Le cinque tappe del flusso Orari → Prezzi → Da Confermare →
 * Confermato | Passate — prima divise su due schermate (Preventivi e
 * Partenze) con tab interne, ora CINQUE voci separate nel menu a
 * sinistra (sotto "Partenze"), come richiesto: si vedono distinte,
 * niente più barra di tab da cliccare dentro la pagina.
 *
 * Un tragitto qui vive SEMPRE finché l'evento non è passato — un
 * compito fatto in una tappa non lo fa sparire dalle altre, resta
 * sempre raggiungibile per rivederlo. Le Card degli eventi restano
 * sempre visibili mentre ci si lavora, contorno rosso se manca ancora
 * qualcosa in QUESTA tappa, verde se è già a posto qui — stessa logica
 * di sempre, solo spostata su 5 schermate invece di 2.
 *
 * - "Orari": si calcolano gli orari di ogni fermata e si esporta
 *   l'elenco da mandare al fornitore per farsi fare il preventivo.
 * - "Prezzi": si registra il costo tornato dal fornitore e si decide
 *   il prezzo di vendita per ogni fermata.
 * - "Da Confermare": preventivo fatto, già in vendita — qui si
 *   aggiungono le Linee (bus veri).
 * - "Confermato": un insieme A PARTE — ci entra SOLO chi ha avuto
 *   almeno una volta un bus vero registrato (stato interno che una
 *   volta raggiunto non torna mai indietro da solo).
 * - "Passate": l'evento è già passato, qualunque fosse lo stato —
 *   semplice archivio, mai un'etichetta di stato né un contorno
 *   colorato.
 */
export function PartenzeScreen({ tab }: { tab: TabPartenze }) {
  const mappaTooltip = useMappaTooltip();
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [partenze, setPartenze] = useState<Partenza[]>([]);
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittiIds: string[]; azione: 'fermate' | 'preventivo' | 'linee' | 'espandi'; tabOrigine: TabPartenze } | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [caricamento, setCaricamento] = useState(true);

  function ricarica() {
    setCaricamento(true);
    Promise.all([eventiApi.list(), eventiApi.elencoPartenze()])
      .then(([e, p]) => { setEventi(e); setPartenze(p); })
      .finally(() => setCaricamento(false));
  }
  // Ricarico anche cambiando tappa (arrivando da un'altra voce di
  // menu) — ognuna è ora una sezione a sé, non un semplice cambio di
  // stato dentro la stessa schermata già montata.
  useEffect(ricarica, [tab]);
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
  // A quali tappe appartiene questo tragitto, TUTTE insieme (un
  // tragitto compare in più tappe insieme man mano che avanza — es. in
  // "Da Confermare" e "Confermato" contemporaneamente).
  function tabsDi(p: Partenza): TabPartenze[] {
    if (passata(p)) return ['passate'];
    if (p.stato === 'DA_CONFERMARE') return ['fermate', 'da-prezzare']; // non ancora prezzato, vive solo in Orari/Prezzi
    const risultato: TabPartenze[] = ['fermate', 'da-prezzare', 'da-confermare'];
    if (p.stato !== 'PREZZATO') risultato.push('confermato'); // "Confermato" resta un insieme a parte
    return risultato;
  }
  function fattoInTab(p: Partenza, tabAttuale: TabPartenze): boolean {
    if (tabAttuale === 'fermate') return p.fermateCompilate;
    if (tabAttuale === 'da-prezzare') return !!p.preventivoCosto;
    if (tabAttuale === 'da-confermare') return p.stato === 'CONFERMATO' && !scoperta(p);
    if (tabAttuale === 'confermato') return !scoperta(p); // qui dentro lo stato è già sempre CONFERMATO, per costruzione
    return false; // Passate: mai un contorno
  }
  function etichettaStato(p: Partenza, tabAttuale: TabPartenze): { fatto: boolean; testo: string } {
    if (tabAttuale === 'fermate') return fattoInTab(p, tabAttuale) ? { fatto: true, testo: '✓ Fatto' } : { fatto: false, testo: '◔ Da calcolare/esportare' };
    if (tabAttuale === 'da-prezzare') return fattoInTab(p, tabAttuale) ? { fatto: true, testo: '✓ Fatto' } : { fatto: false, testo: '◔ Da prezzare' };
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
  // Raggruppo per evento — un evento con più tragitti/servizi in
  // questa tappa diventa UNA sola card.
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
        onClose={() => setSelezionato(null)}
        onSalvato={ricarica}
      />
    );
  }

  return (
    <div>
      <PanelHead titolo={TITOLI[tab]} info={(tab === 'fermate' || tab === 'da-prezzare') ? (mappaTooltip.preventivi_intro ?? TOOLTIP_DEFAULT.preventivi_intro) : (mappaTooltip.partenze_intro ?? TOOLTIP_DEFAULT.partenze_intro)} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo..." />

      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Caricamento...</p>
      ) : (
        <div className="cards-list">
          {cardsFiltrate.map((gruppo) => {
            const stati = gruppo.map((p) => etichettaStato(p, tab));
            const tuttoFatto = stati.every((s) => s.fatto);
            const nienteFatto = stati.every((s) => !s.fatto);
            // Un evento con più tragitti insieme (es. andata+ritorno, o
            // più servizi) può avere alcuni già a posto e altri no per
            // questa tappa — né "tutto fatto" né "niente fatto", un
            // terzo stato a parte (giallo) per non confonderlo con
            // nessuno dei due.
            const parziale = !tuttoFatto && !nienteFatto;
            // Se alcuni sono fatti e altri no (evento a più servizi), o
            // se sono tutti da fare ma con etichette diverse, mostro
            // solo un conteggio generico invece di scegliere a caso
            // quale delle due mostrare.
            const daFare = stati.filter((s) => !s.fatto);
            const etichetteDaFareUniche = [...new Set(daFare.map((s) => s.testo))];
            const nienteDaMostrare = stati.every((s) => !s.testo);
            const testoBadge = nienteDaMostrare ? undefined
              : tuttoFatto ? '✓ Fatto'
              : parziale ? `✓ ${stati.length - daFare.length}/${stati.length} pronti`
              : etichetteDaFareUniche.length === 1 ? etichetteDaFareUniche[0]
              : `${daFare.length} da lavorare`;
            return (
              <EventoCardCompatta
                key={gruppo[0].evento.id}
                evento={gruppo[0].evento}
                onClick={() => apriGruppo(gruppo)}
                richiedeIntervento={tab !== 'passate' && nienteFatto}
                parziale={tab !== 'passate' && parziale}
                completata={tab !== 'passate' && tuttoFatto}
                badge={testoBadge && (
                  <span style={{
                    background: tuttoFatto ? 'var(--green)' : parziale ? '#f0b429' : 'var(--pink)',
                    color: '#fff', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  }}>{testoBadge}</span>
                )}
                extra={
                  <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 2 }}>
                    {gruppo.length} tragitt{gruppo.length === 1 ? 'o' : 'i'}
                    {(tab === 'da-confermare' || tab === 'confermato') && ` · ${gruppo.reduce((s, p) => s + p.totalePasseggeri, 0)}/${gruppo.reduce((s, p) => s + p.postiTotali, 0)} posti`}
                  </p>
                }
              />
            );
          })}
          {!cardsFiltrate.length && (
            <p style={{ color: 'var(--mist)' }}>
              {ricerca ? 'Nessuna partenza trovata.'
                : tab === 'fermate' ? 'Nessuna partenza da lavorare per gli orari, al momento.'
                : tab === 'da-prezzare' ? 'Nessuna partenza da prezzare al momento.'
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

// Esportate già "pronte" con la tappa fissata, così AdminApp.tsx può
// collegare ciascuna voce di menu a un componente senza props — la
// stessa identica schermata sopra, solo con davanti già scelto quale
// delle 5 tappe mostrare.
export const PartenzeOrariScreen = () => <PartenzeScreen tab="fermate" />;
export const PartenzePrezziScreen = () => <PartenzeScreen tab="da-prezzare" />;
export const PartenzeDaConfermareScreen = () => <PartenzeScreen tab="da-confermare" />;
export const PartenzeConfermatoScreen = () => <PartenzeScreen tab="confermato" />;
export const PartenzePassateScreen = () => <PartenzeScreen tab="passate" />;
