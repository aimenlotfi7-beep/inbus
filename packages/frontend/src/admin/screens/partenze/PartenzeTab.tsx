import { useEffect, useRef, useState } from 'react';
import { eventiApi, type CalcoloBusTragitto, type BusFisico, type RiepilogoEconomicoTratta, type FermataInput, type Linea } from '../../../api/eventi';
import type { Evento } from '../../../api/types';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { impostazioniApi } from '../../../api/impostazioni';
import { ErroreApi } from '../../../api/client';
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
export function PartenzeTab({ eventoId, servizi, contestoPartenze, onNavigaTab }: {
  eventoId: string;
  servizi?: { key: string; nome: string }[];
  // Arrivando da una card di Partenze (raggruppata per evento, che può
  // comparire in più tab insieme se le sue parti sono in stati
  // diversi) — quali tragitti sono rilevanti per QUESTO contesto
  // specifico (filtra i servizi mostrati a solo quelli coinvolti) e
  // quale azione eseguire subito sul primo di loro.
  contestoPartenze?: { tragittiIds: string[]; azione: 'fermate' | 'preventivo' | 'linee' | 'espandi'; tabOrigine: 'fermate' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate' } | null;
  // Dalla vista "Confermato" (righe Fermate/Preventivo/Linee), cliccando
  // "Modifica" si torna alla lista di Partenze con la tab in alto
  // corrispondente già selezionata — non un editor in linea qui, per
  // scelta esplicita.
  onNavigaTab?: (tab: 'fermate' | 'da-prezzare' | 'da-confermare') => void;
}) {
  const sessione = useSessione();
  const vedeEconomia = haPermesso(sessione, 'eventi.economia');
  const [calcolo, setCalcolo] = useState<CalcoloBusTragitto[]>([]);
  const [eventoCompleto, setEventoCompleto] = useState<Evento | null>(null);
  // Mappa tragittoId -> form in modifica — non più un solo tragitto alla
  // volta: un evento con più servizi/percorsi nello stesso contesto (es.
  // "Fermate") deve poter avere PIÙ pannelli aperti insieme, altrimenti
  // si resta bloccati sul secondo tragitto mentre si lavora sul primo
  // (bug segnalato: "non riesco a calcolare gli orari per il secondo
  // tragitto e continuare").
  const [formOperativoMap, setFormOperativoMap] = useState<Map<string, { prezzoExtra: number; fermate: FermataInput[] }>>(new Map());
  const [salvandoOperativoSet, setSalvandoOperativoSet] = useState<Set<string>>(new Set());
  const [calcolandoOrariSet, setCalcolandoOrariSet] = useState<Set<string>>(new Set());
  const [statoCalcoloOrariMap, setStatoCalcoloOrariMap] = useState<Map<string, string>>(new Map());
  // Pannello "Registra preventivo" — per i tragitti ancora "Da
  // confermare": una stima (non un bus vero opzionato) che sblocca la
  // vendita e calcola i prezzi per fermata dal modello di pareggio.
  // Stessa ragione sopra: mappa per tragittoId, non un solo tragitto.
  const [formPreventivoMap, setFormPreventivoMap] = useState<Map<string, { costo?: number; postiBus?: number }>>(new Map());
  // I due numeri della formula prezzi, configurabili da Impostazioni —
  // caricati una volta sola all'apertura, con gli stessi default già
  // usati finora se non sono ancora stati impostati esplicitamente
  // (così non cambia nulla per chi non li ha mai toccati).
  const [parametriFormula, setParametriFormula] = useState({ sogliaOccupazione: 0.5, quotaFissaPercentuale: 0.5 });
  const [prezziCalcolatiMap, setPrezziCalcolatiMap] = useState<Map<string, { fermataId: string; citta: string; distanza: number; prezzo: number }[]>>(new Map());
  const [calcolandoPreventivoSet, setCalcolandoPreventivoSet] = useState<Set<string>>(new Set());
  const [statoCalcoloPreventivoMap, setStatoCalcoloPreventivoMap] = useState<Map<string, string>>(new Map());
  const [salvandoPreventivoSet, setSalvandoPreventivoSet] = useState<Set<string>>(new Set());
  const [busLista, setBusLista] = useState<BusFisico[]>([]);
  const [economia, setEconomia] = useState<RiepilogoEconomicoTratta[]>([]);
  const [fermateAnagrafica, setFermateAnagrafica] = useState<FermataAnagrafica[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  // Caricate su richiesta, solo per i tragitti espansi in "Confermato"
  // (riga "Linee" del riepilogo a righe) — non serve per tutti gli
  // altri contesti, niente da guadagnare a caricarle sempre.
  const [lineePerTragitto, setLineePerTragitto] = useState<Map<string, Linea[]>>(new Map());
  function caricaLineeSeServe(tragittoId: string) {
    if (lineePerTragitto.has(tragittoId)) return;
    eventiApi.listaLinee(tragittoId).then((l) => setLineePerTragitto((prev) => new Map(prev).set(tragittoId, l))).catch(() => {});
  }
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
  // Espande TUTTI i tragitti del contesto (potrebbero essere più di
  // uno, se l'evento ha più servizi/percorsi nello stesso stato) e
  // sposta la tab servizio sul primo di loro; l'azione (preventivo,
  // Linee) parte solo per quel primo.
  const focusGestitoRef = useRef(false);
  useEffect(() => {
    if (focusGestitoRef.current || !contestoPartenze || !eventoCompleto || calcolo.length === 0) return;
    focusGestitoRef.current = true;
    setAperte((prev) => {
      const nuovo = new Set(prev);
      for (const id of contestoPartenze.tragittiIds) nuovo.add(id);
      return nuovo;
    });
    const primoTragittoId = contestoPartenze.tragittiIds[0];
    if (!primoTragittoId) return;
    const tuttiITragitti = [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)];
    const primoTragitto = tuttiITragitti.find((t) => t.id === primoTragittoId);
    if (primoTragitto) setServizioAttivo(primoTragitto.servizioId ?? 'liberi');
    if (contestoPartenze.azione === 'preventivo') apriPreventivo(primoTragittoId);
    if (contestoPartenze.azione === 'linee') apriPaginaLinee(primoTragittoId);
    if (contestoPartenze.azione === 'fermate') {
      const primoCalcolo = calcolo.find((c) => c.tragittoId === primoTragittoId);
      if (primoCalcolo) apriModificaOperativa(primoCalcolo);
    }
  }, [contestoPartenze, eventoCompleto, calcolo]);

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
  /** Esporta le fermate di un tragitto in CSV (si apre in Excel) — da
   *  mandare al fornitore per farsi fare il preventivo: città,
   *  indirizzo e orario di ognuna. */
  function esportaFermateCsv(nomeTragitto: string, fermate: FermataInput[]) {
    const intestazione = ['Città', 'Indirizzo', 'Orario'];
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const righeCsv = fermate.map((f) => [f.citta, f.indirizzo, f.orario ?? ''].map(escapeCsv).join(';'));
    const csv = '\uFEFF' + [intestazione.join(';'), ...righeCsv].join('\n'); // BOM per accenti corretti in Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fermate-${nomeTragitto.replace(/[^a-z0-9]+/gi, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function apriModificaOperativa(tragitto: CalcoloBusTragitto) {
    const tragittoVero = eventoCompleto
      ? [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragitto.tragittoId)
      : undefined;
    if (!tragittoVero) return;
    setFormOperativoMap((prev) => new Map(prev).set(tragitto.tragittoId, {
      prezzoExtra: Number(tragittoVero.prezzoExtra),
      fermate: tragittoVero.fermate.map((f) => ({
        fermataAnagraficaId: f.fermataAnagraficaId,
        citta: f.citta, indirizzo: f.indirizzo,
        orario: f.orario ?? undefined, orarioRitorno: f.orarioRitorno ?? undefined, indirizzoRitorno: f.indirizzoRitorno ?? undefined,
        prezzo: f.prezzo ? Number(f.prezzo) : undefined,
        postiMax: f.postiMax ?? undefined,
        tipo: f.tipo, sogliaMinima: f.sogliaMinima, attivo: f.attivo,
      })),
    }));
    setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragitto.tragittoId, ''));
  }
  function chiudiModificaOperativa(tragittoId: string) {
    setFormOperativoMap((prev) => { const m = new Map(prev); m.delete(tragittoId); return m; });
  }

  async function salvaOperativo(tragittoId: string) {
    const form = formOperativoMap.get(tragittoId);
    if (!form) return;
    setSalvandoOperativoSet((prev) => new Set(prev).add(tragittoId));
    try {
      await eventiApi.aggiornaTragittoOperativo(tragittoId, form);
      chiudiModificaOperativa(tragittoId);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvandoOperativoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
    }
  }
  function aggiornaFermataOperativa(tragittoId: string, idx: number, campo: keyof FermataInput, valore: string | number | undefined) {
    setFormOperativoMap((prev) => {
      const f = prev.get(tragittoId);
      if (!f) return prev;
      const fermate = [...f.fermate];
      fermate[idx] = { ...fermate[idx], [campo]: valore };
      return new Map(prev).set(tragittoId, { ...f, fermate });
    });
  }

  /** Apre il pannello preventivo — se il tragitto ne ha già uno
   *  registrato (stato "Prezzato" o oltre), lo precompila con i dati
   *  veri già salvati (costo, posti presunti, prezzi attuali per
   *  fermata) invece di partire vuoto: prima, una volta registrato il
   *  preventivo, non c'era più modo di rivederlo — bug corretto qui. */
  function apriPreventivo(tragittoId: string) {
    setAperte((prev) => new Set(prev).add(tragittoId));
    const tragittoVero = eventoCompleto
      ? [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragittoId)
      : undefined;
    if (tragittoVero?.preventivoCosto) {
      setFormPreventivoMap((prev) => new Map(prev).set(tragittoId, { costo: Number(tragittoVero.preventivoCosto), postiBus: tragittoVero.preventivoPostiBus ?? undefined }));
      // Mostro subito i prezzi già salvati per ogni fermata (senza
      // dover ricalcolare/richiamare OpenStreetMap solo per vederli) —
      // la distanza qui non è nota (andrebbe ricalcolata), la mostro
      // come "—" finché l'admin non preme di nuovo "Calcola prezzi".
      setPrezziCalcolatiMap((prev) => new Map(prev).set(tragittoId, tragittoVero.fermate.filter((f) => f.attivo && f.prezzo).map((f) => ({ fermataId: f.id, citta: f.citta, distanza: -1, prezzo: Number(f.prezzo) }))));
      setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, 'Preventivo già registrato — questi sono i prezzi attuali. Premi "Calcola prezzi" per ricalcolarli da zero se il costo o i posti sono cambiati.'));
    } else {
      setFormPreventivoMap((prev) => new Map(prev).set(tragittoId, {}));
      setPrezziCalcolatiMap((prev) => { const m = new Map(prev); m.delete(tragittoId); return m; });
      setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, ''));
    }
  }
  function chiudiPreventivo(tragittoId: string) {
    setFormPreventivoMap((prev) => { const m = new Map(prev); m.delete(tragittoId); return m; });
  }

  /** Calcola il prezzo di ogni fermata dal preventivo (modello di
   *  pareggio al 50%: prezzo medio minimo = costo ÷ metà dei posti) +
   *  distanza reale dall'arrivo (quota fissa + per km, calibrate così
   *  che la fermata alla distanza MEDIA paghi esattamente il prezzo
   *  medio minimo — le più lontane pagano di più, le più vicine di
   *  meno, mai sotto la metà del prezzo medio). */
  async function calcolaPrezziPreventivo(tragittoId: string) {
    const formPreventivo = formPreventivoMap.get(tragittoId);
    if (!eventoCompleto || !formPreventivo?.costo || !formPreventivo?.postiBus) {
      setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, 'Inserisci prima costo e posti presunti del bus.'));
      return;
    }
    const tragittoVero = [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragittoId);
    if (!tragittoVero) return;
    // L'arrivo è del tragitto stesso ora, deciso in Eventi — non più
    // di evento/servizio.
    const arrivoIndirizzo = tragittoVero.arrivoIndirizzo;
    const fermateValide = tragittoVero.fermate.filter((f) => f.attivo && f.indirizzo.trim());
    if (fermateValide.length === 0) { setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, 'Nessuna fermata attiva su questo tragitto.')); return; }
    if (!arrivoIndirizzo?.trim()) { setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, 'Manca l\'indirizzo di arrivo — impostalo in Eventi, nella scheda di questo tragitto.')); return; }

    setCalcolandoPreventivoSet((prev) => new Set(prev).add(tragittoId));
    setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, 'Localizzo gli indirizzi...'));

    const rArrivo = await geocodifica(arrivoIndirizzo);
    await attesa(1100);
    if (!rArrivo.coordinate) {
      setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, rArrivo.erroreRete ? 'Richiesta a OpenStreetMap non riuscita (rete/firewall).' : 'Indirizzo di arrivo non localizzato — controllalo.'));
      setCalcolandoPreventivoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
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
      setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, 'Nessun indirizzo localizzato — controlla le fermate.'));
      setCalcolandoPreventivoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
      return;
    }

    const prezzoMedioMinimo = formPreventivo.costo / (formPreventivo.postiBus * parametriFormula.sogliaOccupazione);
    const distanzaMedia = valide.reduce((tot, d) => tot + d.distanza, 0) / valide.length;
    const quotaFissa = parametriFormula.quotaFissaPercentuale * prezzoMedioMinimo;
    const tariffaPerKm = distanzaMedia > 0 ? quotaFissa / distanzaMedia : 0;

    setPrezziCalcolatiMap((prev) => new Map(prev).set(tragittoId, valide.map((d) => ({
      fermataId: d.fermataId, citta: d.citta, distanza: d.distanza,
      prezzo: Math.round(quotaFissa + tariffaPerKm * d.distanza),
    }))));
    const nonLocalizzate = distanze.length - valide.length;
    setStatoCalcoloPreventivoMap((prev) => new Map(prev).set(tragittoId, nonLocalizzate > 0 ? `Fatto, ma ${nonLocalizzate} fermata/e non localizzata/e: resta senza prezzo, va impostato a mano dopo.` : 'Prezzi calcolati — controllali prima di confermare.'));
    setCalcolandoPreventivoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
  }

  async function salvaPreventivo(tragittoId: string) {
    const formPreventivo = formPreventivoMap.get(tragittoId);
    const prezziCalcolati = prezziCalcolatiMap.get(tragittoId);
    if (!formPreventivo?.costo || !formPreventivo?.postiBus || !prezziCalcolati) return;
    setSalvandoPreventivoSet((prev) => new Set(prev).add(tragittoId));
    try {
      await eventiApi.registraPreventivo(tragittoId, {
        preventivoCosto: formPreventivo.costo,
        preventivoPostiBus: formPreventivo.postiBus,
        prezziPerFermata: prezziCalcolati.map((p) => ({ fermataId: p.fermataId, prezzo: p.prezzo })),
      });
      chiudiPreventivo(tragittoId);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    } finally {
      setSalvandoPreventivoSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
    }
  }

  /** Ricalcola gli orari di tutte le fermate a ritroso dall'orario di
   *  arrivo, usando le distanze reali tra gli indirizzi via Nominatim +
   *  OSRM (gratuiti) — stessa identica logica che prima viveva in
   *  Eventi, spostata qui insieme al resto della parte operativa. */
  async function calcolaOrariDaArrivo(tragittoId: string) {
    const formOperativo = formOperativoMap.get(tragittoId);
    if (!formOperativo || !eventoCompleto) return;
    const tragittoVero = [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragittoId);
    // L'arrivo è del tragitto stesso ora, deciso in Eventi — non più
    // di evento/servizio.
    const arrivoIndirizzoContesto = tragittoVero?.arrivoIndirizzo;
    const arrivoOrarioContesto = tragittoVero?.arrivoOrario;

    const fermateValide = formOperativo.fermate.filter((f) => f.indirizzo.trim());
    if (fermateValide.length === 0) { setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, 'Aggiungi almeno una fermata con indirizzo compilato.')); return; }
    if (!arrivoIndirizzoContesto?.trim()) { setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, 'Manca l\'indirizzo di arrivo — impostalo in Eventi, nella scheda di questo tragitto.')); return; }
    if (!arrivoOrarioContesto) { setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, 'Manca l\'orario di arrivo — impostalo in Eventi, nella scheda di questo tragitto.')); return; }

    setCalcolandoOrariSet((prev) => new Set(prev).add(tragittoId));
    setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, 'Localizzo gli indirizzi...'));

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
      setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, 'Richiesta a OpenStreetMap non riuscita (rete/firewall). Apri la Console (F12) per il dettaglio.'));
      setCalcolandoOrariSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
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
    setFormOperativoMap((prev) => {
      const f = prev.get(tragittoId);
      if (!f) return prev;
      return new Map(prev).set(tragittoId, {
        ...f,
        fermate: f.fermate.map((fer) => {
          if (!fer.indirizzo.trim()) return fer;
          const orario = orariCalcolati[idxValido]; idxValido++;
          return orario ? { ...fer, orario } : fer;
        }),
      });
    });
    setStatoCalcoloOrariMap((prev) => new Map(prev).set(tragittoId, errori ? `Fatto, ma ${errori} indirizzo/i non localizzato/i: controlla a mano.` : 'Orari ricalcolati e applicati.'));
    setCalcolandoOrariSet((prev) => { const s = new Set(prev); s.delete(tragittoId); return s; });
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
  const calcoloVisibile = ((servizi && servizi.length > 0)
    ? calcolo.filter((l) => (servizioAttivo === 'liberi' ? !l.servizioId : l.servizioId === servizioAttivo))
    : calcolo
  ).filter((l) => !contestoPartenze || contestoPartenze.tragittiIds.includes(l.tragittoId));
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
            // Se si arriva da una card di Partenze con un contesto
            // specifico (es. "Da prezzare"), si vedono SOLO i servizi
            // coinvolti in quello stato — non tutti quelli dell'evento,
            // per restare sulla porzione rilevante a quella card.
            .filter((v) => calcolo.some((l) => l.servizioId === v.key))
            .filter((v) => !contestoPartenze || calcolo.some((l) => l.servizioId === v.key && contestoPartenze.tragittiIds.includes(l.tragittoId)))
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
          {calcolo.some((l) => !l.servizioId) && (!contestoPartenze || calcolo.some((l) => !l.servizioId && contestoPartenze.tragittiIds.includes(l.tragittoId))) && (() => {
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

      {contestoPartenze && (() => {
        const ETICHETTE_CONTESTO: Record<string, string> = {
          fermate: 'Fermate', 'da-prezzare': 'Da prezzare', 'da-confermare': 'Da confermare', confermato: 'Confermato', passate: 'Passate',
        };
        return (
          <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            {(['fermate', 'da-prezzare', 'da-confermare', 'confermato', 'passate']).map((t) => (
              <span key={t} className={`mini-tab${t === contestoPartenze.tabOrigine ? ' active' : ''}`} style={{ cursor: 'default' }}>
                {ETICHETTE_CONTESTO[t]}
              </span>
            ))}
          </div>
        );
      })()}

      {calcoloVisibile.map((tragitto) => {
        const stato = statoTragitto(tragitto);
        const busTragitto = busLista.filter((b) => b.tragittiIds.includes(tragitto.tragittoId));
        const espansa = aperte.has(tragitto.tragittoId);
        // La freccia (e la logica "c'è contenuto sotto") deve riflettere
        // anche i pannelli Fermate/Preventivo aperti, non solo "espansa"
        // — altrimenti cliccare l'intestazione per "richiudere" mentre
        // un pannello è aperto lascerebbe la freccia sbagliata (▸ con
        // contenuto ancora visibile sotto, dato che quei pannelli non
        // dipendono da "espansa").
        const mostraContenuto = espansa || formOperativoMap.has(tragitto.tragittoId) || formPreventivoMap.has(tragitto.tragittoId);
        return (
        <div key={tragitto.tragittoId} className="section-card" style={stato.classe === 'non-coperta' ? { borderColor: 'var(--pink)' } : undefined}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
            onClick={() => toggleApertura(tragitto.tragittoId)}
          >
            <div>
              <h3>{mostraContenuto ? '▾' : '▸'} {tragitto.nome}</h3>
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
              {!contestoPartenze && (
                <>
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
                </>
              )}
            </div>
          </div>

          {(() => {
            const formOperativo = formOperativoMap.get(tragitto.tragittoId);
            const formPreventivo = formPreventivoMap.get(tragitto.tragittoId);
            const prezziCalcolati = prezziCalcolatiMap.get(tragitto.tragittoId);
            const statoCalcoloOrari = statoCalcoloOrariMap.get(tragitto.tragittoId) ?? '';
            const statoCalcoloPreventivo = statoCalcoloPreventivoMap.get(tragitto.tragittoId) ?? '';
            const calcolandoOrari = calcolandoOrariSet.has(tragitto.tragittoId);
            const calcolandoPreventivo = calcolandoPreventivoSet.has(tragitto.tragittoId);
            const salvandoOperativo = salvandoOperativoSet.has(tragitto.tragittoId);
            const salvandoPreventivo = salvandoPreventivoSet.has(tragitto.tragittoId);

            if (formOperativo) return (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <p className="section-label" style={{ marginBottom: 0 }}>Fermate</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => calcolaOrariDaArrivo(tragitto.tragittoId)} disabled={calcolandoOrari}>
                      {calcolandoOrari ? 'Calcolo orari...' : '↻ Calcola orari dall\'arrivo'}
                    </button>
                    <button
                      type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }}
                      onClick={() => esportaFermateCsv(tragitto.nome, formOperativo.fermate)}
                    >
                      ⤓ Esporta CSV per il fornitore
                    </button>
                  </div>
                </div>
                {statoCalcoloOrari && <p className="testo-intro" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>{statoCalcoloOrari}</p>}
                {formOperativo.fermate.map((f, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{f.citta} <span style={{ color: 'var(--mist)' }}>— {f.indirizzo}</span></span>
                    <div style={{ width: 110 }}>
                      <OrarioInput value={f.orario ?? ''} onChange={(v) => aggiornaFermataOperativa(tragitto.tragittoId, idx, 'orario', v)} />
                    </div>
                    <button
                      type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                      onClick={() => setFormOperativoMap((prev) => {
                        const f2 = prev.get(tragitto.tragittoId);
                        if (!f2) return prev;
                        return new Map(prev).set(tragitto.tragittoId, { ...f2, fermate: f2.fermate.filter((_, i) => i !== idx) });
                      })}
                    >
                      Rimuovi
                    </button>
                  </div>
                ))}
                {fermateAnagrafica.length > 0 && (
                  <select
                    style={{ marginTop: 10 }}
                    value=""
                    onChange={(e) => {
                      const scelta = fermateAnagrafica.find((fa) => fa.id === e.target.value);
                      if (!scelta) return;
                      setFormOperativoMap((prev) => {
                        const f2 = prev.get(tragitto.tragittoId);
                        if (!f2) return prev;
                        return new Map(prev).set(tragitto.tragittoId, { ...f2, fermate: [...f2.fermate, { fermataAnagraficaId: scelta.id, citta: scelta.citta, indirizzo: scelta.indirizzo }] });
                      });
                    }}
                  >
                    <option value="" disabled>+ Aggiungi una fermata a questa partenza...</option>
                    {fermateAnagrafica.map((fa) => (
                      <option key={fa.id} value={fa.id}>{fa.nome === fa.citta ? fa.nome : `${fa.nome} — ${fa.citta}`}</option>
                    ))}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={salvandoOperativo} onClick={() => salvaOperativo(tragitto.tragittoId)}>
                    {salvandoOperativo ? 'Salvo...' : 'Salva'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => chiudiModificaOperativa(tragitto.tragittoId)}>Annulla</button>
                </div>
              </div>
            );

            if (formPreventivo) return (
              <div style={{ marginTop: 14 }}>
                <p className="testo-intro" style={{ marginBottom: 16 }}>
                  Una stima dal fornitore (non un bus vero ancora opzionato) sullo scenario più caro — sblocca la vendita, coi prezzi calcolati per fermata. Se poi costruisci una Linea più economica, il margine extra resta un guadagno in più.
                </p>
                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <label>Costo del preventivo (€)
                    <CampoNumero valuta value={formPreventivo.costo} onChange={(v) => setFormPreventivoMap((prev) => new Map(prev).set(tragitto.tragittoId, { ...prev.get(tragitto.tragittoId), costo: v }))} />
                  </label>
                  <label>Posti presunti del bus
                    <CampoNumero value={formPreventivo.postiBus} onChange={(v) => setFormPreventivoMap((prev) => new Map(prev).set(tragitto.tragittoId, { ...prev.get(tragitto.tragittoId), postiBus: v }))} />
                  </label>
                </div>
                <button type="button" className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => calcolaPrezziPreventivo(tragitto.tragittoId)} disabled={calcolandoPreventivo}>
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button" className="btn btn-primary" style={{ flex: 1 }}
                    disabled={!prezziCalcolati || prezziCalcolati.length === 0 || salvandoPreventivo}
                    onClick={() => salvaPreventivo(tragitto.tragittoId)}
                  >
                    {salvandoPreventivo ? 'Salvo...' : 'Conferma e vai in vendita'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => chiudiPreventivo(tragitto.tragittoId)}>Annulla</button>
                </div>
              </div>
            );

            if (!espansa) return null;

            // Riepilogo a righe (tab "Confermato"/"Passate") — ogni riga
            // rimanda alla tab in alto corrispondente per modificare quel
            // dato specifico, invece del vecchio pannello unico con
            // bus-suggeriti/economia sempre visibile qui.
            caricaLineeSeServe(tragitto.tragittoId);
            const linee = lineePerTragitto.get(tragitto.tragittoId) ?? [];
            const busNelleLinee = linee.flatMap((l) => l.bus);
            const postiNelleLinee = busNelleLinee.reduce((tot, b) => tot + (b.postiBus ?? 0), 0);
            const dati = economia.find((e) => e.tragittoId === tragitto.tragittoId);
            const tragittoVero = eventoCompleto ? [...eventoCompleto.tragitti, ...eventoCompleto.servizi.flatMap((s) => s.tragitti)].find((t) => t.id === tragitto.tragittoId) : undefined;
            const rigaStile: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' };
            return (
              <div style={{ marginTop: 14 }}>
                <div style={rigaStile}>
                  <div><strong style={{ fontSize: 13.5 }}>Fermate</strong> <span style={{ color: 'var(--mist)', fontSize: 13 }}>· {tragitto.fermate.length} fermate</span></div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px' }} onClick={() => onNavigaTab?.('fermate')}>Modifica</button>
                </div>
                <div style={rigaStile}>
                  <div>
                    <strong style={{ fontSize: 13.5 }}>Preventivo</strong>{' '}
                    <span style={{ color: 'var(--mist)', fontSize: 13 }}>
                      · {tragittoVero?.preventivoCosto ? `€${Number(tragittoVero.preventivoCosto).toFixed(0)} · ${tragittoVero.preventivoPostiBus ?? '—'} posti presunti` : 'non registrato'}
                    </span>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px' }} onClick={() => onNavigaTab?.('da-prezzare')}>Modifica</button>
                </div>
                <div style={rigaStile}>
                  <div><strong style={{ fontSize: 13.5 }}>Linee</strong> <span style={{ color: 'var(--mist)', fontSize: 13 }}>· {linee.length} Linee · {busNelleLinee.length} bus · {postiNelleLinee} posti</span></div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11.5, padding: '3px 10px' }} onClick={() => onNavigaTab?.('da-confermare')}>Modifica</button>
                </div>
                {vedeEconomia && dati && (
                  <div style={{ ...rigaStile, borderBottom: 'none' }}>
                    <div>
                      <strong style={{ fontSize: 13.5 }}>Costo</strong>{' '}
                      <span style={{ color: '#5be0a0', fontSize: 13 }}>· Incassato €{dati.incassato.toFixed(2)}</span>
                      {dati.costoCensito && <span style={{ color: dati.guadagno >= 0 ? '#5be0a0' : 'var(--pink)', fontSize: 13 }}> · Guadagno €{dati.guadagno.toFixed(2)}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        );
      })}

    </div>
  );
}
