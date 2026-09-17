import { Fragment, useState, type ReactNode } from 'react';
import { statisticheApi, type BusSimulato, type EventoSimulato, type StatisticheBusInPiu } from '../../../api/statistiche';
import { CampoNumero } from '../../shared/CampoNumero';
import { InfoTooltip } from '../../shared/InfoTooltip';
import { Caricamento, ErroreStatistiche, formattaEuroIntero, formattaNumero, pluraleNumero, Scheda, useDati, Vuoto } from './comuni';
import {
  conInterruttore, conScelta, contiEvento, contiEventi, costoDi, giudizio, leggiScelte, risultato, salvaScelte, spesa,
  type ATerra, type ContiTragitto, type SceltaBus, type Scelte, type Voce,
} from './contiBusInPiu';
import { formattaGiorno, oggiRoma } from './periodo';

/** Statistiche › Bus in più: incasso, spesa e risultato dei bus, totali, per
 *  evento, per linea e per bus (richiesta del proprietario, settembre 2026:
 *  "i dati a colpo d'occhio", le spiegazioni nei tooltip). Gli eventi in
 *  vendita si simulano con un interruttore per ogni bus in più; i passati
 *  hanno i numeri veri. I conti sono in contiBusInPiu.ts; il riquadro della
 *  pagina Linee (RiquadroBusInPiu) usa la stessa tabella. */

type Cambia = (b: BusSimulato, cambio: SceltaBus) => void;

const TESTO_GIUDIZIO = { guadagno: 'Guadagno', pareggio: 'Pareggio', perdita: 'Perdita' } as const;

const euro = (n: number) => formattaEuroIntero(n).replace('-', '−');
/** "+248 €" / "−169 €". */
const conSegno = (n: number) => (Math.round(n) > 0 ? `+${euro(n)}` : euro(n));

/** Il risultato di ogni tragitto dell'evento, in una riga: si vede se il guadagno di uno copre la perdita di un altro. */
function RisultatiTragitti({ tragitti }: { tragitti: ContiTragitto[] }) {
  if (tragitti.length < 2) return null;
  return (
    <span className="sim-tragitti-sintesi">
      {tragitti.map((t) => {
        const r = risultato(t.voce);
        return <span key={t.tragitto.id}>{t.tragitto.nome} <b className={`sim-valore ${giudizio(r)}`}>{conSegno(r)}</b></span>;
      })}
    </span>
  );
}

function Giudizio({ valore }: { valore: number }) {
  const g = giudizio(valore);
  return <span className={`sim-giudizio ${g}`}>{TESTO_GIUDIZIO[g]}</span>;
}

/** Le scelte degli interruttori, ricordate in questo browser (le stesse in Statistiche e nella pagina Linee). */
function useScelteBus() {
  const [scelte, setScelte] = useState<Scelte>(leggiScelte);
  function aggiorna(nuove: Scelte) {
    salvaScelte(nuove);
    setScelte(nuove);
  }
  return {
    scelte,
    cambia: (b: BusSimulato, cambio: SceltaBus) => aggiorna(conScelta(scelte, b, cambio)),
    azzera: (bus: BusSimulato[]) => aggiorna(Object.fromEntries(Object.entries(scelte).filter(([chiave]) => !bus.some((b) => b.chiave === chiave)))),
  };
}

// ---------------------------------------------------------------- Celle

function Intestazione({ primaColonna }: { primaColonna: string }) {
  return (
    <thead>
      <tr>
        <th>{primaColonna}</th>
        <th className="stat-num">
          Passeggeri
          <InfoTooltip fisso>Chi parte sui bus (sul bus: passeggeri / posti). «A terra»: chi non trova posto sui bus che partono e quanto ha già pagato; se nessun bus lo porta viene rimborsato, quindi non entra nell'incasso. Per sapere se quei soldi coprono un bus in più guarda la riga di quel bus.</InfoTooltip>
        </th>
        <th className="stat-num">
          Incasso
          <InfoTooltip fisso>Quanto hanno pagato davvero i passeggeri che partono: di un acconto non ancora saldato conta solo l'acconto. Sotto, in piccolo, i saldi che devono ancora arrivare: non contano nel risultato. Chi resta a terra o ha un rimborso in attesa non conta.</InfoTooltip>
        </th>
        <th className="stat-num">
          Spesa
          <InfoTooltip fisso>Costo dei bus che partono più le commissioni dei promoter e le quote White Label dei loro passeggeri. Il costo di un bus in più è il preventivo più basso ricevuto, altrimenti la quotazione.</InfoTooltip>
        </th>
        <th className="stat-num">
          Risultato
          <InfoTooltip fisso>Incasso meno spesa: verde guadagno, rosso perdita, arancio pareggio (meno di 1 € di differenza). Nella riga dell'evento è la somma di tutti i suoi tragitti: così vedi se il guadagno di un tragitto copre la perdita di un altro.</InfoTooltip>
        </th>
      </tr>
    </thead>
  );
}

function CellePasseggeri({ voce, aTerra, conPosti = false }: { voce: Voce; aTerra?: ATerra; conPosti?: boolean }) {
  return (
    <td className="stat-num">
      {formattaNumero(voce.passeggeri)}{conPosti && voce.posti > 0 && <span className="sim-posti"> / {formattaNumero(voce.posti)}</span>}
      {aTerra && aTerra.passeggeri > 0 && (
        <span className="stat-sotto stat-negativo">{formattaNumero(aTerra.passeggeri)} a terra · {euro(aTerra.valore)}</span>
      )}
    </td>
  );
}

/** Pagato davvero; sotto, i saldi che devono ancora arrivare (non contano nel risultato). */
function CellaIncasso({ voce }: { voce: Voce }) {
  return (
    <td className="stat-num">
      {euro(voce.incasso)}
      {voce.daIncassare > 0 && <span className="stat-sotto">da incassare {euro(voce.daIncassare)}</span>}
    </td>
  );
}

function CellaSpesa({ voce }: { voce: Voce }) {
  return (
    <td className="stat-num">
      {euro(spesa(voce))}
      {(voce.promoter > 0 || voce.whiteLabel > 0) && (
        <span className="stat-sotto">
          bus {euro(voce.costoBus)}
          {voce.promoter > 0 && <> · promoter {euro(voce.promoter)}</>}
          {voce.whiteLabel > 0 && <> · White Label {euro(voce.whiteLabel)}</>}
        </span>
      )}
      {voce.busSenzaCosto > 0 && <span className="stat-sotto stat-negativo">{pluraleNumero(voce.busSenzaCosto, 'bus senza costo', 'bus senza costo')}</span>}
    </td>
  );
}

function CellaRisultato({ voce, conGiudizio = false, spento = false }: { voce: Voce; conGiudizio?: boolean; spento?: boolean }) {
  const r = risultato(voce);
  return (
    <td className="stat-num">
      <span className={spento ? undefined : `sim-valore ${giudizio(r)}`}>{euro(r)}</span>
      {conGiudizio && <span className="stat-sotto"><Giudizio valore={r} /></span>}
    </td>
  );
}

// ---------------------------------------------------------------- Righe

const TIPO_BUS: Record<BusSimulato['tipo'], string | null> = {
  confermato: null,
  'linea-senza-bus': 'linea senza bus',
  proposta: 'da confermare',
  'sotto-pareggio': 'sotto il pareggio',
  'senza-bus': null,
};

function spiegazioneBus(b: BusSimulato, parte: boolean, costo: number | null, aMano: boolean): string {
  const cosa = {
    confermato: `Bus confermato${b.riferimento ? ` (${b.riferimento})` : ''}.`,
    'linea-senza-bus': 'Linea confermata ancora senza bus.',
    proposta: 'Da confermare: chi resta fuori raggiunge il pareggio.',
    'sotto-pareggio': 'Sotto il pareggio: partirebbe per chi resta fuori, anche se non copre il costo.',
    'senza-bus': 'Viaggio di prima dello smistamento: nessuno è stato messo sui bus, contano tutti i prenotati.',
  }[b.tipo];
  if (b.tipo === 'senza-bus') return cosa;
  const fonte = aMano
    ? 'Costo scritto a mano.'
    : costo === null ? 'Nessun costo: conta 0, scrivilo con «Costo».'
      : b.fonteCosto === 'bus' ? 'Costo registrato sul bus.'
        : b.fonteCosto === 'preventivo' ? `Costo: il preventivo più basso${b.preventivi > 1 ? ` di ${b.preventivi} ricevuti` : ''}.`
          : 'Costo della quotazione del tragitto (nessun preventivo ancora).';
  const stato = conInterruttore(b)
    ? parte ? ' Parte: è solo una prova, non conferma niente.' : ' Non parte: i numeri in grigio sono quelli che avrebbe partendo.'
    : '';
  return `${cosa} ${fonte}${stato}`;
}

/** Righe aperte e chiuse della tabella: ognuna ha un'apertura di serie
 *  finché non la si tocca (evento `e:`, tragitto `t:`, linea `l:`). */
function useAperti() {
  const [scelti, setScelti] = useState<Record<string, boolean>>({});
  return {
    aperto: (chiave: string, diSerie: boolean) => scelti[chiave] ?? diSerie,
    alterna: (chiave: string, diSerie: boolean) => setScelti((s) => ({ ...s, [chiave]: !(s[chiave] ?? diSerie) })),
  };
}
type Aperti = ReturnType<typeof useAperti>;

/** Il nome di una riga che si apre e si chiude, con la freccia. */
function NomeApribile({ aperto, onAlterna, children }: { aperto: boolean; onAlterna: () => void; children: ReactNode }) {
  return (
    <button type="button" className="sim-apri" aria-expanded={aperto} onClick={(ev) => { ev.stopPropagation(); onAlterna(); }}>
      <span className="sim-freccia" aria-hidden="true">{aperto ? '▾' : '▸'}</span>{children}
    </button>
  );
}

/** Di serie aperti solo dove c'è una scelta da fare: un bus in più con il suo interruttore. */
const conSceltaDaFare = (bus: BusSimulato[]) => bus.some(conInterruttore);

interface PropsRighe { conti: ContiTragitto; scelte: Scelte; onCambia?: Cambia; modifica: string | null; onModifica: (chiave: string | null) => void; aperti: Aperti }

/** Le righe di linee e bus di un tragitto; ogni linea si apre e si chiude. */
function RigheLinee({ conti, scelte, onCambia, modifica, onModifica, aperti }: PropsRighe) {
  return (
    <>
      {conti.linee.map((l) => {
        const spenta = l.voce.bus === 0 && l.voce.passeggeri === 0;
        const chiave = `l:${conti.tragitto.id}:${l.linea.chiave}`;
        const diSerie = conSceltaDaFare(l.bus.map((r) => r.bus));
        const aperta = aperti.aperto(chiave, diSerie);
        const alterna = () => aperti.alterna(chiave, diSerie);
        return (
          <Fragment key={l.linea.chiave}>
            <tr className={`sim-linea sim-cliccabile${spenta ? ' sim-spento' : ''}`} onClick={alterna}>
              <td>
                <NomeApribile aperto={aperta} onAlterna={alterna}>{l.linea.nome}</NomeApribile>
                <span className="stat-sotto">
                  {[l.linea.fermate.join(' → '), aperta ? null : pluraleNumero(l.bus.length, 'bus', 'bus')].filter(Boolean).join(' · ')}
                </span>
              </td>
              <CellePasseggeri voce={l.voce} conPosti />
              <CellaIncasso voce={l.voce} />
              <CellaSpesa voce={l.voce} />
              <CellaRisultato voce={l.voce} spento={spenta} />
            </tr>
            {aperta && l.bus.map((r) => {
              const b = r.bus;
              const aMano = scelte[b.chiave]?.costo !== undefined;
              const tipo = TIPO_BUS[b.tipo];
              return (
                <Fragment key={b.chiave}>
                  <tr className={`sim-bus${r.parte ? '' : ' sim-spento'}`}>
                    <td>
                      <span className="sim-nome-bus">
                        <span>{b.nome}</span>
                        {tipo && <span className={`sim-tipo ${b.tipo}`}>{tipo}</span>}
                        <InfoTooltip fisso>{spiegazioneBus(b, r.parte, costoDi(b, scelte), aMano)}</InfoTooltip>
                        {onCambia && conInterruttore(b) && (
                          <>
                            <span className="sim-scelta" role="group" aria-label={`${b.nome}: parte o no`}>
                              <button type="button" className="parte" aria-pressed={r.parte} onClick={() => onCambia(b, { parte: true })}>Parte</button>
                              <button type="button" className="non-parte" aria-pressed={!r.parte} onClick={() => onCambia(b, { parte: false })}>Non parte</button>
                            </span>
                            <button type="button" className="sim-link" aria-expanded={modifica === b.chiave} onClick={() => onModifica(modifica === b.chiave ? null : b.chiave)}>
                              Costo
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                    <CellePasseggeri voce={r.voce} conPosti />
                    <CellaIncasso voce={r.voce} />
                    <CellaSpesa voce={r.voce} />
                    <CellaRisultato voce={r.voce} spento={!r.parte} />
                  </tr>
                  {onCambia && modifica === b.chiave && (
                    <tr className="sim-costo-riga">
                      <td colSpan={5}>
                        <span className="sim-costo">
                          <label htmlFor={`costo-${b.chiave}`}>Costo di {b.nome} ({l.linea.nome})</label>
                          <CampoNumero
                            id={`costo-${b.chiave}`}
                            valuta
                            min={0}
                            value={scelte[b.chiave]?.costo}
                            placeholder={b.costo === null ? 'da scrivere' : String(b.costo)}
                            onChange={(v) => onCambia(b, { costo: v !== undefined && v >= 0 ? v : undefined })}
                            style={{ width: 130 }}
                          />
                          <span className="stat-spento">
                            {b.costo === null ? 'Nessun preventivo né quotazione.' : `Di serie ${euro(b.costo)} (${b.fonteCosto === 'preventivo' ? 'preventivo più basso' : 'quotazione'}).`}
                          </span>
                          {aMano && <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => onCambia(b, { costo: undefined })}>Torna al costo di serie</button>}
                          <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => onModifica(null)}>Fatto</button>
                        </span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}

/** La riga di un tragitto, che si apre sulle sue linee. */
function RigaTragitto({ conti, aperti, diSerie, sotto, classe = '' }: { conti: ContiTragitto; aperti: Aperti; diSerie: boolean; sotto?: string; classe?: string }) {
  const chiave = `t:${conti.tragitto.id}`;
  const aperto = aperti.aperto(chiave, diSerie);
  const alterna = () => aperti.alterna(chiave, diSerie);
  return (
    <tr className={`sim-tragitto sim-cliccabile${classe}`} onClick={alterna}>
      <td>
        <NomeApribile aperto={aperto} onAlterna={alterna}>{conti.tragitto.nome}</NomeApribile>
        {sotto && <span className="stat-sotto">{sotto}</span>}
      </td>
      <CellePasseggeri voce={conti.voce} aTerra={conti.aTerra} />
      <CellaIncasso voce={conti.voce} />
      <CellaSpesa voce={conti.voce} />
      <CellaRisultato voce={conti.voce} conGiudizio />
    </tr>
  );
}

/** Eventi in una tabella: evento, tragitti e linee si aprono e si chiudono toccandoli. */
function TabellaEventi({ eventi, scelte, onCambia, apertiIniziali }: { eventi: EventoSimulato[]; scelte: Scelte; onCambia?: Cambia; apertiIniziali: string[] }) {
  const aperti = useAperti();
  const [modifica, setModifica] = useState<string | null>(null);
  return (
    <div className="table-scroll">
      <table className="data-table sim-tabella">
        <Intestazione primaColonna="Evento, linea e bus" />
        <tbody>
          {eventi.map((e) => {
            const c = contiEvento(e, scelte);
            const chiave = `e:${e.id}`;
            const diSerie = apertiIniziali.includes(e.id);
            const aperto = aperti.aperto(chiave, diSerie);
            const alterna = () => aperti.alterna(chiave, diSerie);
            const piuTragitti = c.tragitti.length > 1;
            return (
              <Fragment key={e.id}>
                <tr className="sim-evento" onClick={alterna}>
                  <td>
                    <NomeApribile aperto={aperto} onAlterna={alterna}>{e.artista}</NomeApribile>
                    <span className="stat-sotto">{[e.citta, formattaGiorno(e.data)].filter(Boolean).join(' · ')}</span>
                    <RisultatiTragitti tragitti={c.tragitti} />
                  </td>
                  <CellePasseggeri voce={c.voce} aTerra={c.aTerra} />
                  <CellaIncasso voce={c.voce} />
                  <CellaSpesa voce={c.voce} />
                  <CellaRisultato voce={c.voce} conGiudizio />
                </tr>
                {aperto && c.tragitti.map((t) => {
                  const tragittoDiSerie = conSceltaDaFare(t.tragitto.bus);
                  const tragittoAperto = !piuTragitti || aperti.aperto(`t:${t.tragitto.id}`, tragittoDiSerie);
                  return (
                    <Fragment key={t.tragitto.id}>
                      {piuTragitti && <RigaTragitto conti={t} aperti={aperti} diSerie={tragittoDiSerie} />}
                      {tragittoAperto && <RigheLinee conti={t} scelte={scelte} onCambia={onCambia} modifica={modifica} onModifica={setModifica} aperti={aperti} />}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Pagina Linee

/** Il riquadro della pagina Linee: in cima il totale dell'evento, poi ogni
 *  suo tragitto (quello della pagina aperto) con linee e bus e gli
 *  interruttori dei bus in più. Così si vede se il guadagno di un tragitto
 *  copre la perdita di un altro. Tragitti e linee si chiudono toccandoli.
 *  `versione` cambia quando la pagina ricarica i dati. */
export function RiquadroBusInPiu({ eventoId, tragittoId, versione }: { eventoId: string; tragittoId: string; versione: number }) {
  const stato = useDati(() => statisticheApi.busInPiuEvento(eventoId), `${eventoId}|${versione}`);
  const { scelte, cambia } = useScelteBus();
  const aperti = useAperti();
  const [modifica, setModifica] = useState<string | null>(null);
  if (stato.errore) return <ErroreStatistiche motivo={stato.errore.motivo} onRiprova={stato.riprova} />;
  const e = stato.dati?.evento;
  const t = e?.tragitti.find((x) => x.id === tragittoId);
  if (!e || !t || t.bus.length === 0) return null;
  const evento = contiEvento(e, scelte);
  const piuTragitti = evento.tragitti.length > 1;
  const questo = evento.tragitti.find((ct) => ct.tragitto.id === tragittoId)!;
  const righeLinee = (ct: ContiTragitto) => <RigheLinee conti={ct} scelte={scelte} onCambia={cambia} modifica={modifica} onModifica={setModifica} aperti={aperti} />;
  return (
    <section className={`section-card sim-riquadro${stato.caricando ? ' stat-aggiorno' : ''}`} aria-busy={stato.caricando}>
      <div className="stat-scheda-testa">
        <h3>
          Incasso e spesa dei bus
          <InfoTooltip>
            In cima il risultato di tutto l'evento, poi ogni tragitto: il guadagno di un tragitto può coprire la perdita di un altro.
            Tocca un tragitto o una linea per aprirla o chiuderla. Ogni bus in più ha «Parte / Non parte»: è solo una prova, non conferma
            niente. Le stesse scelte sono in Statistiche › Bus in più.
          </InfoTooltip>
        </h3>
      </div>
      <div className="table-scroll">
        <table className="data-table sim-tabella">
          <Intestazione primaColonna={piuTragitti ? 'Evento, tragitti, linee e bus' : 'Linea e bus'} />
          <tbody>
            {piuTragitti ? (
              <>
                <tr className="sim-evento sim-fisso">
                  <td>
                    Tutto l'evento
                    <RisultatiTragitti tragitti={evento.tragitti} />
                  </td>
                  <CellePasseggeri voce={evento.voce} aTerra={evento.aTerra} />
                  <CellaIncasso voce={evento.voce} />
                  <CellaSpesa voce={evento.voce} />
                  <CellaRisultato voce={evento.voce} conGiudizio />
                </tr>
                {evento.tragitti.map((ct) => {
                  const diQuesto = ct.tragitto.id === tragittoId;
                  return (
                    <Fragment key={ct.tragitto.id}>
                      <RigaTragitto conti={ct} aperti={aperti} diSerie={diQuesto} sotto={diQuesto ? 'questo tragitto' : undefined} classe={diQuesto ? ' sim-corrente' : ''} />
                      {aperti.aperto(`t:${ct.tragitto.id}`, diQuesto) && righeLinee(ct)}
                    </Fragment>
                  );
                })}
              </>
            ) : (
              <>
                <tr className="sim-evento sim-fisso">
                  <td>Questo tragitto</td>
                  <CellePasseggeri voce={questo.voce} aTerra={questo.aTerra} />
                  <CellaIncasso voce={questo.voce} />
                  <CellaSpesa voce={questo.voce} />
                  <CellaRisultato voce={questo.voce} conGiudizio />
                </tr>
                {righeLinee(questo)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------- Scheda

export function BusInPiu() {
  const [anno, setAnno] = useState(() => Number(oggiRoma().slice(0, 4)));
  const stato = useDati(() => statisticheApi.busInPiu(anno), String(anno));
  const { scelte, cambia, azzera } = useScelteBus();
  const anni = stato.dati?.anni.includes(anno) ? stato.dati.anni : [anno, ...(stato.dati?.anni ?? [])].sort((a, b) => b - a);
  return (
    <>
      <div className="stat-filtri">
        <label className="stat-campo">
          <span>Anno</span>
          <select value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
            {anni.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <p className="stat-periodo">Da gennaio a dicembre, per data dell'evento.</p>
      </div>
      <Caricamento stato={stato}>{(d) => <ContenutoBusInPiu d={d} scelte={scelte} onCambia={cambia} onAzzera={azzera} />}</Caricamento>
    </>
  );
}

function RigaRiepilogo({ nome, sotto, voce, aTerra, forte = false }: { nome: string; sotto?: ReactNode; voce: Voce; aTerra: ATerra; forte?: boolean }) {
  return (
    <tr className={forte ? 'sim-totale' : undefined}>
      <td>{nome}{sotto && <span className="stat-sotto">{sotto}</span>}</td>
      <CellePasseggeri voce={voce} aTerra={aTerra} />
      <CellaIncasso voce={voce} />
      <CellaSpesa voce={voce} />
      <CellaRisultato voce={voce} conGiudizio />
    </tr>
  );
}

function ContenutoBusInPiu({ d, scelte, onCambia, onAzzera }: { d: StatisticheBusInPiu; scelte: Scelte; onCambia: Cambia; onAzzera: (bus: BusSimulato[]) => void }) {
  const inVenditaAnno = d.inVendita.filter((e) => e.anno === d.anno);
  const passati = contiEventi(d.conclusi, scelte);
  const venditaAnno = contiEventi(inVenditaAnno, scelte);
  const tuttaLaVendita = contiEventi(d.inVendita, scelte);
  const annoIntero = contiEventi([...d.conclusi, ...inVenditaAnno], scelte);
  const tuttiIBus = d.inVendita.flatMap((e) => e.tragitti.flatMap((t) => t.bus));
  const sceltiAMano = tuttiIBus.filter((b) => scelte[b.chiave]).length;
  // Aperti di serie: i primi eventi con un bus in più da decidere.
  const conBusInPiu = d.inVendita.filter((e) => e.tragitti.some((t) => t.bus.some(conInterruttore))).slice(0, 3).map((e) => e.id);

  return (
    <>
      <Scheda titolo="Riepilogo">
        <div className="table-scroll">
          <table className="data-table sim-tabella">
            <Intestazione primaColonna="" />
            <tbody>
              <RigaRiepilogo nome={`Anno ${d.anno}`} sotto="eventi passati e in vendita" voce={annoIntero.voce} aTerra={annoIntero.aTerra} forte />
              <RigaRiepilogo nome={`Eventi passati del ${d.anno}`} sotto={`${pluraleNumero(d.conclusi.length, 'evento', 'eventi')} · numeri veri`} voce={passati.voce} aTerra={passati.aTerra} />
              <RigaRiepilogo nome={`In vendita nel ${d.anno}`} sotto={`${pluraleNumero(inVenditaAnno.length, 'evento', 'eventi')} · con le tue scelte`} voce={venditaAnno.voce} aTerra={venditaAnno.aTerra} />
              {inVenditaAnno.length !== d.inVendita.length && (
                <RigaRiepilogo nome="Tutti gli eventi in vendita" sotto={`${pluraleNumero(d.inVendita.length, 'evento', 'eventi')}, di ogni anno`} voce={tuttaLaVendita.voce} aTerra={tuttaLaVendita.aTerra} />
              )}
            </tbody>
          </table>
        </div>
      </Scheda>

      <Scheda
        titolo="Eventi in vendita"
        conteggio={d.inVendita.length}
        azione={sceltiAMano > 0 ? (
          <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => onAzzera(tuttiIBus)}>
            Torna alle scelte di serie ({sceltiAMano})
          </button>
        ) : undefined}
      >
        {d.inVendita.length === 0
          ? <Vuoto>Nessun evento in vendita.</Vuoto>
          : <TabellaEventi eventi={d.inVendita} scelte={scelte} onCambia={onCambia} apertiIniziali={conBusInPiu} />}
      </Scheda>

      <Scheda titolo={`Eventi passati del ${d.anno}`} conteggio={d.conclusi.length}>
        {d.conclusi.length === 0
          ? <Vuoto>Nessun evento passato nel {d.anno}.</Vuoto>
          : <TabellaEventi eventi={d.conclusi} scelte={scelte} apertiIniziali={[]} />}
      </Scheda>
    </>
  );
}
