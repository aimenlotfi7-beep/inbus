import { useEffect, useState } from 'react';
import { motivoErrore } from '../shared/errori';
import { bundleApi, type BundleRiga } from '../../api/bundle';
import { whiteLabelApi, type EventoDellaWhiteLabel, type StatoEventoWhiteLabel, type WhiteLabel } from '../../api/whiteLabel';
import { organizzatoriApi, type Organizzatore } from '../../api/organizzatori';
import { eventiApi } from '../../api/eventi';
import { prezzoMinimoEvento } from '../../api/prezzi';
import type { Evento } from '../../api/types';
import { notifica } from '../shared/notifiche';
import { conferma } from '../shared/conferma';
import { PanelHead } from '../shared/PanelHead';
import { PaginaSezione } from '../shared/PaginaSezione';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';
import { CampoCopiabile } from '../shared/CampoCopiabile';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../api/layoutBiglietto';
import { WhiteLabelEditor } from '../../features/white-label/WhiteLabelEditor';
import type { DatiCard } from '../../features/white-label/ElencoEventi';
import { formattaData } from '../../shared/formato';

/** Il link di una White Label; con uno slug, quello di un evento solo. */
function linkWidget(publicWidgetId: string, slug?: string) {
  return `${window.location.origin}/w/${publicWidgetId}${slug ? `?evento=${encodeURIComponent(slug)}` : ''}`;
}

/** Il codice da incollare; con uno slug, quello di un evento solo, nel suo
 *  riquadro (così più eventi possono stare nella stessa pagina del cliente). */
function codiceWidget(publicWidgetId: string, slug?: string) {
  const script = `${window.location.origin}/embed.js`;
  if (!slug) return `<div id="inbus-widget"></div>\n<script src="${script}" data-inbus-widget="${publicWidgetId}"></script>`;
  const contenitore = `inbus-widget-${slug}`;
  return `<div id="${contenitore}"></div>\n<script src="${script}" data-inbus-widget="${publicWidgetId}" data-inbus-evento="${slug}" data-inbus-contenitore="${contenitore}"></script>`;
}

/** "Coez & Frah Quintale", "Coez e altri 2 eventi", "Nessun evento". */
function nomeEventi(wl: WhiteLabel) {
  if (wl.bundleId) return `${wl.bundleNome} (bundle)`;
  if (wl.eventi.length === 0) return 'Nessun evento';
  if (wl.eventi.length === 1) return wl.eventi[0].artista;
  return `${wl.eventi[0].artista} e altri ${wl.eventi.length - 1} eventi`;
}

/** Organizzatore → eventi (uno o più) o bundle → grafica, link e codice.
 *  Da settembre 2026 (proprietario) una White Label vende uno o più eventi
 *  scelti uno per uno: si crea con il primo e gli altri si aggiungono
 *  nella sua pagina; l'anno dopo si cambia l'evento e il cliente tiene lo
 *  stesso link e lo stesso codice. */
export function WhiteLabelScreen() {
  const mappaTooltip = useMappaTooltip();
  const [whiteLabels, setWhiteLabels] = useState<WhiteLabel[]>([]);
  const [organizzatori, setOrganizzatori] = useState<Organizzatore[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [vista, setVista] = useState<'lista' | 'nuova' | 'editor'>('lista');
  const [whiteLabelAttiva, setWhiteLabelAttiva] = useState<WhiteLabel | null>(null);

  function ricarica() {
    whiteLabelApi.list().then(setWhiteLabels);
    organizzatoriApi.list().then(setOrganizzatori);
    eventiApi.list().then(setEventi);
  }
  useEffect(ricarica, []);

  if (vista === 'nuova') {
    return <NuovaWhiteLabel organizzatori={organizzatori} eventi={eventi} onIndietro={() => setVista('lista')} onCreata={(wl) => { ricarica(); setWhiteLabelAttiva(wl); setVista('editor'); }} />;
  }

  if (vista === 'editor' && whiteLabelAttiva) {
    const wl = whiteLabelAttiva;
    // Anteprima: il primo evento in vendita (o il primo dell'elenco), con il suo prezzo vero.
    const primo = wl.eventi.find((e) => e.stato === 'in-vendita') ?? wl.eventi[0];
    const ev = primo && eventi.find((e) => e.id === primo.id);
    // Con un bundle (o senza eventi) l'anteprima usa il nome del bundle, così
    // l'editor grafico c'è comunque.
    const perAnteprima = ev
      ? { artista: ev.artista, data: ev.data, luogo: ev.luogo, citta: ev.citta, descrizione: ev.descrizione, prezzoMinimo: prezzoMinimoEvento(ev) ?? 30 }
      : { artista: wl.bundleNome ?? 'Il tuo viaggio', data: new Date().toISOString(), luogo: 'Più eventi', citta: 'nel pacchetto', descrizione: null, prezzoMinimo: wl.bundleId ? null : 30 };
    const cardAnteprima: DatiCard[] | undefined = wl.bundleId ? undefined : wl.eventi
      .filter((e) => e.stato === 'in-vendita')
      .map((e) => {
        const completo = eventi.find((x) => x.id === e.id);
        return {
          id: e.id, artista: e.artista, data: e.data, luogo: completo?.luogo ?? '', citta: e.citta,
          immagineUrl: completo?.immagini[0]?.url ?? null, prezzoMinimo: completo ? prezzoMinimoEvento(completo) : null,
        };
      });
    const piuEventi = wl.eventi.length > 1;
    return (
      <PaginaSezione larga titolo={`White Label — ${wl.organizzatoreNome} · ${nomeEventi(wl)}`} onIndietro={() => { ricarica(); setVista('lista'); }}>
        {!wl.bundleId && <EventiDellaWhiteLabel whiteLabel={wl} eventi={eventi} onCambiata={(nuova) => { setWhiteLabelAttiva(nuova); ricarica(); }} />}
        <section className="section-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px' }}>Link e codice da dare al cliente</h3>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--testo-md)', color: 'var(--mist)', lineHeight: 1.5 }}>
            Il link apre la pagina intera con la grafica qui sotto. Il codice si incolla nel sito del cliente e mostra la stessa cosa dentro una sua pagina.
            {!wl.bundleId && (piuEventi
              ? ' Con più eventi mostrano tutte le card; il link e il codice di un evento solo sono nella sua riga qui sopra.'
              : ' Aprono subito la prenotazione dell\'evento, e restano gli stessi quando lo cambi.')}
          </p>
          <div className="wl-condivisione">
            <CampoCopiabile etichetta={piuEventi ? 'Link di tutti gli eventi' : 'Link da condividere'} valore={linkWidget(wl.publicWidgetId)} link />
            <CampoCopiabile etichetta={piuEventi ? 'Codice di tutti gli eventi' : 'Codice da incollare nel sito'} valore={codiceWidget(wl.publicWidgetId)} />
          </div>
        </section>
        {/* Le due impostazioni piccole stanno affiancate invece che una
            sotto l'altra: così l'editor grafico comincia subito. */}
        <div className="griglia-schede" style={{ marginBottom: 16 }}>
          <SelettoreLayoutBiglietto whiteLabel={whiteLabelAttiva} onSalvato={(wl) => setWhiteLabelAttiva(wl)} />
          <MetaPixelOrganizzatore whiteLabel={whiteLabelAttiva} onSalvato={(wl) => setWhiteLabelAttiva(wl)} />
        </div>
        <WhiteLabelEditor
          key={wl.id}
          whiteLabel={whiteLabelAttiva}
          evento={perAnteprima}
          eventi={cardAnteprima}
          onSalvato={(aggiornata) => setWhiteLabelAttiva(aggiornata)}
        />
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="White Label" azione={<button className="btn btn-primary" onClick={() => setVista('nuova')}>+ Nuova White Label</button>} info={mappaTooltip.white_label_intro ?? TOOLTIP_DEFAULT.white_label_intro} />
      {whiteLabels.length === 0 && <p style={{ color: 'var(--mist)' }}>Nessuna White Label creata ancora.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {whiteLabels.map((wl) => (
          <div key={wl.id} className="section-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <div>
              <b>{wl.organizzatoreNome}</b> — {nomeEventi(wl)}
              <span style={{ marginLeft: 10, fontSize: 'var(--testo-sm)', color: wl.attiva ? '#5be0a0' : 'var(--mist)' }}>{wl.attiva ? '● Attiva' : '○ Disattivata'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setWhiteLabelAttiva(wl); setVista('editor'); }}>Modifica</button>
              <ToggleAttiva whiteLabel={wl} onCambiata={ricarica} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleAttiva({ whiteLabel, onCambiata }: { whiteLabel: WhiteLabel; onCambiata: () => void }) {
  async function toggle() {
    await whiteLabelApi.update(whiteLabel.id, { attiva: !whiteLabel.attiva });
    onCambiata();
  }
  return (
    <button className="btn btn-ghost" onClick={toggle}>{whiteLabel.attiva ? 'Disattiva' : 'Attiva'}</button>
  );
}

/** Gli eventi in programma (non nel cestino), dal più vicino: quelli che si possono mettere in vendita. */
function eventiInProgramma(eventi: Evento[]) {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return eventi.filter((e) => new Date(e.data) >= oggi).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
}
const etichettaEvento = (e: Pick<Evento, 'artista' | 'citta' | 'data'>) => `${e.artista} · ${e.citta} · ${formattaData(e.data)}`;

function NuovaWhiteLabel({ organizzatori, eventi, onIndietro, onCreata }: { organizzatori: Organizzatore[]; eventi: Evento[]; onIndietro: () => void; onCreata: (wl: WhiteLabel) => void }) {
  const [organizzatoreId, setOrganizzatoreId] = useState('');
  const [scelta, setScelta] = useState('');
  const [bundleOrganizzatore, setBundleOrganizzatore] = useState<BundleRiga[]>([]);
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    if (!organizzatoreId) { setBundleOrganizzatore([]); return; }
    // I bundle associati a questo organizzatore (scheda Bundle → Vendita).
    bundleApi.list().then((tutti) => setBundleOrganizzatore(tutti.filter((b) => b.organizzatoreId === organizzatoreId))).catch(() => setBundleOrganizzatore([]));
  }, [organizzatoreId]);

  // Prima gli eventi già associati all'organizzatore, poi tutti gli altri in
  // programma: scegliendone uno gli si associa da solo.
  const org = organizzatori.find((o) => o.id === organizzatoreId);
  const inProgramma = eventiInProgramma(eventi);
  const suoi = inProgramma.filter((e) => org?.eventiAbilitati.includes(e.id));
  const altri = inProgramma.filter((e) => !org?.eventiAbilitati.includes(e.id));

  async function crea() {
    if (!organizzatoreId || !scelta) return;
    setCaricamento(true);
    setErrore('');
    try {
      const nuova = await whiteLabelApi.create(scelta.startsWith('bundle:') ? { organizzatoreId, bundleId: scelta.slice(7) } : { organizzatoreId, eventiIds: [scelta] });
      onCreata(nuova);
    } catch (e) {
      setErrore(motivoErrore(e));
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <PaginaSezione titolo="Nuova White Label" onIndietro={onIndietro}>
      <div className="campo">
        <label>Organizzatore</label>
        <select value={organizzatoreId} onChange={(e) => { setOrganizzatoreId(e.target.value); setScelta(''); }}>
          <option value="">Scegli…</option>
          {organizzatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>
      {organizzatoreId && (
        <div className="campo">
          <label>Primo evento, oppure un bundle</label>
          <select value={scelta} onChange={(e) => setScelta(e.target.value)}>
            <option value="">Scegli…</option>
            {suoi.length > 0 && <optgroup label="Eventi di questo organizzatore">{suoi.map((e) => <option key={e.id} value={e.id}>{etichettaEvento(e)}</option>)}</optgroup>}
            {altri.length > 0 && <optgroup label="Altri eventi in programma">{altri.map((e) => <option key={e.id} value={e.id}>{etichettaEvento(e)}</option>)}</optgroup>}
            {bundleOrganizzatore.length > 0 && <optgroup label="Bundle">{bundleOrganizzatore.map((b) => <option key={b.id} value={`bundle:${b.id}`}>{b.nome} (bundle)</option>)}</optgroup>}
          </select>
          <p style={{ fontSize: 'var(--testo-sm)', color: 'var(--mist)', marginTop: 6, lineHeight: 1.45 }}>
            Gli altri eventi li aggiungi dopo, nella pagina della White Label: con due o più il cliente sceglie tra le card.
          </p>
        </div>
      )}
      {errore && <p style={{ color: 'var(--pink)', fontSize: 'var(--testo-md)' }}>{errore}</p>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={crea} disabled={!organizzatoreId || !scelta || caricamento}>
        {caricamento ? 'Creazione…' : 'Crea White Label'}
      </button>
    </PaginaSezione>
  );
}

const NOMI_STATO: Record<StatoEventoWhiteLabel, { testo: string; classe: string }> = {
  'in-vendita': { testo: 'In vendita', classe: 'badge-stato-verde' },
  'vendite-ferme': { testo: 'Vendite ferme', classe: 'badge-stato-arancio' },
  passato: { testo: 'Passato', classe: 'neutro' },
  bozza: { testo: 'In bozza', classe: 'badge-stato-arancio' },
  cestino: { testo: 'Nel cestino', classe: 'badge-stato-rosso' },
};

/** Gli eventi in vendita su questa White Label: si aggiungono, si tolgono e
 *  si cambiano (l'anno dopo) senza toccare grafica, link e codice. Ogni
 *  evento ha anche il suo link e il suo codice. Si salva subito. */
function EventiDellaWhiteLabel({ whiteLabel, eventi, onCambiata }: { whiteLabel: WhiteLabel; eventi: Evento[]; onCambiata: (wl: WhiteLabel) => void }) {
  const [daAggiungere, setDaAggiungere] = useState('');
  const [aperto, setAperto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const elenco = whiteLabel.eventi;
  const disponibili = eventiInProgramma(eventi).filter((e) => !elenco.some((x) => x.id === e.id));

  async function salva(eventiIds: string[], messaggio: string) {
    setSalvando(true);
    try {
      onCambiata(await whiteLabelApi.impostaEventi(whiteLabel.id, eventiIds));
      notifica(messaggio, 'successo');
      return true;
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function aggiungi() {
    const ev = eventi.find((e) => e.id === daAggiungere);
    if (!ev) return;
    if (await salva([...elenco.map((e) => e.id), ev.id], `${ev.artista} è in vendita su questa White Label.`)) setDaAggiungere('');
  }

  async function togli(ev: EventoDellaWhiteLabel) {
    const ultimo = elenco.length === 1;
    const ok = await conferma({
      titolo: `Togliere ${ev.artista} da questa White Label?`,
      testo: ultimo
        ? 'È l\'unico evento: finché non ne aggiungi un altro, la pagina del cliente dirà che non ci sono viaggi in vendita. Le prenotazioni già fatte restano.'
        : 'Il cliente non lo vedrà più tra le card. Le prenotazioni già fatte restano.',
      conferma: 'Togli l\'evento',
    });
    if (!ok) return;
    await salva(elenco.filter((e) => e.id !== ev.id).map((e) => e.id), `${ev.artista} tolto dalla White Label.`);
  }

  return (
    <section className="section-card" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>Eventi in vendita</h3>
      <p style={{ margin: '0 0 12px', fontSize: 'var(--testo-md)', color: 'var(--mist)', lineHeight: 1.5 }}>
        Con un evento il cliente va dritto alla prenotazione; con due o più sceglie tra le card. Per l'edizione dell'anno dopo
        aggiungi il nuovo evento e togli il vecchio: grafica, link e codice del cliente restano gli stessi. Gli eventi passati,
        in bozza o con le vendite ferme non si vedono.
      </p>
      {elenco.length === 0 && <p className="avviso" style={{ marginBottom: 12 }}>Nessun evento: la pagina del cliente dice che non ci sono viaggi in vendita.</p>}
      {elenco.length > 0 && (
        <div className="wl-eventi">
          {elenco.map((ev) => (
            <div key={ev.id} className="wl-evento">
              <div className="wl-evento-riga">
                <div className="wl-evento-nome">
                  <b>{ev.artista}</b>
                  <span className="testo-secondario">{ev.citta} · {formattaData(ev.data)}</span>
                </div>
                <span className={`badge ${NOMI_STATO[ev.stato].classe}`}>{NOMI_STATO[ev.stato].testo}</span>
                <div className="wl-evento-azioni">
                  {elenco.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-piccolo" aria-expanded={aperto === ev.id} onClick={() => setAperto(aperto === ev.id ? null : ev.id)}>
                      {aperto === ev.id ? 'Chiudi' : 'Link e codice di questo evento'}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-piccolo" disabled={salvando} onClick={() => togli(ev)}>Togli</button>
                </div>
              </div>
              {aperto === ev.id && (
                <div className="wl-condivisione" style={{ marginTop: 10 }}>
                  <CampoCopiabile etichetta={`Link di ${ev.artista}`} valore={linkWidget(whiteLabel.publicWidgetId, ev.slug)} link />
                  <CampoCopiabile etichetta={`Codice di ${ev.artista}`} valore={codiceWidget(whiteLabel.publicWidgetId, ev.slug)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="wl-aggiungi-evento">
        <label htmlFor="wl-aggiungi">Aggiungi un evento</label>
        <select id="wl-aggiungi" value={daAggiungere} onChange={(e) => setDaAggiungere(e.target.value)}>
          <option value="">{disponibili.length ? 'Scegli un evento in programma…' : 'Nessun altro evento in programma'}</option>
          {disponibili.map((e) => <option key={e.id} value={e.id}>{etichettaEvento(e)}</option>)}
        </select>
        <button type="button" className="btn btn-primary" disabled={!daAggiungere || salvando} onClick={aggiungi}>{salvando ? 'Salvo…' : 'Aggiungi'}</button>
      </div>
    </section>
  );
}

/** Il layout del BIGLIETTO (PDF) — cosa riceve davvero il cliente via
 *  email/download, con i suoi loghi sponsor. Volutamente separato e
 *  ben etichettato rispetto al "tema" del widget qui sotto (quello è
 *  l'aspetto della pagina/vetrina online, questo è il documento vero)
 *  — per non far confondere all'amministratore i due layout diversi.
 *  Nessuna scelta = usa il layout dell'evento, come è sempre stato. */
/** Il pixel di Meta DI QUESTO organizzatore (facoltativo) — le sue
 *  vendite dal widget mandano l'evento SIA al pixel di INBUS (sempre)
 *  SIA a questo, se lo imposta: due ad account, la stessa vendita.
 *  Stesso schema di SelettoreLayoutBiglietto qui sopra: salvataggio
 *  immediato al blur, non un form a parte. */
function MetaPixelOrganizzatore({ whiteLabel, onSalvato }: { whiteLabel: WhiteLabel; onSalvato: (wl: WhiteLabel) => void }) {
  const [pixelId, setPixelId] = useState(whiteLabel.metaPixelId ?? '');
  const [token, setToken] = useState(whiteLabel.metaCapiToken ?? '');
  const [salvando, setSalvando] = useState(false);

  async function salva() {
    setSalvando(true);
    try {
      const aggiornata = await whiteLabelApi.update(whiteLabel.id, { metaPixelId: pixelId || null, metaCapiToken: token || null });
      onSalvato(aggiornata);
      notifica('Pixel dell\'organizzatore salvato.', 'successo');
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="section-card">
      <p className="section-label" style={{ marginBottom: 8 }}>Pixel di Meta dell'organizzatore (facoltativo)</p>
      <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginBottom: 10 }}>
        Se questo organizzatore ha un suo account pubblicitario Meta, le vendite dal suo widget arriveranno anche al suo pixel — oltre che al nostro, sempre.
      </p>
      <div className="campo" style={{ marginBottom: 8 }}>
        <label>ID Pixel</label>
        <input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="(non impostato)" />
      </div>
      <div className="campo" style={{ marginBottom: 10 }}>
        <label>Token Conversions API</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="(non impostato)" />
      </div>
      <button className="btn btn-ghost" onClick={salva} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva'}</button>
    </div>
  );
}

function SelettoreLayoutBiglietto({ whiteLabel, onSalvato }: { whiteLabel: WhiteLabel; onSalvato: (wl: WhiteLabel) => void }) {
  const [layout, setLayout] = useState<LayoutBiglietto[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { layoutBigliettoApi.list().then(setLayout); }, []);

  async function cambia(id: string) {
    setSalvando(true);
    try {
      const aggiornata = await whiteLabelApi.update(whiteLabel.id, { layoutBigliettoId: id || null });
      onSalvato(aggiornata);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="section-card">
      <p className="section-label" style={{ marginBottom: 8 }}>Layout biglietto (PDF) di questa White Label</p>
      <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginBottom: 10 }}>
        Diverso dal tema qui sotto — questo è il vero documento che il cliente riceve. Se non scegli nulla, usa il layout impostato per l'evento.
      </p>
      <select value={whiteLabel.layoutBigliettoId ?? ''} onChange={(e) => cambia(e.target.value)} disabled={salvando}>
        <option value="">— Usa il layout dell'evento —</option>
        {layout.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.predefinito ? ' (predefinito)' : ''}</option>)}
      </select>
    </div>
  );
}
