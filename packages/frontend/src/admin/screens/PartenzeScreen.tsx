import { useEffect, useState } from 'react';
import { eventiApi } from '../../api/eventi';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { EventoCardCompatta } from '../shared/EventoCardCompatta';
import { SchedaEventoModale } from './eventi/SchedaEventoModale';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useNavigazione } from '../shared/NavigazioneContext';
import { useMappaTooltip } from '../shared/useMappaTooltip';
import { notifica } from '../shared/notifiche';
import { motivoErrore } from '../shared/errori';
import { plurale } from '../../shared/formato';

import { TITOLI_PARTENZE, SEZIONE_PARTENZE, type TabPartenze, type AzionePartenze } from './partenze/tipi';
import { COLORE_LIVELLO, statoCard, statoInTappa, tappeDi, type Partenza } from './partenze/statiPartenze';
export type { TabPartenze } from './partenze/tipi';

const CHIAVE_TOOLTIP: Record<TabPartenze, string> = {
  fermate: 'partenze_orari_intro', preventivi: 'partenze_preventivi_intro', 'da-prezzare': 'partenze_prezzi_intro',
  'da-confermare': 'partenze_da_confermare_intro', confermato: 'partenze_confermate_intro', passate: 'partenze_passate_intro',
};

const MESSAGGIO_VUOTO: Record<TabPartenze, string> = {
  fermate: 'Nessun evento con tragitti in programma, al momento.',
  preventivi: 'Nessun evento pronto per un preventivo: prima vanno calcolati gli orari.',
  'da-prezzare': 'Nessun evento da prezzare: prima serve un preventivo registrato.',
  'da-confermare': 'Nessun evento in attesa di bus, al momento.',
  confermato: 'Nessun evento confermato, al momento.',
  passate: 'Nessun evento passato ancora.',
};

/**
 * Le sei tappe del flusso Orari → Preventivi → Prezzi → Da confermare →
 * Confermate | Passate, ognuna una voce separata nel menu a sinistra
 * (sotto "Partenze"): si vedono distinte, niente barra di tab da
 * cliccare dentro la pagina.
 *
 * Un tragitto qui vive SEMPRE finché l'evento non è passato — un
 * compito fatto in una tappa non lo fa sparire dalle altre, resta
 * sempre raggiungibile per rivederlo. Le card degli eventi restano
 * sempre visibili mentre ci si lavora: contorno rosso se in QUESTA tappa
 * tocca a noi fare qualcosa, arancio se si aspetta qualcun altro, verde se
 * è già a posto, viola se il percorso è cambiato (statiPartenze.ts).
 *
 * - "Orari": si calcolano gli orari di ogni fermata e si esporta
 *   l'elenco da mandare ai fornitori.
 * - "Preventivi": si chiede o si registra il costo del fornitore.
 * - "Prezzi": dal costo si decide il prezzo di vendita per ogni fermata.
 * - "Da confermare": già in vendita — qui si aggiungono le linee (bus veri).
 * - "Confermate": un insieme A PARTE — ci entra SOLO chi ha avuto
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
  const [selezionato, setSelezionato] = useState<{ evento: Evento; tragittiIds: string[]; azione: AzionePartenze; tabOrigine: TabPartenze } | null>(null);

  const naviga = useNavigazione();
  const [ricerca, setRicerca] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  // "Carico…" solo al primo caricamento: i ricaricamenti successivi
  // (cambio tappa, ritorno sulla finestra, salvataggi) aggiornano le card
  // già visibili invece di farle sparire e ricomparire ogni volta.
  function ricarica() {
    Promise.all([eventiApi.list(), eventiApi.elencoPartenze()])
      .then(([e, p]) => { setEventi(e); setPartenze(p); setErrore(''); })
      .catch((e) => setErrore(`Impossibile caricare le partenze: ${motivoErrore(e)}`))
      .finally(() => setCaricamento(false));
  }
  // Ricarico anche cambiando tappa (arrivando da un'altra voce di
  // menu) — ognuna è una sezione a sé, non un semplice cambio di stato
  // dentro la stessa schermata già montata.
  useEffect(ricarica, [tab]);
  // Se elimini/modifichi un evento da un'altra scheda o finestra del
  // browser, questa lista non se ne accorgerebbe da sola finché non la
  // ricarichi a mano — aggiorno automaticamente quando la finestra
  // riprende il focus.
  useEffect(() => {
    window.addEventListener('focus', ricarica);
    return () => window.removeEventListener('focus', ricarica);
  }, []);

  // Voci, stati e colori stanno in statiPartenze.ts: gli stessi della pagina
  // del tragitto e dei pallini del menu.
  const partenzePerTab = partenze.filter((p) => tappeDi(p).includes(tab));
  // Raggruppo per evento — un evento con più tragitti/servizi in
  // questa tappa diventa UNA sola card.
  const eventiRaggruppati = new Map<string, Partenza[]>();
  for (const p of partenzePerTab) {
    const lista = eventiRaggruppati.get(p.evento.id) ?? [];
    lista.push(p);
    eventiRaggruppati.set(p.evento.id, lista);
  }
  const cardsGrezze = [...eventiRaggruppati.values()];
  const cardsCercate = ricerca.trim()
    ? cardsGrezze.filter((gruppo) => `${gruppo[0].evento.artista} ${gruppo[0].evento.citta} ${gruppo[0].evento.luogo}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : cardsGrezze;
  // In Preventivi le card viola (percorso cambiato, preventivo da rifare)
  // vanno in cima: sono le più urgenti.
  const cardsFiltrate = tab === 'preventivi'
    ? [...cardsCercate].sort((a, b) => Number(b.some((p) => p.cambioPercorso)) - Number(a.some((p) => p.cambioPercorso)))
    : cardsCercate;

  // Sempre un fetch fresco dal server, non l'oggetto già in memoria —
  // quella lista potrebbe non riflettere l'ultimo stato vero.
  async function apriGruppo(gruppo: Partenza[]) {
    const azione: 'fermate' | 'preventivo' | 'espandi' =
      tab === 'fermate' ? 'fermate' : tab === 'da-prezzare' ? 'preventivo' : 'espandi';
    const tragittiIds = gruppo.map((p) => p.tragittoId);
    const eventoId = gruppo[0].evento.id;
    const eventoInMemoria = eventi.find((ev) => ev.id === eventoId);
    naviga(SEZIONE_PARTENZE[tab] as never, { eventoId, tragittiIds: tragittiIds.join(',') });
    if (eventoInMemoria) setSelezionato({ evento: eventoInMemoria, tragittiIds, azione, tabOrigine: tab }); // subito, non far vedere niente mentre carica
    try {
      const fresco = await eventiApi.getById(eventoId);
      setSelezionato({ evento: fresco, tragittiIds, azione, tabOrigine: tab });
    } catch (e) {
      // Se c'era già in memoria resta quella versione; se no, niente da
      // aprire: meglio dirlo che non reagire al clic.
      if (!eventoInMemoria) notifica(`Apertura dell'evento non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  // All'avvio (anche dopo un ricaricamento), se l'URL ha già eventoId e
  // tragittiIds riapro da sola lo stesso gruppo — stesso fetch di
  // apriGruppo, innescato dall'URL invece che da un clic. "eventi" deve
  // essere già arrivato (elencoPartenze), altrimenti aspetto il giro dopo.
  useEffect(() => {
    if (selezionato || eventi.length === 0) return;
    const url = new URLSearchParams(window.location.search);
    const eventoId = url.get('eventoId');
    const tragittiIdsUrl = url.get('tragittiIds');
    if (!eventoId || !tragittiIdsUrl) return;
    const gruppo = partenze.filter((p) => p.evento.id === eventoId && tragittiIdsUrl.split(',').includes(p.tragittoId));
    if (gruppo.length > 0) apriGruppo(gruppo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventi, partenze]);

  if (selezionato) {
    return (
      <SchedaEventoModale
        evento={selezionato.evento}
        tabIniziale="partenze"
        soloQuestaTab
        contestoPartenze={{ tragittiIds: selezionato.tragittiIds, azione: selezionato.azione, tabOrigine: selezionato.tabOrigine }}
        // Tornando all'elenco le card devono già mostrare quello che si è
        // appena fatto dentro (prima restavano "Da richiedere" o "Serve
        // una linea" finché la finestra non perdeva e riprendeva il focus).
        onClose={() => { setSelezionato(null); naviga(SEZIONE_PARTENZE[tab] as never, { eventoId: null, tragittiIds: null }); ricarica(); }}
        onSalvato={ricarica}
      />
    );
  }

  return (
    <div>
      <PanelHead titolo={TITOLI_PARTENZE[tab]} info={mappaTooltip[CHIAVE_TOOLTIP[tab]] ?? TOOLTIP_DEFAULT[CHIAVE_TOOLTIP[tab]]} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per artista, città o luogo…" />

      {caricamento ? (
        <p className="testo-intro">Carico…</p>
      ) : errore && partenze.length === 0 ? (
        <div>
          <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>
          <button type="button" className="btn btn-ghost" onClick={ricarica}>Riprova</button>
        </div>
      ) : (
        <div className="cards-list">
          {cardsFiltrate.map((gruppo) => {
            // Passate: solo archivio, nessuno stato e nessun contorno.
            const stati = gruppo.map((p) => statoInTappa(p, tab)).filter((s): s is NonNullable<typeof s> => s !== null);
            // Il colore è quello del tragitto messo peggio (rosso se ce n'è
            // uno da fare, anche se gli altri sono pronti).
            const card = statoCard(stati);
            // Contano i posti dei bus confermati: quelli in vendita sono
            // sempre "quasi illimitati", mai "2/999999 posti".
            const passeggeri = gruppo.reduce((s, p) => s + p.totalePasseggeri, 0);
            const senzaBus = gruppo.filter((p) => p.postiSuiBus === 0).length;
            const posti = gruppo.reduce((s, p) => s + p.postiSuiBus, 0);
            const testoPosti = senzaBus === gruppo.length
              ? `${plurale(passeggeri, 'passeggero', 'passeggeri')} · nessun bus`
              : `${passeggeri}/${posti} posti${senzaBus > 0 ? ` · ${senzaBus} senza bus` : ''}`;
            // Viola, sopra ogni altro stato: in Preventivi la card intera
            // (statoInTappa), nelle altre voci una nota.
            const cambiati = tab !== 'passate' && tab !== 'preventivi' ? gruppo.filter((p) => p.cambioPercorso) : [];
            return (
              <EventoCardCompatta
                key={gruppo[0].evento.id}
                evento={gruppo[0].evento}
                onClick={() => apriGruppo(gruppo)}
                percorsoCambiato={card.livello === 'percorso-cambiato'}
                richiedeIntervento={card.livello === 'da-fare'}
                inAttesa={card.livello === 'attesa'}
                completata={card.livello === 'fatto'}
                badge={card.testo}
                badgeColore={card.livello ? COLORE_LIVELLO[card.livello] : undefined}
                extra={
                  <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', marginTop: 2 }}>
                    {plurale(gruppo.length, 'tragitto', 'tragitti')}
                    {(tab === 'da-confermare' || tab === 'confermato') && ` · ${testoPosti}`}
                    {cambiati.length > 0 && <span style={{ color: 'var(--viola)', fontWeight: 600 }}> · percorso cambiato</span>}
                  </p>
                }
              />
            );
          })}
          {!cardsFiltrate.length && (
            <p className="testo-intro">{ricerca.trim() ? 'Nessun evento trovato.' : MESSAGGIO_VUOTO[tab]}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Esportate già "pronte" con la tappa fissata, così AdminApp.tsx può
// collegare ciascuna voce di menu a un componente senza props — la
// stessa identica schermata sopra, solo con davanti già scelto quale
// delle sei tappe mostrare.
export const PartenzeOrariScreen = () => <PartenzeScreen tab="fermate" />;
export const PartenzePreventiviScreen = () => <PartenzeScreen tab="preventivi" />;
export const PartenzePrezziScreen = () => <PartenzeScreen tab="da-prezzare" />;
export const PartenzeDaConfermareScreen = () => <PartenzeScreen tab="da-confermare" />;
export const PartenzeConfermatoScreen = () => <PartenzeScreen tab="confermato" />;
export const PartenzePassateScreen = () => <PartenzeScreen tab="passate" />;
