import { useState, type ReactNode } from 'react';
import {
  statisticheApi,
  type RigaEventoStatistiche, type RigaLineaStatistiche, type StatisticheEvento,
} from '../../../api/statistiche';
import { formattaEuro, plurale } from '../../../shared/formato';
import {
  BottoneCsv, Caricamento, chiaveFiltro, ETICHETTA_FONTE, formattaEuroIntero, formattaNumero, formattaPercentuale,
  GrigliaKpi, Kpi, KpiExtra, pluraleNumero, Scheda, useDati, useSegnalaPeriodo, Vuoto, type PropsScheda,
} from './comuni';
import { nomeFileCsv, scaricaCsv } from './csv';
import { BarreOrizzontali, GraficoRitmo, GrigliaPosti, MiniBarra, POSTI_MASSIMI_GRIGLIA } from './grafici';
import { formattaGiorno, giorniRelativi, oggiRoma } from './periodo';

export function EventiLinee({ filtro, onPeriodo }: PropsScheda) {
  const [aperto, setAperto] = useState<string | null>(null);
  // L'elenco resta caricato mentre si guarda un evento: tornando indietro è già lì.
  const elenco = useDati(() => statisticheApi.eventi(filtro), chiaveFiltro(filtro));
  const periodoElenco = elenco.dati && !elenco.caricando ? elenco.dati.periodo : null;
  // La scheda di un evento non dipende dal periodo.
  useSegnalaPeriodo(aperto ? 'non-applicabile' : periodoElenco, onPeriodo);

  function apri(id: string) {
    setAperto(id);
    window.scrollTo(0, 0);
  }

  function chiudi() {
    setAperto(null);
    window.scrollTo(0, 0);
  }

  if (aperto) return <DettaglioEvento id={aperto} onChiudi={chiudi} />;

  return (
    <Caricamento stato={elenco}>
      {(d) => (
        <>
          <Scheda
            titolo="Eventi in vendita"
            conteggio={d.inVendita.length}
            azione={(
              <BottoneCsv
                disabilitato={d.inVendita.length === 0}
                // Gli eventi in vendita non dipendono dal periodo: il file porta la data di oggi.
                onScarica={() => esportaEventi(d.inVendita, nomeFileCsv(`eventi in vendita ${oggiRoma()}`))}
              />
            )}
          >
            <TabellaEventi righe={d.inVendita} vuoto="Nessun evento in vendita." onApri={apri} />
          </Scheda>
          <Scheda
            titolo="Eventi passati nel periodo"
            conteggio={d.passati.length}
            azione={(
              <BottoneCsv
                disabilitato={d.passati.length === 0}
                onScarica={() => esportaEventi(d.passati, nomeFileCsv('eventi passati', d.periodo))}
              />
            )}
          >
            <TabellaEventi righe={d.passati} vuoto="Nessun evento passato nel periodo." onApri={apri} />
          </Scheda>
        </>
      )}
    </Caricamento>
  );
}

function esportaEventi(righe: RigaEventoStatistiche[], nomeFile: string) {
  scaricaCsv(
    nomeFile,
    [
      'Evento', 'Città', 'Luogo', 'Data', 'Giorni alla partenza', 'Passeggeri', 'Posti sui bus', 'Riempimento %',
      'Incasso €', 'Costo bus €', 'Costi completi', 'Commissioni €', 'Margine €', 'Linee sotto il pareggio',
      'Linee da confermare', 'Percorsi cambiati', "Lista d'attesa", 'Vendite ferme',
    ],
    righe.map((r) => [
      r.artista, r.citta, r.luogo, formattaGiorno(r.data), r.giorniAllaPartenza, r.passeggeri, r.postiSuiBus, r.riempimento,
      r.incasso, r.costoBus, r.costoCompleto, r.commissioni, r.margine, r.lineeSottoPareggio,
      r.lineeDaConfermare, r.percorsiCambiati, r.listaAttesa, r.venditeFermate,
    ]),
  );
}

function TabellaEventi({ righe, vuoto, onApri }: { righe: RigaEventoStatistiche[]; vuoto: string; onApri: (id: string) => void }) {
  if (righe.length === 0) return <Vuoto>{vuoto}</Vuoto>;
  return (
    <div className="table-scroll">
      <table className="data-table stat-larga">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Data</th>
            <th className="stat-num">Passeggeri</th>
            <th className="stat-num">Posti sui bus</th>
            <th>Riempimento</th>
            <th className="stat-num">Incasso</th>
            <th className="stat-num">Margine</th>
            <th>Da fare</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} className="stat-riga-apribile" onClick={() => onApri(r.id)}>
              <td>
                <button
                  type="button"
                  className="stat-link"
                  onClick={(e) => { e.stopPropagation(); onApri(r.id); }}
                >
                  {r.artista}
                </button>
                <span className="stat-sotto">{[r.citta, r.luogo].filter(Boolean).join(' · ')}</span>
              </td>
              <td className="stat-senza-a-capo">
                {formattaGiorno(r.data)}
                <span className="stat-sotto">{giorniRelativi(r.giorniAllaPartenza)}</span>
              </td>
              <td className="stat-num">{formattaNumero(r.passeggeri)}</td>
              <td className="stat-num">{r.postiSuiBus > 0 ? formattaNumero(r.postiSuiBus) : <span className="stat-spento">—</span>}</td>
              <td>
                {r.riempimento === null
                  ? <span className="stat-spento">—</span>
                  : <MiniBarra valore={r.riempimento} massimo={100} testo={formattaPercentuale(r.riempimento)} />}
              </td>
              <td className="stat-num">{formattaEuroIntero(r.incasso)}</td>
              <td className="stat-num">
                {r.margine === null ? <span className="stat-spento">—</span> : (
                  <>
                    <span className={r.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(r.margine)}</span>
                    {!r.costoCompleto && <span className="stat-sotto"><span className="badge attenzione">costi incompleti</span></span>}
                  </>
                )}
              </td>
              <td><DaFare r={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DaFare({ r }: { r: RigaEventoStatistiche }) {
  const voci: { classe: string; testo: string }[] = [];
  if (r.percorsiCambiati > 0) {
    voci.push({ classe: 'percorso-cambiato', testo: r.percorsiCambiati === 1 ? 'percorso cambiato' : `${formattaNumero(r.percorsiCambiati)} percorsi cambiati` });
  }
  if (r.lineeSottoPareggio > 0) voci.push({ classe: 'non-coperta', testo: `${pluraleNumero(r.lineeSottoPareggio, 'linea', 'linee')} sotto il pareggio` });
  if (r.lineeDaConfermare > 0) voci.push({ classe: 'attenzione', testo: `${pluraleNumero(r.lineeDaConfermare, 'linea', 'linee')} da confermare` });
  if (r.listaAttesa > 0) voci.push({ classe: 'neutro', testo: `${formattaNumero(r.listaAttesa)} in lista d'attesa` });
  if (r.venditeFermate) voci.push({ classe: 'neutro', testo: 'vendite ferme' });
  if (voci.length === 0) return <span className="stat-spento">—</span>;
  return (
    <div className="stat-badges">
      {voci.map((v) => <span key={v.testo} className={`badge ${v.classe}`}>{v.testo}</span>)}
    </div>
  );
}

// ---------------------------------------------------------------- Scheda di un evento

function DettaglioEvento({ id, onChiudi }: { id: string; onChiudi: () => void }) {
  const stato = useDati(() => statisticheApi.evento(id), id);
  return (
    <div>
      <button type="button" className="btn btn-ghost btn-piccolo stat-indietro" onClick={onChiudi}>← Tutti gli eventi</button>
      <Caricamento stato={stato}>{(d) => <SchedaEvento d={d} />}</Caricamento>
    </div>
  );
}

/** Linea senza bus (da confermare, o senza costo): niente costo e niente pareggio. */
function senzaBus(l: RigaLineaStatistiche): boolean {
  return l.daConfermare || l.costo === null;
}

function SchedaEvento({ d }: { d: StatisticheEvento }) {
  const ev = d.evento;
  const s = d.sintesi;
  const r = d.ritmo;
  const passato = ev.giorniAllaPartenza < 0;
  const didascaliaRitmo = r.criterioSimili === null || r.eventiSimili === 0
    ? 'Nessun evento simile già passato da confrontare.'
    : `Media di ${pluraleNumero(r.eventiSimili, 'evento simile già passato', 'eventi simili già passati')} (${r.criterioSimili === 'genere' ? 'stesso genere' : 'stessa città'}).`;
  const maxPasseggeriFermata = Math.max(0, ...d.fermate.map((f) => f.passeggeri));
  const conQuadratini = d.linee.some((l) => l.posti > 0 && l.posti <= POSTI_MASSIMI_GRIGLIA);
  const conBarre = d.linee.some((l) => l.posti > POSTI_MASSIMI_GRIGLIA);
  const conLineeSenzaBus = d.linee.some(senzaBus);

  return (
    <>
      <div className="stat-dettaglio-testa">
        <h3>
          {ev.artista}
          {ev.venditeFermate && <span className="badge neutro">vendite ferme</span>}
        </h3>
        <p>{[ev.citta, ev.luogo, formattaGiorno(ev.data), giorniRelativi(ev.giorniAllaPartenza)].filter(Boolean).join(' · ')}</p>
      </div>

      <GrigliaKpi>
        <Kpi etichetta="Passeggeri" valore={formattaNumero(s.passeggeri)}>
          <KpiExtra>{pluraleNumero(s.prenotazioni, 'prenotazione', 'prenotazioni')}</KpiExtra>
        </Kpi>
        <Kpi etichetta="Incasso" valore={formattaEuroIntero(s.incasso)}>
          {s.prezzoMedio !== null && <KpiExtra>prezzo medio {formattaEuro(s.prezzoMedio)}</KpiExtra>}
        </Kpi>
        <Kpi etichetta="Posti sui bus confermati" valore={formattaNumero(s.postiSuiBus)}>
          {s.postiSuiBus === 0 && <KpiExtra>nessun bus confermato</KpiExtra>}
        </Kpi>
        <Kpi etichetta="Lista d'attesa" valore={formattaNumero(s.listaAttesa)} />
        {s.partecipanti > 0 && (s.saliti > 0 || passato) && (
          <Kpi etichetta="Saliti a bordo" valore={`${formattaNumero(s.saliti)} su ${formattaNumero(s.partecipanti)}`} />
        )}
        {s.margine !== null && (
          <Kpi etichetta="Margine" valore={formattaEuroIntero(s.margine)} tono={s.margine < 0 ? 'negativo' : undefined}>
            <KpiExtra>costo bus {formattaEuroIntero(s.costoBus ?? 0)} · commissioni {formattaEuroIntero(s.commissioni)}</KpiExtra>
          </Kpi>
        )}
      </GrigliaKpi>

      <Scheda titolo="Ritmo di vendita">
        <GraficoRitmo
          giorni={r.giorni}
          evento={r.evento}
          simili={r.criterioSimili ? r.simili : []}
          posti={s.postiSuiBus}
          oggi={r.oggi}
          testoVuoto="Ancora nessuna vendita da mostrare."
        />
        <p className="stat-didascalia">{didascaliaRitmo}</p>
      </Scheda>

      <Scheda titolo="Linee" conteggio={d.linee.length}>
        {d.linee.length === 0
          ? <Vuoto>Nessuna linea per questo evento.</Vuoto>
          : <div className="stat-linee">{d.linee.map((l) => <BloccoLinea key={l.id} l={l} />)}</div>}
        <p className="stat-didascalia">
          Pareggio al {formattaPercentuale(d.sogliaPareggio)} dei posti (si cambia in Impostazioni).
          {conLineeSenzaBus && ' Una linea senza bus non ha costo né pareggio.'}
          {conQuadratini && ' Ogni quadratino è un posto: pieno se venduto, con il bordo ambra sul posto del pareggio.'}
          {conBarre && ` Oltre ${POSTI_MASSIMI_GRIGLIA} posti una barra: in blu i venduti, il segno ambra è il pareggio.`}
        </p>
      </Scheda>

      <Scheda
        titolo="Fermate"
        azione={(
          <BottoneCsv
            disabilitato={d.fermate.length === 0}
            onScarica={() => scaricaCsv(
              nomeFileCsv(`fermate ${ev.artista} ${formattaGiorno(ev.data)}`),
              ['Tragitto', 'Fermata', 'Attiva', 'Passeggeri', 'Prezzo €', 'Incasso €', 'Anticipo medio (giorni)', "Lista d'attesa"],
              d.fermate.map((f) => [
                f.tragittoNome, f.citta, f.attiva, f.passeggeri, f.prezzo, f.incasso,
                f.anticipoMedioGiorni === null ? null : Math.round(f.anticipoMedioGiorni), f.listaAttesa,
              ]),
            )}
          />
        )}
      >
        {d.fermate.length === 0 ? <Vuoto>Nessuna fermata per questo evento.</Vuoto> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tragitto</th>
                  <th>Fermata</th>
                  <th>Passeggeri</th>
                  <th className="stat-num">Prezzo</th>
                  <th className="stat-num">Incasso</th>
                  <th className="stat-num">Anticipo medio</th>
                  <th className="stat-num">Lista d'attesa</th>
                </tr>
              </thead>
              <tbody>
                {d.fermate.map((f, k) => (
                  <tr key={`${f.tragittoNome}-${f.citta}-${k}`}>
                    <td>{f.tragittoNome}</td>
                    <td>
                      {f.citta}
                      {!f.attiva && <> <span className="badge neutro">non attiva</span></>}
                    </td>
                    <td><MiniBarra valore={f.passeggeri} massimo={maxPasseggeriFermata} testo={formattaNumero(f.passeggeri)} /></td>
                    <td className="stat-num">{f.prezzo === null ? <span className="stat-spento">—</span> : formattaEuro(f.prezzo)}</td>
                    <td className="stat-num">{formattaEuroIntero(f.incasso)}</td>
                    <td className="stat-num">
                      {f.anticipoMedioGiorni === null
                        ? <span className="stat-spento">—</span>
                        : plurale(Math.round(f.anticipoMedioGiorni), 'giorno', 'giorni')}
                    </td>
                    <td className="stat-num">{f.listaAttesa > 0 ? formattaNumero(f.listaAttesa) : <span className="stat-spento">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Scheda>

      <Scheda titolo="Da dove arrivano">
        <BarreOrizzontali
          ariaLabel="Passeggeri per fonte"
          testoVuoto="Ancora nessun passeggero."
          righe={d.perFonte.map((f, k) => ({
            chiave: `${f.tipo}-${k}`,
            etichetta: ETICHETTA_FONTE[f.tipo],
            valore: f.passeggeri,
            testo: pluraleNumero(f.passeggeri, 'passeggero', 'passeggeri'),
          }))}
        />
      </Scheda>
    </>
  );
}

function BloccoLinea({ l }: { l: RigaLineaStatistiche }) {
  const pareggio = senzaBus(l) ? null : l.postiPareggio;
  let badge: { classe: string; testo: string } | null = null;
  if (l.daConfermare) badge = { classe: 'attenzione', testo: 'da confermare' };
  else if (pareggio !== null) {
    if (l.passeggeri === pareggio) badge = { classe: 'coperta', testo: 'pareggio raggiunto' };
    else if (l.passeggeri > pareggio) badge = { classe: 'coperta', testo: 'sopra il pareggio' };
    else badge = { classe: 'non-coperta', testo: 'sotto il pareggio' };
  }

  const liberi = l.posti - l.passeggeri;
  let situazione: ReactNode;
  if (liberi < 0) {
    situazione = <span className="stat-negativo">{pluraleNumero(-liberi, 'passeggero', 'passeggeri')} oltre i posti</span>;
  } else if (pareggio !== null && l.passeggeri < pareggio) {
    const mancano = pareggio - l.passeggeri;
    situazione = `${mancano === 1 ? 'manca' : 'mancano'} ${formattaNumero(mancano)} al pareggio`;
  } else {
    situazione = pluraleNumero(liberi, 'libero', 'liberi');
  }

  return (
    <div className={`stat-linea${l.daConfermare ? ' stat-da-confermare' : ''}`}>
      <div className="stat-linea-testa">
        <div>
          <b>{l.nome}</b>
          {l.tragittoNome && <span className="stat-sotto">{l.tragittoNome}</span>}
        </div>
        {badge && <span className={`badge ${badge.classe}`}>{badge.testo}</span>}
      </div>
      {l.fermate.length > 0 && <p className="stat-linea-fermate">{l.fermate.join(', ')}</p>}
      <GrigliaPosti posti={l.posti} venduti={l.passeggeri} pareggio={pareggio} daConfermare={l.daConfermare} />
      <p className="stat-linea-posti">{formattaNumero(l.passeggeri)} su {pluraleNumero(l.posti, 'posto', 'posti')} · {situazione}</p>
      <div className="stat-info">
        <span>Incasso</span>
        <span>{formattaEuroIntero(l.incasso)}</span>
      </div>
      <div className="stat-info">
        <span>Costo</span>
        <span>
          {l.costo === null ? (
            <span className="stat-spento">nessun bus</span>
          ) : (
            <>
              {formattaEuroIntero(l.costo)}
              {!l.costoCompleto && <> <span className="badge attenzione">costi incompleti</span></>}
            </>
          )}
        </span>
      </div>
      {l.margine !== null && (
        <div className="stat-info">
          <span>Margine</span>
          <span className={l.margine < 0 ? 'stat-negativo' : undefined}>{formattaEuroIntero(l.margine)}</span>
        </div>
      )}
      {l.assegnati > 0 && (
        <div className="stat-info">
          <span>Saliti</span>
          <span>{formattaNumero(l.saliti)} su {formattaNumero(l.assegnati)} assegnati</span>
        </div>
      )}
    </div>
  );
}
