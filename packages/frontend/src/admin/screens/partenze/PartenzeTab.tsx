import { useEffect, useRef, useState } from 'react';
import { eventiApi, type CalcoloBusTragitto, type BusFisico, type RiepilogoEconomicoTratta, type FermataInput } from '../../../api/eventi';
import type { Evento } from '../../../api/types';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { impostazioniApi } from '../../../api/impostazioni';
import { ErroreApi } from '../../../api/client';
import { Modale } from '../../shared/Modale';
import { CampoNumero } from '../../shared/CampoNumero';
import { OrarioInput } from '../../shared/OrarioInput';
import { useSessione } from '../../shared/SessioneContext';
import { geocodifica, durataViaggio, distanzaViaggio, attesa } from '../../shared/geo';
import { haPermesso } from '../../../api/auth';

/** Un solo indicatore di stato per tratta (invece di due badge separati
 *  che si accavallavano): rosso se ha posti superati (il problema più
 *  urgente, ha sempre la precedenza), giallo se ha passeggeri ma manca
 *  ancora copertura sufficiente, verde se tutto ok. Con ZERO
 *  passeggeri confermati non c'è nessun avviso — è solo presto,
 *  nessuno ha ancora prenotato, non è un problema da segnalare come se
 *  qualcosa non andasse (prima mostrava "Non ancora coperta" anche
 *  qui, sembrava un avviso pur non essendoci davvero nulla da fare). */
function statoTragitto(tragitto: CalcoloBusTragitto) {
  // "Da confermare" ha sempre la precedenza su tutto il resto — finché
  // non c'è un bus vero registrato, il tragitto non è nemmeno in
  // vendita (non può avere prenotazioni), quindi gli altri controlli
  // (posti superati, copertura) non hanno ancora senso di essere.
  if (tragitto.stato === 'DA_CONFERMARE') return { classe: 'attenzione', etichetta: '◔ Da confermare — nessun bus registrato ancora, non in vendita' };
  const postiSuperati = tragitto.totalePasseggeri > tragitto.postiTotali;
  if (postiSuperati) return { classe: 'non-coperta', etichetta: `⚠ Posti superati di ${tragitto.totalePasseggeri - tragitto.postiTotali}` };
  if (tragitto.totalePasseggeri === 0) return { classe: 'neutro', etichetta: 'Nessuna prenotazione ancora' };
  if (!tragitto.coperta) return { classe: 'attenzione', etichetta: 'Non ancora coperta' };
  return { classe: 'coperta', etichetta: '✓ Coperta' };
}

/** Sezione "Partenze" di un singolo evento: riepilogo generale, calcolo
 *  bus necessari, copertura tratte, censimento bus fisici. Va dentro la
 *  scheda dell'evento (tab). */
export function PartenzeTab({ eventoId, servizi, tragittoFocus }: {
  eventoId: string;
  servizi?: { key: string; nome: string }[];
  // Arrivando da una card specifica in Partenze (una per "Prezzato",
  // "Da confermare", ecc.) si vuole atterrare DIRETTAMENTE sul
  // pannello giusto per quel tragitto, non su un elenco generico da
  // dover riesplorare — vedi useEffect più sotto.
  tragittoFocus?: { tragittoId: string; azione: 'preventivo' | 'espandi' } | null;
}) {
  const sessione = useSessione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [eventoCompleto, setEventoCompleto] = useState<Evento | null>(null);
  const [tragittoInModifica, setTragittoInModifica] = useState<string | null>(null);
  const [formOperativo, setFormOperativo] = useState<{ prezzoExtra: number; fermate: FermataInput[] } | null>(null);
  const [salvandoOperativo, setSalvandoOperativo] = useState(false);
  const [calcolandoOrari, setCalcolandoOrari] = useState(false);
  const [statoCalcoloOrari, setStatoCalcoloOrari] = useState('');
  // Pannello "Registra preventivo" — per i tragitti ancora "Da
  // confermare": una stima (non un bus vero opzionato) che sblocca la
  // vendita e calcola i prezzi per fermata dal modello di pareggio.
  const [preventivoAperto, setPreventivoAperto] = useState<string | null>(null);
  const [formPreventivo, setFormPreventivo] = useState<{ costo?: number; postiBus?: number }>({});
  // I due numeri della formula prezzi, configurabili da Impostazioni —
  // caricati una volta sola all'apertura, con gli stessi default già
  // usati finora se non sono ancora stati impostati esplicitamente
  // (così non cambia nulla per chi non li ha mai toccati).
  const [parametriFormula, setParametriFormula] = useState({ sogliaOccupazione: 0.5, quotaFissaPercentuale: 0.5 });
  const [prezziCalcolati, setPrezziCalcolati] = useState<{ fermataId: string; citta: string; distanza: number; prezzo: number }[] | null>(null);
  const [calcolandoPreventivo, setCalcolandoPreventivo] = useState(false);
  const [statoCalcoloPreventivo, setStatoCalcoloPreventivo] = useState('');
  const [salvandoPreventivo, setSalvandoPreventivo] = useState(false);
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [economia, setEconomia] = useState<RiepilogoEconomicoTratta[]>([]);
  const [fermateAnagrafica, setFermateAnagrafica] = useState<FermataAnagrafica[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  // Se l'evento ha più servizi, questa sezione si comporta come se
  // ognuno fosse un evento a parte: una tab per servizio (più una per i
  // tragitti liberi, se ce ne sono).
  const [servizioAttivo, setServizioAttivo] = useState<string | 'liberi'>(servizi?.[0]?.key ?? 'liberi');

  function ricarica() {
    setCaricamento(true);
    setErrore('');
    Promise.all([
      eventiApi.calcolaBus(eventoId),
      eventiApi.listaBus(eventoId),
      vedeEconomia ? eventiApi.riepilogoEconomico(eventoId) : Promise.resolve([]),
      eventiApi.getById(eventoId),
    ])
      .then(([c, b, e, ev]) => {
        setCalcolo(c);
        setBusLista(b);
        setEconomia(e);
        // Fase 2 — orario/prezzo/posti si modificano da qui, non più da
        // Eventi: servono i dati VERI di ogni fermata (il calcolo bus
        // sopra ne ha solo una versione minima, per il conteggio
        // passeggeri) — l'evento completo li ha tutti, cercati al
        // bisogno quando si apre il pannello di modifica di un tragitto.
        setEventoCompleto(ev);
        // Se c'è una sola tratta, tanto vale aprirla subito — altrimenti
        // partono tutte chiuse, per non dover scorrere un elenco lungo.
        setAperte((prev) => prev.size === 0 && c.length === 1 ? new Set([c[0].tragittoId]) : prev);
        // Il servizio scelto di default (il primo dell'elenco) potrebbe
        // non avere nessuna prenotazione — la sua tab, in quel caso, non
        // compare più (vedi sopra): sposto la selezione sul primo
        // servizio che ne ha davvero, altrimenti si vedrebbe "nessun
        // tragitto configurato" anche quando in realtà ce ne sono,
        // semplicemente non nel servizio selezionato di default.
        setServizioAttivo((attuale) => {
          const attualeHaPrenotazioni = attuale === 'liberi'
            ? c.some((l) => !l.servizioId && l.totalePasseggeri > 0)
            : c.some((l) => l.servizioId === attuale && l.totalePasseggeri > 0);
          if (attualeHaPrenotazioni) return attuale;
          const primoServizioConPrenotazioni = servizi?.find((v) => c.some((l) => l.servizioId === v.key && l.totalePasseggeri > 0));
          if (primoServizioConPrenotazioni) return primoServizioConPrenotazioni.key;
          if (c.some((l) => !l.servizioId && l.totalePasseggeri > 0)) return 'liberi';
          return attuale; // nessun servizio ha prenotazioni — resta così, comparirà il messaggio "nessun tragitto"
        });
      })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare la sezione Partenze. Controlla i tuoi permessi o riprova.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(() => {
    ricarica();
    fermateAnagraficaApi.list().then(setFermateAnagrafica).catch(() => setFermateAnagrafica([]));
    impostazioniApi.list().then((righe) => {
      const trova = (chiave: string, fallback: number) => {
        const riga = righe.find((r) => r.chiave === chiave);
        const numero = riga ? Number(riga.valore) : NaN;
        return Number.isFinite(numero) && numero > 0 ? numero : fallback;
      };
      setParametriFormula({
        sogliaOccupazione: trova('soglia_occupazione_pareggio', 0.5),
        quotaFissaPercentuale: trova('quota_fissa_percentuale', 0.5),
      });
    }).catch(() => {}); // se non risponde, restano i default — meglio che bloccare il calcolo
  }, [eventoId]);

  // Atterraggio diretto da una card di Partenze — una volta sola,
  // appena i dati sono pronti (non ad ogni ricarica successiva,
  // altrimenti riaprirebbe il pannello anche dopo un salvataggio).
  const focusGestitoRef = useRef(false);
  useEffect(() => {
    if (focusGestitoRef.current || !tragittoFocus || !eventoCompleto) return;
    focusGestitoRef.current = true;
    setAperte((prev) => new Set(prev).add(tragittoFocus.tragittoId));
    if (tragittoFocus.azione === 'preventivo') apriPreventivo(tragittoFocus.tragittoId);
  }, [tragittoFocus, eventoCompleto]);

  function toggleApertura(tragittoId: string) {
    setAperte((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(tragittoId)) nuovo.delete(tragittoId); else nuovo.add(tragittoId);
      return nuovo;
    });
  }

  // Fase 2 — orario/prezzo/posti si modificano da qui, non più da
  // Eventi. I dati veri della fermata (non la versione minima del
  // calcolo bus) arrivano dall'evento completo, già caricato in ricarica().
  function apriModificaOperativa(tragitto: CalcoloBusTragitto) {
    const tragittoVero = eventoCompleto
      ? [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragitto.tragittoId)
      : undefined;
    if (!tragittoVero) return;
    setFormOperativo({
      prezzoExtra: Number(tragittoVero.prezzoExtra),
      fermate: tragittoVero.fermate.map((f) => ({
        fermataAnagraficaId: f.fermataAnagraficaId,
        citta: f.citta, indirizzo: f.indirizzo,
        orario: f.orario ?? undefined, orarioRitorno: f.orarioRitorno ?? undefined, indirizzoRitorno: f.indirizzoRitorno ?? undefined,
        prezzo: f.prezzo ? Number(f.prezzo) : undefined,
        postiMax: f.postiMax ?? undefined,
        tipo: f.tipo, sogliaMinima: f.sogliaMinima, attivo: f.attivo,
      })),
    });
    setTragittoInModifica(tragitto.tragittoId);
    setStatoCalcoloOrari('');
  }

  async function salvaOperativo() {
    if (!tragittoInModifica || !formOperativo) return;
    setSalvandoOperativo(true);
    try {
      await eventiApi.aggiornaTragittoOperativo(tragittoInModifica, formOperativo);
      setTragittoInModifica(null);
      setFormOperativo(null);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvandoOperativo(false);
    }
  }
  function aggiornaFermataOperativa(idx: number, campo: keyof FermataInput, valore: string | number | undefined) {
    setFormOperativo((f) => {
      if (!f) return f;
      const fermate = [...f.fermate];
      fermate[idx] = { ...fermate[idx], [campo]: valore };
      return { ...f, fermate };
    });
  }

  /** Apre il pannello preventivo — se il tragitto ne ha già uno
   *  registrato (stato "Prezzato" o oltre), lo precompila con i dati
   *  veri già salvati (costo, posti presunti, prezzi attuali per
   *  fermata) invece di partire vuoto: prima, una volta registrato il
   *  preventivo, non c'era più modo di rivederlo — bug corretto qui. */
  function apriPreventivo(tragittoId: string) {
    setPreventivoAperto(tragittoId);
    const tragittoVero = eventoCompleto
      ? [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragittoId)
      : undefined;
    if (tragittoVero?.preventivoCosto) {
      setFormPreventivo({ costo: Number(tragittoVero.preventivoCosto), postiBus: tragittoVero.preventivoPostiBus ?? undefined });
      // Mostro subito i prezzi già salvati per ogni fermata (senza
      // dover ricalcolare/richiamare OpenStreetMap solo per vederli) —
      // la distanza qui non è nota (andrebbe ricalcolata), la mostro
      // come "—" finché l'admin non preme di nuovo "Calcola prezzi".
      setPrezziCalcolati(tragittoVero.fermate.filter((f) => f.attivo && f.prezzo).map((f) => ({ fermataId: f.id, citta: f.citta, distanza: -1, prezzo: Number(f.prezzo) })));
      setStatoCalcoloPreventivo('Preventivo già registrato — questi sono i prezzi attuali. Premi "Calcola prezzi" per ricalcolarli da zero se il costo o i posti sono cambiati.');
    } else {
      setFormPreventivo({});
      setPrezziCalcolati(null);
      setStatoCalcoloPreventivo('');
    }
  }

  /** Calcola il prezzo di ogni fermata dal preventivo (modello di
   *  pareggio al 50%: prezzo medio minimo = costo ÷ metà dei posti) +
   *  distanza reale dall'arrivo (quota fissa + per km, calibrate così
   *  che la fermata alla distanza MEDIA paghi esattamente il prezzo
   *  medio minimo — le più lontane pagano di più, le più vicine di
   *  meno, mai sotto la metà del prezzo medio). */
  async function calcolaPrezziPreventivo() {
    if (!preventivoAperto || !eventoCompleto || !formPreventivo.costo || !formPreventivo.postiBus) {
      setStatoCalcoloPreventivo('Inserisci prima costo e posti presunti del bus.');
      return;
    }
    const tragittoVero = [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === preventivoAperto);
    if (!tragittoVero) return;
    // L'arrivo è del tragitto stesso ora, deciso in Eventi — non più
    // di evento/servizio.
    const arrivoIndirizzo = tragittoVero.arrivoIndirizzo;
    const fermateValide = tragittoVero.fermate.filter((f) => f.attivo && f.indirizzo.trim());
    if (fermateValide.length === 0) { setStatoCalcoloPreventivo('Nessuna fermata attiva su questo tragitto.'); return; }
    if (!arrivoIndirizzo?.trim()) { setStatoCalcoloPreventivo('Manca l\'indirizzo di arrivo — impostalo in Eventi, nella scheda di questo tragitto.'); return; }

    setCalcolandoPreventivo(true);
    setStatoCalcoloPreventivo('Localizzo gli indirizzi...');

    const rArrivo = await geocodifica(arrivoIndirizzo);
    await attesa(1100);
    if (!rArrivo.coordinate) {
      setStatoCalcoloPreventivo(rArrivo.erroreRete ? 'Richiesta a OpenStreetMap non riuscita (rete/firewall).' : 'Indirizzo di arrivo non localizzato — controllalo.');
      setCalcolandoPreventivo(false);
      return;
    }

    const distanze: { fermataId: string; citta: string; distanza: number | null }[] = [];
    for (const f of fermateValide) {
      const r = await geocodifica(`${f.indirizzo}, ${f.citta}`);
      await attesa(1100);
      if (!r.coordinate) { distanze.push({ fermataId: f.id, citta: f.citta, distanza: null }); continue; }
      const km = await distanzaViaggio(r.coordinate, rArrivo.coordinate);
      await attesa(300);
      distanze.push({ fermataId: f.id, citta: f.citta, distanza: km });
    }

    const valide = distanze.filter((d): d is { fermataId: string; citta: string; distanza: number } => d.distanza !== null);
    if (valide.length === 0) {
      setStatoCalcoloPreventivo('Nessun indirizzo localizzato — controlla le fermate.');
      setCalcolandoPreventivo(false);
      return;
    }

    const prezzoMedioMinimo = formPreventivo.costo / (formPreventivo.postiBus * parametriFormula.sogliaOccupazione);
    const distanzaMedia = valide.reduce((tot, d) => tot + d.distanza, 0) / valide.length;
    const quotaFissa = parametriFormula.quotaFissaPercentuale * prezzoMedioMinimo;
    const tariffaPerKm = distanzaMedia > 0 ? quotaFissa / distanzaMedia : 0;

    setPrezziCalcolati(valide.map((d) => ({
      fermataId: d.fermataId, citta: d.citta, distanza: d.distanza,
      prezzo: Math.round(quotaFissa + tariffaPerKm * d.distanza),
    })));
    const nonLocalizzate = distanze.length - valide.length;
    setStatoCalcoloPreventivo(nonLocalizzate > 0 ? `Fatto, ma ${nonLocalizzate} fermata/e non localizzata/e: resta senza prezzo, va impostato a mano dopo.` : 'Prezzi calcolati — controllali prima di confermare.');
    setCalcolandoPreventivo(false);
  }

  async function salvaPreventivo() {
    if (!preventivoAperto || !formPreventivo.costo || !formPreventivo.postiBus || !prezziCalcolati) return;
    setSalvandoPreventivo(true);
    try {
      await eventiApi.registraPreventivo(preventivoAperto, {
        preventivoCosto: formPreventivo.costo,
        preventivoPostiBus: formPreventivo.postiBus,
        prezziPerFermata: prezziCalcolati.map((p) => ({ fermataId: p.fermataId, prezzo: p.prezzo })),
      });
      setPreventivoAperto(null);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally {
      setSalvandoPreventivo(false);
    }
  }

  /** Ricalcola gli orari di tutte le fermate a ritroso dall'orario di
   *  arrivo, usando le distanze reali tra gli indirizzi via Nominatim +
   *  OSRM (gratuiti) — stessa identica logica che prima viveva in
   *  Eventi, spostata qui insieme al resto della parte operativa. */
  async function calcolaOrariDaArrivo() {
    if (!tragittoInModifica || !formOperativo || !eventoCompleto) return;
    const tragittoVero = [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragittoInModifica);
    // L'arrivo è del tragitto stesso ora, deciso in Eventi — non più
    // di evento/servizio.
    const arrivoIndirizzoContesto = tragittoVero?.arrivoIndirizzo;
    const arrivoOrarioContesto = tragittoVero?.arrivoOrario;

    const fermateValide = formOperativo.fermate.filter((f) => f.indirizzo.trim());
    if (fermateValide.length === 0) { setStatoCalcoloOrari('Aggiungi almeno una fermata con indirizzo compilato.'); return; }
    if (!arrivoIndirizzoContesto?.trim()) { setStatoCalcoloOrari('Manca l\'indirizzo di arrivo — impostalo in Eventi, nella scheda di questo tragitto.'); return; }
    if (!arrivoOrarioContesto) { setStatoCalcoloOrari('Manca l\'orario di arrivo — impostalo in Eventi, nella scheda di questo tragitto.'); return; }

    setCalcolandoOrari(true);
    setStatoCalcoloOrari('Localizzo gli indirizzi...');

    const indirizziCompleti = [...fermateValide.map((f) => `${f.indirizzo}, ${f.citta}`), arrivoIndirizzoContesto];
    const coordinate: (Awaited<ReturnType<typeof geocodifica>>['coordinate'])[] = [];
    let problemaRete = false;
    for (const indirizzo of indirizziCompleti) {
      const r = await geocodifica(indirizzo);
      coordinate.push(r.coordinate);
      if (r.erroreRete) problemaRete = true;
      await attesa(1100);
    }
    if (problemaRete) {
      setStatoCalcoloOrari('Richiesta a OpenStreetMap non riuscita (rete/firewall). Apri la Console (F12) per il dettaglio.');
      setCalcolandoOrari(false);
      return;
    }

    const durate: (number | null)[] = [];
    for (let i = 0; i < coordinate.length - 1; i++) {
      const a = coordinate[i], b = coordinate[i + 1];
      durate.push(a && b ? await durataViaggio(a, b) : null);
      await attesa(300);
    }

    let cursore = Number(arrivoOrarioContesto.split(':')[0]) * 60 + Number(arrivoOrarioContesto.split(':')[1]);
    const orariCalcolati = new Array<string>(fermateValide.length);
    let errori = 0;
    for (let i = fermateValide.length - 1; i >= 0; i--) {
      const durata = durate[i];
      if (durata === null) { errori++; orariCalcolati[i] = ''; continue; }
      cursore -= durata + 5;
      const h = Math.floor(((cursore % 1440) + 1440) % 1440 / 60);
      const m = ((cursore % 1440) + 1440) % 1440 % 60;
      orariCalcolati[i] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    let idxValido = 0;
    setFormOperativo((f) => {
      if (!f) return f;
      return {
        ...f,
        fermate: f.fermate.map((fer) => {
          if (!fer.indirizzo.trim()) return fer;
          const orario = orariCalcolati[idxValido]; idxValido++;
          return orario ? { ...fer, orario } : fer;
        }),
      };
    });
    setStatoCalcoloOrari(errori ? `Fatto, ma ${errori} indirizzo/i non localizzato/i: controlla a mano.` : 'Orari ricalcolati e applicati.');
    setCalcolandoOrari(false);
  }

  /** Va alla pagina dedicata delle Linee di questo tragitto — un vero
   *  indirizzo (?sezione=linee&evento=...&tragitto=...), non più un
   *  modale qui dentro. */
  function apriPaginaLinee(tragittoIdContesto: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('sezione', 'linee');
    url.searchParams.set('evento', eventoId);
    url.searchParams.set('tragitto', tragittoIdContesto);
    window.location.href = url.toString();
  }

  if (caricamento) return <p className="testo-intro">Caricamento...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  // Se ci sono servizi, questa sezione si comporta come se ognuno fosse
  // un evento a parte: filtro i tragitti mostrati secondo la tab scelta.
  const calcoloVisibile = (servizi && servizi.length > 0)
    ? calcolo.filter((l) => (servizioAttivo === 'liberi' ? !l.servizioId : l.servizioId === servizioAttivo))
    : calcolo;
  const trattoCoperteVisibili = calcoloVisibile.filter((l) => l.coperta).length;
  const trattoConProblemiVisibili = calcoloVisibile.filter((l) => l.totalePasseggeri > l.postiTotali).length;

  return (
    <div>
      {servizi && servizi.length > 0 && (
        <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {servizi
            // Un servizio con almeno un tragitto configurato ha
            // qualcosa da gestire qui — non serve aspettare che abbia
            // già prenotazioni (un evento appena confermato, ancora
            // senza prenotazioni, deve comunque mostrare le sue tab).
            .filter((v) => calcolo.some((l) => l.servizioId === v.key))
            .map((v) => {
            const nonCopertiQui = calcolo.filter((l) => l.servizioId === v.key && l.totalePasseggeri > 0 && !l.coperta).length;
            return (
              <button key={v.key} type="button" className={`mini-tab${servizioAttivo === v.key ? ' active' : ''}`} onClick={() => setServizioAttivo(v.key)}>
                {v.nome}
                {nonCopertiQui > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>
                    {nonCopertiQui}
                  </span>
                )}
              </button>
            );
          })}
          {calcolo.some((l) => !l.servizioId) && (() => {
            const nonCopertiLiberi = calcolo.filter((l) => !l.servizioId && l.totalePasseggeri > 0 && !l.coperta).length;
            return (
              <button type="button" className={`mini-tab${servizioAttivo === 'liberi' ? ' active' : ''}`} onClick={() => setServizioAttivo('liberi')}>
                Tragitti liberi
                {nonCopertiLiberi > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>
                    {nonCopertiLiberi}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {calcoloVisibile.length === 0 && (
        <p className="testo-intro">Questa scheda non ha ancora nessun tragitto configurato — vai nella tab "Dettagli" per aggiungerne uno.</p>
      )}

      {calcoloVisibile.length > 0 && (
        <div className="section-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
          <span className="chip">{calcoloVisibile.length} tragitt{calcoloVisibile.length === 1 ? 'o' : 'i'}</span>
          <span className="chip">{trattoCoperteVisibili}/{calcoloVisibile.length} coperte</span>
          <span className="chip">{busLista.length} bus censit{busLista.length === 1 ? 'o' : 'i'}</span>
          {trattoConProblemiVisibili > 0 && (
            <span className="badge non-coperta">⚠ {trattoConProblemiVisibili} tragitt{trattoConProblemiVisibili === 1 ? 'o' : 'i'} con posti superati</span>
          )}
        </div>
      )}

      {calcoloVisibile.map((tragitto) => {
        const stato = statoTragitto(tragitto);
        const busTragitto = busLista.filter((b) => b.tragittiIds.includes(tragitto.tragittoId));
        const espansa = aperte.has(tragitto.tragittoId);
        return (
        <div key={tragitto.tragittoId} className="section-card" style={stato.classe === 'non-coperta' ? { borderColor: 'var(--pink)' } : undefined}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
            onClick={() => toggleApertura(tragitto.tragittoId)}
          >
            <div>
              <h3>{espansa ? '▾' : '▸'} {tragitto.nome}</h3>
              <p className="section-sub">
                {tragitto.totalePasseggeri} passeggeri confermati su {tragitto.postiTotali} posti previsti · {busTragitto.length} bus censit{busTragitto.length === 1 ? 'o' : 'i'}
                {vedeEconomia && (() => {
                  const dati = economia.find((e) => e.tragittoId === tragitto.tragittoId);
                  if (!dati) return null;
                  return (
                    <>
                      {' · '}
                      <span style={{ color: '#5be0a0' }}>€{dati.incassato.toFixed(2)}</span>
                      {dati.costoCensito && (
                        <> {' · '}<span style={{ color: dati.guadagno >= 0 ? '#5be0a0' : 'var(--pink)' }}>€{dati.guadagno.toFixed(2)}</span></>
                      )}
                    </>
                  );
                })()}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <span className={`badge ${stato.classe}`}>{stato.etichetta}</span>
              {tragitto.stato === 'PREZZATO' && (
                <span style={{ fontSize: 10.5, color: 'var(--mist)' }}>Prezzato, bus vero ancora da opzionare</span>
              )}
              <button
                type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px' }}
                onClick={(e) => { e.stopPropagation(); apriModificaOperativa(tragitto); }}
              >
                Modifica orario/prezzo/posti
              </button>
              <button
                type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px' }}
                onClick={(e) => { e.stopPropagation(); apriPaginaLinee(tragitto.tragittoId); }}
              >
                Gestisci Linee{busTragitto.length > 0 ? ` (${busTragitto.length})` : ''}
              </button>
              <button
                type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px', borderColor: 'var(--pink-dim)', color: 'var(--pink)' }}
                onClick={(e) => { e.stopPropagation(); apriPreventivo(tragitto.tragittoId); }}
              >
                {tragitto.stato === 'DA_CONFERMARE' ? 'Registra preventivo' : 'Vedi/modifica preventivo'}
              </button>
            </div>
          </div>

          {espansa && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                <strong>Bus suggeriti: {tragitto.busSuggeriti}</strong>
                <span style={{ color: 'var(--mist)' }}> — stima in base ai passeggeri per fermata; l'orario di ogni bus resta da compilare a mano.</span>
              </p>

              <p style={{ fontSize: 13, marginBottom: 12, color: 'var(--mist)' }}>
                {tragitto.postiBusCensiti > 0
                  ? <>Bus censiti: <strong style={{ color: 'var(--paper)' }}>{tragitto.postiBusCensiti} posti</strong> per {tragitto.totalePasseggeri} passeggeri confermati — la copertura si aggiorna da sola in base a quanto censisci qui sotto.</>
                  : 'Nessun bus con posti indicati ancora censito su questo tragitto — la copertura si aggiornerà da sola appena ne censisci uno.'}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                {tragitto.fermate.map((f) => (
                  <span key={f.fermataId} className="chip">{f.citta} <span className="chip-num">{f.passeggeri}</span></span>
                ))}
              </div>

              {(() => {
                const dati = economia.find((e) => e.tragittoId === tragitto.tragittoId);
                if (!dati) return null;
                return (
                  <div className="section-divider" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <p className="section-label" style={{ marginBottom: 4 }}>Incassato</p>
                      <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, color: '#5be0a0' }}>€{dati.incassato.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="section-label" style={{ marginBottom: 4 }}>Costo bus</p>
                      <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 16 }}>
                        {dati.costoCensito ? `€${dati.costo.toFixed(2)}` : <span style={{ color: 'var(--mist)' }}>non censito</span>}
                      </p>
                    </div>
                    <div>
                      <p className="section-label" style={{ marginBottom: 4 }}>Guadagno</p>
                      <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 16, color: dati.costoCensito ? (dati.guadagno >= 0 ? '#5be0a0' : 'var(--pink)') : 'var(--mist)' }}>
                        {dati.costoCensito ? `€${dati.guadagno.toFixed(2)}` : '—'}
                      </p>
                      {!dati.costoCensito && (
                        <p className="testo-intro" style={{ fontSize: 11, marginTop: 2 }}>Compila il costo su almeno un bus per calcolarlo</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        );
      })}

      {tragittoInModifica && formOperativo && (
        <Modale titolo="Orario, prezzo e posti" onClose={() => setTragittoInModifica(null)} larga>
          <p className="testo-intro" style={{ marginBottom: 16 }}>
            Solo per questa partenza — il nome e la sequenza di fermate restano quelli definiti in Eventi.
          </p>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div>
              <p className="section-label" style={{ marginBottom: 4 }}>Posti totali</p>
              <p style={{ fontSize: 15, fontWeight: 600 }}>
                {calcolo.find((l) => l.tragittoId === tragittoInModifica)?.postiTotali ?? 0}
                <span style={{ fontSize: 11.5, color: 'var(--mist)', fontWeight: 400 }}> — dalla somma dei bus censiti qui sotto, non si scrive più a mano</span>
              </p>
            </div>
            <label>Prezzo extra del tragitto (€)
              <CampoNumero valuta value={formOperativo.prezzoExtra} onChange={(v) => setFormOperativo((f) => f && { ...f, prezzoExtra: v ?? 0 })} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="section-label">Fermate</p>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={calcolaOrariDaArrivo} disabled={calcolandoOrari}>
              {calcolandoOrari ? 'Calcolo orari...' : '↻ Calcola orari dall\'arrivo'}
            </button>
          </div>
          {statoCalcoloOrari && <p className="testo-intro" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>{statoCalcoloOrari}</p>}
          {formOperativo.fermate.map((f, idx) => (
            <div key={idx} className="section-card" style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontWeight: 600, fontSize: 13.5 }}>{f.citta} <span style={{ color: 'var(--mist)', fontWeight: 400 }}>— {f.indirizzo}</span></p>
                <button
                  type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                  onClick={() => setFormOperativo((form) => form && { ...form, fermate: form.fermate.filter((_, i) => i !== idx) })}
                >
                  Rimuovi
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label>Orario</label>
                  <OrarioInput value={f.orario ?? ''} onChange={(v) => aggiornaFermataOperativa(idx, 'orario', v)} />
                </div>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label>Prezzo (€)</label>
                  <CampoNumero valuta placeholder="es. 30" value={f.prezzo} onChange={(v) => aggiornaFermataOperativa(idx, 'prezzo', v)} />
                </div>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label>Posti max</label>
                  <CampoNumero placeholder="facolt." value={f.postiMax} onChange={(v) => aggiornaFermataOperativa(idx, 'postiMax', v)} />
                </div>
              </div>
            </div>
          ))}
          {/* Aggiungere/togliere una fermata da qui vale SOLO per
              questa partenza specifica — non tocca il modello
              universale in Eventi, né altri eventi che usano lo stesso
              tragitto/percorso salvato (esattamente la "particolarità
              per quella partenza" discussa). */}
          {fermateAnagrafica.length > 0 && (
            <select
              value=""
              style={{ marginBottom: 16 }}
              onChange={(e) => {
                const scelta = fermateAnagrafica.find((fa) => fa.id === e.target.value);
                if (!scelta) return;
                setFormOperativo((form) => form && {
                  ...form,
                  fermate: [...form.fermate, { fermataAnagraficaId: scelta.id, citta: scelta.citta, indirizzo: scelta.indirizzo }],
                });
              }}
            >
              <option value="" disabled>+ Aggiungi una fermata a questa partenza...</option>
              {fermateAnagrafica.map((fa) => (
                <option key={fa.id} value={fa.id}>{fa.nome === fa.citta ? fa.nome : `${fa.nome} — ${fa.citta}`}</option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={salvandoOperativo} onClick={salvaOperativo}>
            {salvandoOperativo ? 'Salvo...' : 'Salva'}
          </button>
        </Modale>
      )}

      {preventivoAperto && (
        <Modale titolo="Registra preventivo" onClose={() => setPreventivoAperto(null)} larga>
          <p className="testo-intro" style={{ marginBottom: 16 }}>
            Una stima dal fornitore (non un bus vero ancora opzionato) sullo scenario più caro — sblocca la vendita, coi prezzi calcolati per fermata. Se poi costruisci una Linea più economica, il margine extra resta un guadagno in più.
          </p>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <label>Costo del preventivo (€)
              <CampoNumero valuta value={formPreventivo.costo} onChange={(v) => setFormPreventivo((f) => ({ ...f, costo: v }))} />
            </label>
            <label>Posti presunti del bus
              <CampoNumero value={formPreventivo.postiBus} onChange={(v) => setFormPreventivo((f) => ({ ...f, postiBus: v }))} />
            </label>
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={calcolaPrezziPreventivo} disabled={calcolandoPreventivo}>
            {calcolandoPreventivo ? 'Calcolo prezzi...' : '↻ Calcola prezzi per fermata'}
          </button>
          {statoCalcoloPreventivo && <p className="testo-intro" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>{statoCalcoloPreventivo}</p>}
          {prezziCalcolati && prezziCalcolati.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Prezzi calcolati — controllali prima di confermare</p>
              {prezziCalcolati.map((p) => (
                <div key={p.fermataId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
                  <span>{p.citta} <span style={{ color: 'var(--mist)', fontSize: 12 }}>({p.distanza >= 0 ? `${p.distanza} km dall'arrivo` : 'distanza da ricalcolare'})</span></span>
                  <strong>€{p.prezzo}</strong>
                </div>
              ))}
            </div>
          )}
          <button
            type="button" className="btn btn-primary" style={{ width: '100%' }}
            disabled={!prezziCalcolati || prezziCalcolati.length === 0 || salvandoPreventivo}
            onClick={salvaPreventivo}
          >
            {salvandoPreventivo ? 'Salvo...' : 'Conferma e vai in vendita'}
          </button>
        </Modale>
      )}

    </div>
  );
}
