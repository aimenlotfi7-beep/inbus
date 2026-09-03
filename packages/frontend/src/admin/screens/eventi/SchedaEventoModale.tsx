import { useEffect, useState, type ReactNode } from 'react';
import { EtichettaTooltip } from '../../shared/EtichettaTooltip';
import { InfoTooltip } from '../../shared/InfoTooltip';
import { TOOLTIP_DEFAULT } from '../../tooltipDefaults';
import { useMappaTooltip } from '../../shared/useMappaTooltip';
import { eventiApi, type EventoInput, type TragittoInput, type FermataInput } from '../../../api/eventi';
import { percorsiSalvatiApi, type PercorsoSalvato } from '../../../api/percorsiSalvati';
import { fermateAnagraficaApi, type FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../../api/layoutBiglietto';
import { categorieApi, type Categoria } from '../../../api/categorie';
import { categorieEventoApi, type CategoriaEvento } from '../../../api/categorieEvento';
import { ErroreApi } from '../../../api/client';
import type { Evento } from '../../../api/types';
import { PaginaSezione } from '../../shared/PaginaSezione';
import { useAvvisoModificheNonSalvate } from '../../shared/useAvvisoModificheNonSalvate';
import { CaricaFile } from '../../shared/CaricaFile';
import { CampoNumero } from '../../shared/CampoNumero';
import { OrarioInput } from '../../shared/OrarioInput';
import { PartenzeTab } from '../partenze/PartenzeTab';
import { ListaAttesaTab } from './ListaAttesaTab';
import { ComunicazioniTab } from './ComunicazioniTab';
import { OfferteTab } from './OfferteTab';

const VUOTO: EventoInput = { artista: '', genere: '', categoria: null, luogo: '', citta: '', data: '', inEvidenza: false, accontoEur: 10, immagini: [], tragitti: [] };

const STEP_WIZARD = [
  { numero: 1, label: 'Info evento' },
  { numero: 2, label: 'Tragitti' },
  { numero: 3, label: 'Immagini' },
  { numero: 4, label: 'Riepilogo' },
] as const;

/**
 * Scheda completa di un evento.
 * - Creazione (evento === null): wizard a step (Info evento → Tratte →
 *   Immagini → Riepilogo), come nel prototipo originale.
 * - Modifica (evento esistente): tab "Dettagli"/"Partenze", per poter
 *   saltare direttamente al campo che serve senza rifare tutti gli step.
 *
 * I prezzi arrivano sempre dalle fermate delle tratte (non c'è più un
 * "prezzo base" evento): ogni fermata di partenza/intermedia richiede un
 * prezzo prima di poter salvare — solo l'ultima (l'arrivo) può non
 * averlo, perché nessuno parte da lì.
 */
export function SchedaEventoModale({
  evento, tabIniziale = 'dettagli', soloQuestaTab = false, contestoPartenze, onClose, onSalvato,
}: {
  evento: Evento | null; // null = nuovo evento
  tabIniziale?: 'dettagli' | 'partenze' | 'lista-attesa' | 'offerte' | 'comunicazioni';
  // Se vero, nasconde del tutto le altre tab — usato dalle sezioni
  // principali del menu (Partenze, Lista d'attesa, Offerte), che devono
  // occuparsi solo della propria competenza, senza poter navigare per
  // sbaglio nelle altre.
  soloQuestaTab?: boolean;
  // Arrivando da una card di Partenze — quale tragitto aprire subito,
  // e con quale azione (vedi PartenzeTab).
  contestoPartenze?: { tragittiIds: string[]; azione: 'fermate' | 'preventivo' | 'linee' | 'espandi'; tabOrigine: 'fermate' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate' } | null;
  onClose: () => void;
  onSalvato: () => void;
}) {
  const [percorsiSalvati, setPercorsiSalvati] = useState<PercorsoSalvato[]>([]);
  // Selezione a due passi per "Aggiungi da quelli salvati" — prima la
  // città di arrivo, poi (dentro quella) i tragitti veri, uno alla
  // volta o tutti insieme. Si azzera ogni volta che si cambia servizio
  // attivo, per non lasciare una selezione a metà da un altro contesto.
  const [cittaPercorsoScelta, setCittaPercorsoScelta] = useState('');
  const [percorsiSelezionatiIds, setPercorsiSelezionatiIds] = useState<Set<string>>(new Set());
  const [fermateAnagrafica, setFermateAnagrafica] = useState<FermataAnagrafica[]>([]);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [layoutDisponibili, setLayoutDisponibili] = useState<LayoutBiglietto[]>([]);
  const [form, setForm] = useState<EventoInput>(VUOTO);
  const [tabAttiva, setTabAttiva] = useState<'dettagli' | 'partenze' | 'lista-attesa' | 'offerte' | 'comunicazioni'>(tabIniziale);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subTabInfo, setSubTabInfo] = useState<'info' | 'descrizione'>('info');
  const [subTabImmagini, setSubTabImmagini] = useState<'immagini' | 'biglietto'>('immagini');
  // Tratte comprimibili come in Partenze — le nuove restano aperte per
  // poterle compilare subito, le altre si possono chiudere per non
  // dover scorrere tutto quando ce ne sono tante.
  const [tragittiAperti, setTragittiAperti] = useState<Set<number>>(new Set());
  // I servizi — completamente locali finché non si salva tutto insieme
  // (anche alla primissima creazione dell'evento): quelli già esistenti
  // hanno l'id vero del server, quelli appena aggiunti hanno una
  // chiave temporanea che il backend riconosce come "nuovo" (nessun id).
  const [servizi, setServizi] = useState<{ key: string; id?: string; nome: string; daRinominare?: boolean }[]>(
    (evento?.servizi ?? []).map((p) => ({ key: p.id, id: p.id, nome: p.nome }))
  );
  // Due modalità nettamente separate: con un solo servizio (o nessuno) è
  // la stessa identica interfaccia di prima, senza nessun concetto di
  // "servizio" in giro — con più servizi diventano tab, come in Partenze,
  // ognuna con la propria sezione tragitti dedicata. Ogni evento parte
  // sempre "a un servizio" (niente più domanda iniziale "quanti
  // servizi ha?") — "+ Aggiungi un servizio" è l'UNICO modo per
  // passare a più servizi, sia in creazione sia in modifica: un solo
  // percorso di codice invece di due, meno posti dove un bug può
  // nascondersi (la maggior parte dei bug di questa sezione nasceva
  // proprio dalla dualità tra i due percorsi).
  const [modalitaServizi, setModalitaServizi] = useState<'singolo' | 'multiplo'>(
    (evento?.servizi ?? []).length >= 1 ? 'multiplo' : 'singolo'
  );
  const [servizioTabAttivo, setServizioTabAttivo] = useState<string | null>(servizi[0]?.key ?? null);
  const [rinominaServizioAperto, setRinominaServizioAperto] = useState(false);
  // Protezione contro il doppio click/invio multiplo — senza questa,
  // cliccare "Salva" più volte di seguito (es. perché sembra non
  // rispondere, magari per un errore precedente) lancia più richieste
  // di creazione in parallelo: un evento ancora "nuovo" (non salvato)
  // le vede tutte come "crea", finendo per generare più eventi
  // duplicati invece di uno solo aggiornato.
  const [salvando, setSalvando] = useState(false);

  function nuovoServizio() {
    const chiave = `nuovo-${Date.now()}`;
    const numero = servizi.length + 1;
    setServizi((prev) => [...prev, { key: chiave, nome: `Servizio ${numero}`, daRinominare: true }]);
    setModalitaServizi('multiplo');
    setServizioTabAttivo(chiave);
    // Nome già pronto (default) — subito utilizzabile con un click, non
    // serve rinominarla per forza prima di poterci lavorare.
  }
  /** Passando a "Più servizi" per la prima volta, partono già 2 tab
   *  pronte all'uso (con nome di default) — non zero, come chiesto:
   *  è raro che serva "più servizi" per finirne con uno solo. */
  /** Solo per la scelta iniziale, evento senza ancora nessun servizio:
   *  partono già 2 tab pronte (non zero). */
  /** Da "Un solo servizio" (o da un evento nuovo, ancora senza nessun
   *  tragitto — la .map() qui sotto in quel caso semplicemente non
   *  itera su nulla): i tragitti attuali (finora "liberi") diventano
   *  un vero primo servizio, con lo stesso arrivo che avevano già —
   *  non restano "liberi", altrimenti sul sito il checkout
   *  continuerebbe a vederlo come un solo servizio e non farebbe mai
   *  comparire lo step di scelta. Poi se ne aggiunge un secondo,
   *  vuoto, pronto da compilare. Il risultato deve comportarsi
   *  esattamente come un evento nativamente a più servizi — stessa
   *  identica funzione usata sia in creazione sia in modifica, un
   *  solo percorso di codice invece di due.
   *  comportarsi in tutto e per tutto come un evento nato da subito con
   *  più servizi — nessuna differenza. */
  function aggiungiServizioAdEventoSingolo() {
    setModalitaServizi('multiplo');
    const chiavePrimo = `nuovo-${Date.now()}`;
    const chiaveSecondo = `nuovo-${Date.now() + 1}`;
    setForm((f) => ({
      ...f,
      tragitti: (f.tragitti ?? []).map((t) => (!t.servizioId ? { ...t, servizioId: chiavePrimo } : t)),
    }));
    setServizi((prev) => [
      ...prev,
      { key: chiavePrimo, nome: 'Servizio 1', daRinominare: true },
      { key: chiaveSecondo, nome: 'Servizio 2', daRinominare: true },
    ]);
    setServizioTabAttivo(chiaveSecondo); // porta dritto a compilare quello nuovo
  }
  function rinominaServizio(key: string, nome: string) {
    // Il contrassegno si toglie solo se il nome è DAVVERO diverso dal
    // pattern automatico ("Servizio 1", "Servizio 2"...) — altrimenti
    // aprire il campo e richiuderlo senza scrivere nulla di nuovo
    // basterebbe a "far finta" di aver rinominato, restando comunque
    // col nome generico.
    const eNomeAutomatico = /^Servizio \d+$/.test(nome.trim());
    setServizi((prev) => prev.map((v) => v.key === key ? { ...v, nome, daRinominare: eNomeAutomatico } : v));
  }
  function toggleTragittoAperto(idx: number) {
    setTragittiAperti((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(idx)) nuovo.delete(idx); else nuovo.add(idx);
      return nuovo;
    });
  }
  const [nuovaImmagine, setNuovaImmagine] = useState('');
  const [trascinata, setTrascinata] = useState<{ tragitto: number; fermata: number } | null>(null);
  const [formIniziale, setFormIniziale] = useState('');

  const [categorieEvento, setCategorieEvento] = useState<CategoriaEvento[]>([]);
  const mappaTooltip = useMappaTooltip();
  function ricaricaCategorie() {
    categorieApi.list().then(setCategorie);
  }
  function ricaricaCategorieEvento() {
    categorieEventoApi.list().then(setCategorieEvento);
  }

  // Estratta in una funzione a sé (non solo dentro l'useEffect) — serve
  // anche altrove: se un salvataggio fallisce perché nel frattempo
  // qualcosa sul server è cambiato (es. un tragitto che si voleva
  // togliere ha in realtà prenotazioni confermate, il server rifiuta
  // e non tocca nulla), il modulo locale resta comunque "sfasato" con
  // quel tragitto già tolto qui ma mai davvero eliminato là — bisogna
  // ricaricare i dati veri per rimetterli allineati, altrimenti sembra
  // sparito anche se sul server è ancora perfettamente intatto.
  function caricaDaEvento(sorgente: Evento | null) {
    let nuovoForm: EventoInput;
    if (sorgente) {
      nuovoForm = {
        artista: sorgente.artista, genere: sorgente.genere, categoria: sorgente.categoria, luogo: sorgente.luogo, citta: sorgente.citta,
        data: sorgente.data.slice(0, 10), inEvidenza: sorgente.inEvidenza,
        slug: sorgente.slug,
        accontoEur: sorgente.accontoEur ? Number(sorgente.accontoEur) : 10,
        statoDisponibilita: sorgente.statoDisponibilita,
        visibileSito: sorgente.visibileSito,
        descrizione: sorgente.descrizione ?? undefined,
        descrizioneSeo: sorgente.descrizioneSeo ?? undefined,
        ticketColoreAccento: sorgente.ticketColoreAccento ?? undefined,
        ticketImmagineSfondoUrl: sorgente.ticketImmagineSfondoUrl ?? undefined,
        layoutBigliettoId: sorgente.layoutBigliettoId,
        immagini: [...sorgente.immagini].sort((a, b) => a.ordine - b.ordine).map((i) => i.url),
        // "form.tragitti" è un unico elenco piatto — sia i tragitti
        // "liberi" (senza servizio) sia quelli di ogni servizio, distinti
        // solo dal campo servizioId su ognuno (è così che il resto del
        // componente li filtra/salva, vedi più sotto). Prima qui veniva
        // caricato SOLO evento.tragitti (i liberi): per un evento con
        // servizi, dove i tragitti veri vivono tutti dentro i servizi,
        // il form restava vuoto — sparivano dalla vista in modifica pur
        // restando intatti sul server (il sito li vede/vende comunque,
        // legge direttamente da lì). Ora si combinano entrambe le fonti.
        tragitti: [...sorgente.tragitti, ...sorgente.servizi.flatMap((s) => s.tragitti)].map((l) => ({
          id: l.id,
          servizioId: l.servizioId,
          nome: l.nome, postiTotali: l.postiTotali, prezzoExtra: Number(l.prezzoExtra), attivo: l.attivo,
          arrivoIndirizzo: l.arrivoIndirizzo ?? undefined, arrivoOrario: l.arrivoOrario ?? undefined,
          // Normalizzo qui il prezzo che arriva dal server: se una fermata
          // non ne aveva uno salvato, arriva `null`, non `undefined` — va
          // convertito subito, altrimenti finirebbe di nuovo a rimbalzare
          // in giro come null fino a far fallire la validazione al salvataggio.
          fermate: l.fermate.map((f) => ({ fermataAnagraficaId: f.fermataAnagraficaId, citta: f.citta, indirizzo: f.indirizzo, orario: f.orario ?? undefined, prezzo: f.prezzo ? Number(f.prezzo) : undefined, postiMax: f.postiMax ?? undefined, sogliaMinima: f.sogliaMinima, attivo: f.attivo })),
        })),
      };
    } else {
      nuovoForm = VUOTO;
      setStep(1);
    }
    setForm(nuovoForm);
    const serviziCaricati = (sorgente?.servizi ?? []).map((p) => ({ key: p.id, id: p.id, nome: p.nome }));
    setServizi(serviziCaricati);
    setModalitaServizi(serviziCaricati.length >= 1 ? 'multiplo' : 'singolo');
    setServizioTabAttivo(serviziCaricati[0]?.key ?? null);
    setFormIniziale(JSON.stringify(nuovoForm));
  }

  useEffect(() => {
    percorsiSalvatiApi.list().then(setPercorsiSalvati).catch((e) => console.error('Percorsi salvati non caricati:', e));
    fermateAnagraficaApi.list().then(setFermateAnagrafica).catch((e) => console.error('Anagrafica fermate non caricata:', e));
    layoutBigliettoApi.list().then(setLayoutDisponibili).catch(() => setLayoutDisponibili([]));
    ricaricaCategorie();
    ricaricaCategorieEvento();
    caricaDaEvento(evento ?? null);
    // Per un evento NUOVO (non in modifica di uno esistente) — se c'era
    // un form in corso di compilazione salvato nel browser (rimasto lì
    // da un ricaricamento accidentale della pagina), lo ripristino in
    // silenzio, senza chiedere nulla: è quello che si aspetta di
    // trovare chi ha appena ricaricato per sbaglio. Cliccando invece
    // "+ Nuovo evento" di proposito, EventiScreen non riapre affatto
    // questa scheda se non c'era una creazione già in corso (vedi lì)
    // — quindi questo ramo scatta solo nel caso giusto.
    if (!evento) {
      const salvata = localStorage.getItem('inbus_bozza_form_evento');
      if (salvata) {
        try {
          const { form: formSalvato, servizi: serviziSalvati, modalitaServizi: modalitaSalvata } = JSON.parse(salvata);
          setForm(formSalvato);
          setServizi(serviziSalvati);
          setModalitaServizi(modalitaSalvata);
          setServizioTabAttivo(serviziSalvati[0]?.key ?? null);
        } catch {
          // Contenuto non leggibile (versione vecchia, corrotto) —
          // ignoro e resta il form vuoto già impostato sopra.
        }
      }
    }
    setTabAttiva(tabIniziale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento?.id]);

  function aggiornaTragitto(idx: number, campo: keyof TragittoInput, valore: string | number | boolean) {
    const tragitti = [...(form.tragitti ?? [])];
    tragitti[idx] = { ...tragitti[idx], [campo]: valore };
    setForm({ ...form, tragitti });
  }
  function aggiungiFermata(idxTragitto: number) {
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = [...tragitti[idxTragitto].fermate, { citta: '', indirizzo: '' } as FermataInput];
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate };
    setForm({ ...form, tragitti });
  }
  function aggiornaFermata(idxTragitto: number, idxFermata: number, campo: keyof FermataInput, valore: string | boolean) {
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = [...tragitti[idxTragitto].fermate];
    const valoreConvertito = campo === 'attivo' ? valore
      : (campo === 'prezzo' || campo === 'postiMax' || campo === 'sogliaMinima') ? (Number(valore) || undefined)
      : valore;
    fermate[idxFermata] = { ...fermate[idxFermata], [campo]: valoreConvertito };
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate };
    setForm({ ...form, tragitti });
  }
  // Scegliendo dall'anagrafica si riempiono insieme città+indirizzo+id
  // — se invece si sceglie "Scrivi manualmente", si azzera solo l'id,
  // lasciando i campi liberi da compilare a mano (vedi il rendering
  // della riga fermata più sotto).
  function selezionaFermataAnagrafica(idxTragitto: number, idxFermata: number, anagraficaId: string) {
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = [...tragitti[idxTragitto].fermate];
    if (anagraficaId === '__manuale__') {
      fermate[idxFermata] = { ...fermate[idxFermata], fermataAnagraficaId: null };
    } else {
      const trovata = fermateAnagrafica.find((f) => f.id === anagraficaId);
      if (!trovata) return;
      fermate[idxFermata] = { ...fermate[idxFermata], fermataAnagraficaId: trovata.id, citta: trovata.citta, indirizzo: trovata.indirizzo };
    }
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate };
    setForm({ ...form, tragitti });
  }
  function rimuoviFermata(idxTragitto: number, idxFermata: number) {
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = tragitti[idxTragitto].fermate.filter((_, i) => i !== idxFermata);
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate: fermate.length ? fermate : [{ citta: '', indirizzo: '' }] };
    setForm({ ...form, tragitti });
  }
  // Condivisa da entrambi i punti che possono far sparire un servizio:
  // "Annulla" su uno ancora vuoto, e rimuoviTragitto quando arriva a
  // zero tragitti — stessa identica regola in entrambi i casi (incluso
  // il ritorno automatico "a un servizio" se ne resta uno solo).
  // Chiamata SOLO da rimuoviTragitto qui sotto, quando l'ultimo
  // tragitto di un servizio viene tolto — "tragittiAttuali" arriva già
  // fresco da lì (mai una copia catturata prima di un'attesa), non
  // serve un aggiornamento funzionale qui: chi chiama se n'è già
  // occupato.
  function rimuoviServizio(key: string, tragittiAttuali: TragittoInput[]) {
    const serviziRimasti = servizi.filter((v) => v.key !== key);
    if (serviziRimasti.length === 1) {
      const ultimoKey = serviziRimasti[0].key;
      setForm((f) => ({ ...f, tragitti: tragittiAttuali.map((t) => (t.servizioId === ultimoKey ? { ...t, servizioId: null } : t)) }));
      setServizi([]);
      setModalitaServizi('singolo');
      setServizioTabAttivo(null);
    } else {
      setForm((f) => ({ ...f, tragitti: tragittiAttuali }));
      setServizi(serviziRimasti);
      setServizioTabAttivo(serviziRimasti[0]?.key ?? null);
    }
  }

  async function rimuoviTragitto(idxTragitto: number) {
    const tragittoRimosso = (form.tragitti ?? [])[idxTragitto];

    // Un tragitto già salvato (ha un id vero) potrebbe avere
    // prenotazioni confermate — controllo subito, al click, invece di
    // farlo scoprire solo al salvataggio: stesso identico controllo
    // che il server rifarebbe comunque da solo più avanti, qui solo
    // anticipato per un riscontro immediato. Una riga appena aggiunta
    // (senza id, mai salvata) non può averne, si salta il controllo.
    if (tragittoRimosso?.id) {
      try {
        const { haPrenotazioni, quante } = await eventiApi.tragittoHaPrenotazioniConfermate(tragittoRimosso.id);
        if (haPrenotazioni) {
          alert(`Questo tragitto ha ${quante} prenotazion${quante > 1 ? 'i' : 'e'} confermat${quante > 1 ? 'e' : 'a'} — non può essere rimosso. Annulla o sposta quelle prenotazioni prima di rimuoverlo.`);
          return;
        }
      } catch {
        alert('Impossibile verificare le prenotazioni di questo tragitto — controlla la connessione e riprova.');
        return;
      }
    }

    // Individuato per RIFERIMENTO (non per indice, che potrebbe non
    // essere più valido se nel frattempo — durante l'attesa qui sopra —
    // è cambiato qualcos'altro nell'elenco, es. un'altra rimozione in
    // parallelo) sullo stato più recente davvero, non una copia
    // catturata prima dell'attesa. Bug della stessa famiglia già
    // trovato e corretto altrove in questo file (race condition sui
    // due servizi) — stessa causa, stesso rimedio.
    const risultato: { servizioDaRimuovere: { key: string; tragittiRestanti: TragittoInput[] } | null } = { servizioDaRimuovere: null };
    setForm((f) => {
      const tragittiAttuali = f.tragitti ?? [];
      const idxAttuale = tragittoRimosso ? tragittiAttuali.indexOf(tragittoRimosso) : -1;
      if (idxAttuale === -1) return f; // già rimosso da un'altra chiamata nel frattempo
      const nuoviTragitti = tragittiAttuali.filter((_, i) => i !== idxAttuale);
      // Un servizio non si elimina più con un pulsante a parte — si
      // "svuota" rimuovendo i suoi tragitti uno a uno: appena non
      // gliene resta più nessuno, il servizio stesso sparisce da solo.
      const servizioIdRimosso = tragittoRimosso?.servizioId;
      if (servizioIdRimosso && !nuoviTragitti.some((t) => t.servizioId === servizioIdRimosso)) {
        risultato.servizioDaRimuovere = { key: servizioIdRimosso, tragittiRestanti: nuoviTragitti };
        return f; // lo fa rimuoviServizio subito dopo, con lo stato giusto
      }
      return { ...f, tragitti: nuoviTragitti };
    });
    if (risultato.servizioDaRimuovere) rimuoviServizio(risultato.servizioDaRimuovere.key, risultato.servizioDaRimuovere.tragittiRestanti);
  }

  // ---- Riordino fermate trascinandole (drag & drop nativo, senza librerie) ----
  function onDragStart(idxTragitto: number, idxFermata: number) {
    setTrascinata({ tragitto: idxTragitto, fermata: idxFermata });
  }
  function onDropSu(idxTragitto: number, idxFermataDestinazione: number) {
    if (!trascinata || trascinata.tragitto !== idxTragitto) { setTrascinata(null); return; }
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = [...tragitti[idxTragitto].fermate];
    const [spostata] = fermate.splice(trascinata.fermata, 1);
    fermate.splice(idxFermataDestinazione, 0, spostata);
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate };
    setForm({ ...form, tragitti });
    setTrascinata(null);
  }

  /** Aggiunge una tratta a partire da un tragitto salvato: nome e fermate
   *  (con prezzo) vengono copiati — da qui in poi sono indipendenti,
   *  modificabili liberamente senza toccare il tragitto originale. I
   *  tragitti non hanno orari: l'arrivo (unico per tutto l'evento) va
   *  compilato una volta sola nel box qui sopra. */
  /** Il servizioId da assegnare a un tragitto appena creato: dipende
   *  dal contesto in cui ci si trova — nessuno in modalità "1 servizio",
   *  quello della tab attiva in "Più servizi" (o nessuno se sei sulla
   *  tab "Tragitti liberi"). */
  function servizioIdContestoAttuale(): string | null {
    if (modalitaServizi === 'singolo') return null;
    if (servizioTabAttivo === 'liberi' || !servizioTabAttivo) return null;
    return servizioTabAttivo;
  }

  async function aggiungiTragittoDaPercorso(percorso: PercorsoSalvato) {
    // La PRIMA fermata del percorso è la Testa di partenza (può non
    // avere indirizzo, si scrive qui in Eventi), l'ULTIMA è la Testa
    // di arrivo (stessa cosa — non diventa una fermata vera del
    // tragitto, va su arrivoCitta/arrivoIndirizzo, come per un tragitto
    // creato a mano). Tutto ciò che sta in mezzo sono le fermate
    // intermedie vere. Se serve il verso opposto, si inverte DOPO,
    // con la freccia sulla tab del tragitto qui sotto — non più una
    // scelta da fare PRIMA di applicare il percorso.
    const [testaPartenza, ...resto] = percorso.fermate;
    const testaArrivo = resto.pop(); // tolto da resto: quel che resta sono le sole intermedie
    const fermateIntermedie = resto;

    // Ogni fermata intermedia del percorso deve diventare una scelta
    // vera dall'anagrafica — mai più testo libero, come richiesto. Il
    // controllo "esiste già?" avviene lato server (trovaOCrea),
    // affidabile anche applicando più percorsi/tragitti in rapida
    // sequenza — un controllo lato frontend contro lo stato locale
    // (fermateAnagrafica) causava doppioni, perché ogni chiamata non
    // vedeva ancora quello appena creato da un'altra chiamata
    // parallela.
    const fermateConAnagrafica: FermataInput[] = await Promise.all(fermateIntermedie.map(async (f) => {
      try {
        const trovata = await fermateAnagraficaApi.trovaOCrea({ nome: f.citta, citta: f.citta, indirizzo: f.indirizzo ?? '' });
        setFermateAnagrafica((prev) => prev.some((fa) => fa.id === trovata.id) ? prev : [...prev, trovata]);
        return { fermataAnagraficaId: trovata.id, citta: trovata.citta, indirizzo: trovata.indirizzo, sogliaMinima: f.sogliaMinima };
      } catch {
        // Se la richiesta fallisce (es. problema di rete), meglio non
        // bloccare tutto il tragitto — questa singola fermata resta
        // testuale, modificabile e sistemabile a mano dall'admin,
        // invece di far fallire l'intera applicazione del percorso.
        return { fermataAnagraficaId: null, citta: f.citta, indirizzo: f.indirizzo, sogliaMinima: f.sogliaMinima };
      }
    }));
    // La Testa di partenza NON passa dall'anagrafica finché non ha un
    // indirizzo vero (niente da cercare/creare senza un indirizzo) —
    // resta testuale, prima fermata del tragitto.
    const fermataPartenza: FermataInput = { fermataAnagraficaId: null, citta: testaPartenza.citta, indirizzo: testaPartenza.indirizzo ?? '', sogliaMinima: testaPartenza.sogliaMinima };

    const nuovoTragitto: TragittoInput = {
      nome: percorso.nome,
      postiTotali: 50,
      prezzoExtra: 0,
      attivo: true,
      servizioId: servizioIdContestoAttuale(),
      fermate: [fermataPartenza, ...fermateConAnagrafica],
      arrivoCitta: testaArrivo?.citta || undefined,
      arrivoIndirizzo: testaArrivo?.indirizzo || undefined,
    };
    // Aggiornamento FUNZIONALE (legge lo stato più recente al momento
    // vero dell'esecuzione, non quello catturato quando la funzione è
    // stata chiamata) — essenziale qui perché la funzione è asincrona
    // (aspetta le chiamate all'anagrafica fermate): aggiungendo un
    // tragitto a un servizio e subito dopo un altro a un secondo
    // servizio, le due chiamate si sovrappongono nel tempo — con un
    // aggiornamento non funzionale, la seconda `setForm` avrebbe
    // sovrascritto il risultato usando ancora l'istantanea DI PRIMA
    // (senza il primo tragitto appena aggiunto), perdendolo. Bug
    // trovato proprio così: "creo un evento a due servizi, non si
    // salva correttamente".
    setForm((f) => ({ ...f, tragitti: [...(f.tragitti ?? []), nuovoTragitto] }));
    setTragittiAperti((prev) => new Set(prev).add((form.tragitti ?? []).length));
  }

  /** Inverte un tragitto GIÀ aggiunto — scambia la Testa di partenza
   *  (prima fermata) con la Testa di arrivo (arrivoCitta/Indirizzo/
   *  Orario), e gira l'ordine di tutte le fermate intermedie in mezzo.
   *  Ripetibile avanti e indietro quante volte serve: applicandola due
   *  volte di fila si torna esattamente al punto di partenza (uno
   *  scambio pulito, mai con perdita di dati). */
  // Impedisce due inversioni sovrapposte sullo stesso tragitto — tra il
  // click e la fine della verifica prenotazioni (una chiamata di rete)
  // c'è una finestra in cui un secondo click partirebbe usando ancora i
  // dati di PRIMA della prima inversione, risultando in una città
  // d'arrivo sbagliata/vecchia una volta finite entrambe.
  const [inversioneInCorso, setInversioneInCorso] = useState<Set<string>>(new Set());

  async function invertiTragitto(idxTragitto: number) {
    const t = (form.tragitti ?? [])[idxTragitto];
    if (!t) return;
    const chiaveGuardiano = t.id ?? `nuovo-${idxTragitto}`;
    if (inversioneInCorso.has(chiaveGuardiano)) return;
    setInversioneInCorso((prev) => new Set(prev).add(chiaveGuardiano));
    try {

    // Stesso controllo già usato per rimuoviTragitto — invertire
    // scambia partenza e arrivo: se la città che era "partenza" (dove
    // i clienti si sono davvero imbarcati) diventa "arrivo", quella
    // città sparisce dall'elenco delle fermate prenotabili — le
    // prenotazioni vere restano nel database, ma diventano difficili
    // da gestire nell'interfaccia. Una riga appena aggiunta (senza id,
    // mai salvata) non può averne, si salta il controllo.
    if (t.id) {
      try {
        const { haPrenotazioni, quante } = await eventiApi.tragittoHaPrenotazioniConfermate(t.id);
        if (haPrenotazioni) {
          alert(`Questo tragitto ha ${quante} prenotazion${quante > 1 ? 'i' : 'e'} confermat${quante > 1 ? 'e' : 'a'} — non può essere invertito. Sposta quelle prenotazioni prima di invertirlo.`);
          return;
        }
      } catch {
        alert('Impossibile verificare le prenotazioni di questo tragitto — controlla la connessione e riprova.');
        return;
      }
    }

    // Individuato per ID (stabile) quando il tragitto è già salvato —
    // non per riferimento oggetto, che durante l'attesa di rete qui
    // sopra può non corrispondere più anche se è "lo stesso" tragitto
    // logicamente (basta un altro giro di render nel frattempo, React
    // può ricreare l'oggetto). Un tragitto appena aggiunto (senza id
    // ancora) non può cambiare riferimento nello stesso modo — lì
    // resta valida la posizione originale.
    setForm((f) => {
      const tragitti = [...(f.tragitti ?? [])];
      const idxAttuale = t.id ? tragitti.findIndex((x) => x.id === t.id) : idxTragitto;
      if (idxAttuale === -1 || !tragitti[idxAttuale]) return f; // rimosso da un'altra azione nel frattempo
      const attuale = tragitti[idxAttuale];
      if (attuale.fermate.length === 0) return f;
      const [vecchiaPartenza, ...intermedie] = attuale.fermate;
      const nuovaPartenza: FermataInput = {
        fermataAnagraficaId: null,
        citta: attuale.arrivoCitta ?? '',
        indirizzo: attuale.arrivoIndirizzo ?? '',
        orario: attuale.arrivoOrario,
        prezzo: vecchiaPartenza.prezzo,
        sogliaMinima: vecchiaPartenza.sogliaMinima,
      };
      tragitti[idxAttuale] = {
        ...attuale,
        nome: invertiNomeTragitto(attuale.nome),
        fermate: [nuovaPartenza, ...[...intermedie].reverse()],
        arrivoCitta: vecchiaPartenza.citta || undefined,
        arrivoIndirizzo: vecchiaPartenza.indirizzo || undefined,
        arrivoOrario: vecchiaPartenza.orario,
      };
      return { ...f, tragitti };
    });
    } finally {
      setInversioneInCorso((prev) => { const s = new Set(prev); s.delete(chiaveGuardiano); return s; });
    }
  }
  // Se il nome segue la forma "Partenza → Arrivo" (quella usata dai
  // Percorsi Salvati, e proposta di default quando se ne applica uno),
  // lo capovolge insieme all'inversione vera — "Varese → Roma" diventa
  // "Roma → Varese". Un nome scritto a mano senza quella freccia
  // (es. "Andata mattina") resta invariato — non c'è un ordine
  // riconoscibile da capovolgere.
  function invertiNomeTragitto(nome: string): string {
    const parti = nome.split(' → ');
    if (parti.length !== 2) return nome;
    return `${parti[1]} → ${parti[0]}`;
  }  function aggiungiTragittoManuale() {
    setTragittiAperti((prev) => new Set(prev).add((form.tragitti ?? []).length));
    setForm((f) => ({ ...f, tragitti: [...(f.tragitti ?? []), { nome: '', postiTotali: 50, prezzoExtra: 0, attivo: true, servizioId: servizioIdContestoAttuale(), fermate: [{ citta: '', indirizzo: '' }] }] }));
  }


  function infoCompleta() {
    return Boolean(form.artista && form.genere && form.luogo && form.citta && form.data);
  }

  // Completamento VERO di ogni sezione/sotto-sezione — non "ci sono
  // passato sopra", ma "ho scritto qualcosa lì dentro". Usato solo per
  // il segno di spunta verde in creazione: non blocca mai il
  // salvataggio, tratte/immagini/descrizione restano facoltative.
  const numeroImmagini = (form.immagini ?? []).length;
  const bigliettoPersonalizzato = Boolean(form.ticketColoreAccento || form.ticketImmagineSfondoUrl || form.layoutBigliettoId);
  const descrizioneCompilata = Boolean((form.descrizione ?? '').trim() || (form.descrizioneSeo ?? '').trim());

  // Auto-salvataggio nel BROWSER (non più sul server) — solo per un
  // evento NUOVO (non in modifica di uno esistente): tiene il form
  // scritto in localStorage mentre si compila, così un ricaricamento
  // accidentale della pagina non fa perdere nulla. A differenza di
  // prima, questo non tocca mai il server prima del salvataggio vero
  // — niente più righe "fantasma" nel database per bozze mai
  // completate, e niente più rischio di duplicare tragitti/servizi ad
  // ogni giro (il bug che aveva fatto scoprire il problema: ogni
  // auto-salvataggio sul server, senza un modo affidabile di sapere
  // cosa fosse già stato salvato, rischiava di ricreare le stesse
  // righe più volte).
  useEffect(() => {
    if (evento) return; // in modifica di un evento vero, non serve: è già salvato
    localStorage.setItem('inbus_bozza_form_evento', JSON.stringify({ form, servizi, modalitaServizi }));
    localStorage.setItem('inbus_creazione_evento_in_corso', '1');
  }, [form, servizi, modalitaServizi, evento]);

  async function nuovoGenere() {
    const nome = window.prompt('Nome del nuovo genere:');
    if (!nome || !nome.trim()) return;
    try {
      const creato = await categorieApi.create(nome.trim());
      ricaricaCategorie();
      setForm((f) => ({ ...f, genere: creato.nome }));
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile creare il genere: ${e.message}` : 'Impossibile creare il genere: errore di rete.');
    }
  }

  async function nuovaCategoria() {
    const nome = window.prompt('Nome della nuova categoria (comparirà come pulsante in alto sul sito):');
    if (!nome || !nome.trim()) return;
    try {
      const creata = await categorieEventoApi.create(nome.trim());
      ricaricaCategorieEvento();
      setForm((f) => ({ ...f, categoria: creata.nome }));
    } catch (e) {
      alert(e instanceof ErroreApi ? `Impossibile creare la categoria: ${e.message}` : 'Impossibile creare la categoria: errore di rete.');
    }
  }


  function aggiungiImmagine() {
    if (!nuovaImmagine.trim()) return;
    setForm({ ...form, immagini: [...(form.immagini ?? []), nuovaImmagine.trim()] });
    setNuovaImmagine('');
  }
  function rimuoviImmagine(idx: number) {
    setForm({ ...form, immagini: (form.immagini ?? []).filter((_, i) => i !== idx) });
  }

  async function salva() {
    if (salvando) return; // già in corso, ignora click ripetuti
    if (!infoCompleta()) {
      alert('Compila almeno artista, genere, luogo, città e data.');
      return;
    }
    if (numeroTragitti === 0) {
      alert('Aggiungi almeno un tragitto prima di salvare.');
      setStep(2);
      return;
    }
    if (modalitaServizi === 'multiplo') {
      const haTragittiLiberi = (form.tragitti ?? []).some((t) => !t.servizioId);
      const gruppiTotali = servizi.length + (haTragittiLiberi ? 1 : 0);
      if (gruppiTotali < 2) {
        alert('Hai scelto "Più servizi" ma di fatto ne hai solo uno — aggiungine almeno un secondo, oppure torna su "Un solo servizio".');
        setStep(2);
        return;
      }
    }
    const servizioSenzaNome = servizi.find((v) => !v.nome.trim());
    if (servizioSenzaNome) {
      alert('Dai un nome a tutti i servizi prima di salvare — è un campo obbligatorio, come tutti gli altri.');
      setStep(2);
      setModalitaServizi('multiplo');
      setServizioTabAttivo(servizioSenzaNome.key);
      setRinominaServizioAperto(true);
      return;
    }
    // Ogni servizio creato in QUESTA sessione di modifica (sia
    // convertendo un evento a "più servizi" — che ne crea due insieme
    // — sia aggiungendone un altro su un evento già a più servizi) va
    // rinominato davvero prima di poter salvare, non basta il nome
    // automatico "Servizio N". I servizi già esistenti da prima
    // (caricati dal server, mai toccati da questa sessione) non
    // rientrano in questo controllo.
    const servizioDaRinominare = servizi.find((v) => v.daRinominare);
    if (servizioDaRinominare) {
      alert(`Rinomina "${servizioDaRinominare.nome}" prima di salvare — un nome vero aiuta a distinguerlo dagli altri, sia per te sia per i clienti in fase di scelta.`);
      setStep(2);
      setModalitaServizi('multiplo');
      setServizioTabAttivo(servizioDaRinominare.key);
      setRinominaServizioAperto(true);
      return;
    }
    // Un servizio senza nessun tragitto (nemmeno uno con un nome vero
    // — quelli senza nome vengono comunque scartati al salvataggio,
    // vedi sotto) non può essere salvato così: o lo si completa, o lo
    // si annulla dal pulsante apposta mentre è ancora vuoto.
    const servizioVuoto = servizi.find((v) => !(form.tragitti ?? []).some((t) => t.servizioId === v.key && t.nome.trim()));
    if (servizioVuoto) {
      alert(`Il servizio "${servizioVuoto.nome}" non ha ancora nessun tragitto — aggiungine almeno uno, oppure annullalo dal pulsante "Annulla" mentre è ancora vuoto.`);
      setStep(2);
      setModalitaServizi('multiplo');
      setServizioTabAttivo(servizioVuoto.key);
      return;
    }
    if (numeroImmagini === 0) {
      alert('Carica almeno un\'immagine prima di salvare.');
      setStep(3);
      setSubTabImmagini('immagini');
      return;
    }
    const tratteValide = (form.tragitti ?? [])
      .filter((l) => l.nome.trim())
      .map((l) => ({ ...l, fermate: l.fermate.filter((f, idx) => f.citta.trim() && (idx === 0 || f.indirizzo?.trim())) }));
    const payload = {
      ...form,
      // Solo i tragitti liberi restano qui — quelli dentro un servizio
      // vanno annidati sotto il loro servizio, il server li aspetta lì.
      tragitti: tratteValide.filter((l) => !l.servizioId),
      servizi: servizi.map((v) => ({
        id: v.id, // assente = servizio nuovo, non ancora salvato
        nome: v.nome,
        tragitti: tratteValide.filter((l) => l.servizioId === v.key).map((l) => ({ ...l, servizioId: undefined })),
      })),
    };
    setSalvando(true);
    try {
      if (evento) {
        await eventiApi.update(evento.id, payload);
      } else {
        await eventiApi.create(payload);
      }
      localStorage.removeItem('inbus_bozza_form_evento');
      localStorage.removeItem('inbus_creazione_evento_in_corso');
      onSalvato();
      onClose();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server. Controlla che il backend sia acceso.');
      // Il salvataggio è fallito — sul server non è cambiato nulla,
      // ma qui in modulo potevano già esserci modifiche locali (es.
      // un tragitto tolto perché si voleva eliminare, poi rifiutato
      // dal server perché ha prenotazioni confermate): senza
      // ricaricare i dati veri, sembrerebbe sparito anche se è ancora
      // perfettamente intatto sul server. Solo per un evento già
      // esistente — per uno nuovo, non salvato ancora, non c'è nessun
      // dato "vero" da recuperare.
      if (evento) {
        try {
          const fresco = await eventiApi.getById(evento.id);
          caricaDaEvento(fresco);
        } catch { /* se anche il ricaricamento fallisce, il modulo resta com'è — meglio di niente */ }
      }
    } finally {
      setSalvando(false);
    }
  }

  const modificato = formIniziale !== '' && JSON.stringify(form) !== formIniziale;
  const chiediConferma = useAvvisoModificheNonSalvate(modificato);

  // ---- Blocchi di campi condivisi tra wizard (creazione) e vista Dettagli (modifica) ----

  const campiInfoEvento: ReactNode = (
    <>
      <div className="sub-tabs">
        <button type="button" className={`sub-tab${subTabInfo === 'info' ? ' active' : (!evento && infoCompleta()) ? ' completato' : ''}`} onClick={() => setSubTabInfo('info')}>Informazioni</button>
        <button type="button" className={`sub-tab${subTabInfo === 'descrizione' ? ' active' : (!evento && descrizioneCompilata) ? ' completato' : ''}`} onClick={() => setSubTabInfo('descrizione')}>Descrizione</button>
      </div>

      {subTabInfo === 'info' && (
        <>
          <div className="form-grid">
            <label style={{ gridColumn: '1 / -1' }}>Artista <input value={form.artista} onChange={(e) => setForm({ ...form, artista: e.target.value })} /></label>
            <label>Genere
              <select value={form.genere} onChange={(e) => { if (e.target.value === '__nuovo__') { nuovoGenere(); return; } setForm({ ...form, genere: e.target.value }); }}>
                <option value="" disabled>Scegli un genere...</option>
                {categorie.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                {form.genere && !categorie.some((c) => c.nome === form.genere) && (
                  <option value={form.genere}>{form.genere}</option>
                )}
                <option value="__nuovo__">+ Nuovo genere...</option>
              </select>
            </label>
            <label>
              <EtichettaTooltip testo="Categoria" chiave="categoria" mappaTooltip={mappaTooltip} />
              <select
                value={form.categoria ?? ''}
                onChange={(e) => { if (e.target.value === '__nuova__') { nuovaCategoria(); return; } setForm({ ...form, categoria: e.target.value || null }); }}
              >
                <option value="">— Nessuna —</option>
                {categorieEvento.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                {form.categoria && !categorieEvento.some((c) => c.nome === form.categoria) && (
                  <option value={form.categoria}>{form.categoria}</option>
                )}
                <option value="__nuova__">+ Nuova categoria...</option>
              </select>
            </label>
            <label>Luogo <input value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} /></label>
            <label>Città <input value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
            <label>Data <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
            <label>
              <EtichettaTooltip testo="URL" chiave="url" mappaTooltip={mappaTooltip} />
              <input
                value={form.slug ?? ''}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder={`es. ${(form.artista || 'nome-evento').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(form.citta || 'citta').toLowerCase()}`}
              />
            </label>
            <label>Acconto (€)
              <CampoNumero valuta min={1} value={form.accontoEur} onChange={(v) => setForm({ ...form, accontoEur: v ?? 0 })} />
            </label>
            <label>
              <EtichettaTooltip testo="Avviso disponibilità" chiave="avviso_disponibilita" mappaTooltip={mappaTooltip} />
              <select
                value={form.statoDisponibilita ?? ''}
                onChange={(e) => setForm({ ...form, statoDisponibilita: (e.target.value || null) as typeof form.statoDisponibilita })}
              >
                <option value="">Automatico (calcolato dai posti veri)</option>
                <option value="POCHI_POSTI">Pochi posti disponibili</option>
                <option value="NUOVI_POSTI">Nuovi posti disponibili</option>
                <option value="ESAURITO">Posti terminati</option>
              </select>
            </label>
          </div>
          <div className="campo">
            <label><input type="checkbox" checked={form.inEvidenza ?? false} onChange={(e) => setForm({ ...form, inEvidenza: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> In evidenza in homepage</label>
          </div>
          <div className="campo">
            <label>
              <input type="checkbox" checked={form.visibileSito ?? true} onChange={(e) => setForm({ ...form, visibileSito: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} />
              <EtichettaTooltip testo="Visibile sul sito" chiave="visibile_sito" mappaTooltip={mappaTooltip} />
            </label>
          </div>
        </>
      )}

      {subTabInfo === 'descrizione' && (
        <>
          <div className="campo">
            <label><EtichettaTooltip testo="Informazioni viaggio per i clienti" chiave="informazioni_viaggio" mappaTooltip={mappaTooltip} /></label>
            <textarea
              value={form.descrizione ?? ''}
              onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
              rows={5}
              placeholder="Es. orario e punto di ritrovo, cosa portare, regole del bus, contatti in caso di emergenza..."
            />
          </div>
          <div className="campo">
            <label><EtichettaTooltip testo="Descrizione evento" chiave="descrizione_evento" mappaTooltip={mappaTooltip} /></label>
            <textarea
              value={form.descrizioneSeo ?? ''}
              onChange={(e) => setForm({ ...form, descrizioneSeo: e.target.value })}
              rows={4}
              placeholder="Un testo descrittivo sull'evento/artista — se la lasci vuota, per Google viene generata automaticamente (artista, data, città, prezzo), ma sulla pagina non comparirà nessuna sezione."
            />
          </div>
        </>
      )}
    </>
  );

  // In "Più servizi", vero solo se la tab scelta esiste ma non ha
  // ancora un nome — a quel punto la sezione di compilazione resta
  // nascosta finché non lo scrivi.
  const servizioAttivoCorrente = modalitaServizi === 'multiplo' && servizioTabAttivo && servizioTabAttivo !== 'liberi'
    ? servizi.find((v) => v.key === servizioTabAttivo)
    : undefined;
  const servizioSenzaNomeAttivo = !!servizioAttivoCorrente && !servizioAttivoCorrente.nome.trim();

  const campiTratte: ReactNode = (
    <>
      {/* Nessuna domanda "quanti servizi" — ogni evento parte "a un
          servizio", "+ Aggiungi un servizio" è l'unico modo per
          passare a più servizi, disponibile fin da subito (anche per
          un evento non ancora salvato). */}
      {modalitaServizi === 'singolo' && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5, marginBottom: 16, borderRadius: 999 }} onClick={aggiungiServizioAdEventoSingolo}>
          + Aggiungi un servizio
        </button>
      )}

      {modalitaServizi === 'multiplo' && (
        <div className="section-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {servizi.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={`mini-tab${servizioTabAttivo === v.key ? ' active' : ''}`}
                  style={{ borderRadius: 999 }}
                  onClick={() => setServizioTabAttivo(v.key)}
                  onDoubleClick={() => { setServizioTabAttivo(v.key); setRinominaServizioAperto(true); }}
                  title="Un click per aprire, doppio click per rinominare"
                >
                  {v.nome || 'Senza nome'}
                </button>
              ))}
              {(form.tragitti ?? []).some((t) => !t.servizioId) && (
                <button
                  type="button"
                  className={`mini-tab${servizioTabAttivo === 'liberi' ? ' active' : ''}`}
                  style={{ borderRadius: 999 }}
                  onClick={() => { setServizioTabAttivo('liberi'); setRinominaServizioAperto(false); }}
                >
                  Tragitti liberi
                </button>
              )}
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5, borderRadius: 999 }} onClick={nuovoServizio}>+ Nuovo servizio</button>
            </div>

            {servizioTabAttivo && servizioTabAttivo !== 'liberi' && (() => {
              const servizioCorrente = servizi.find((v) => v.key === servizioTabAttivo);
              if (!servizioCorrente) return null;
              return (
                <>
                  {rinominaServizioAperto ? (
                    <div style={{
                      display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap',
                      background: 'var(--dusk)', border: '1.5px solid var(--blue)', borderRadius: 999, padding: '6px 6px 6px 16px',
                    }}>
                      <input
                        placeholder="Nome servizio"
                        defaultValue={servizioCorrente.nome}
                        onBlur={(e) => rinominaServizio(servizioCorrente.key, e.target.value)}
                        autoFocus
                        style={{ flex: 1, minWidth: 120, border: 'none', background: 'transparent', padding: '6px 0' }}
                      />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, borderRadius: 999 }} onClick={() => setRinominaServizioAperto(false)}>✓ Fatto</button>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 13, flexWrap: 'wrap',
                      background: 'var(--dusk)', border: '1.5px solid var(--blue)', borderRadius: 999, padding: '8px 8px 8px 16px',
                    }}>
                      <span style={{ fontWeight: 600 }}>{servizioCorrente.nome}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, borderRadius: 999 }} onClick={() => setRinominaServizioAperto(true)}>Rinomina</button>
                        {/* Un servizio CON tragitti si "svuota" rimuovendoli
                            uno a uno (sparisce da solo quando arriva a
                            zero) — ma uno ancora vuoto, appena creato, non
                            ne ha nessuno da rimuovere: questo pulsante
                            serve solo per quel caso, per poterlo annullare
                            subito senza dover prima aggiungere e poi
                            togliere un tragitto finto. */}
                        {!(form.tragitti ?? []).some((t) => t.servizioId === servizioCorrente.key) && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ color: 'var(--pink)', fontSize: 12, borderRadius: 999 }}
                            onClick={() => rimuoviServizio(servizioCorrente.key, form.tragitti ?? [])}
                          >
                            Annulla (è ancora vuoto)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* L'arrivo (indirizzo + orario) non si imposta più
                      da qui — si fa da Partenze, insieme a orario e
                      prezzo delle fermate, una volta che il tragitto è
                      confermato lì con un bus vero. */}
                </>
              );
            })()}
        </div>
      )}

      {/* Stessa cosa: l'arrivo di un evento a servizio singolo si
          imposta da Partenze, non più da qui. */}

      {/* Con i nomi di default, capita raramente — ma resta una rete di
          sicurezza: se per caso un servizio finisse senza nome (es.
          rinominato con un campo vuoto), la compilazione resta
          nascosta finché non gliene dai uno. */}
      {(() => {
        if (!servizioSenzaNomeAttivo) return null;
        return <p className="testo-intro" style={{ marginBottom: 16 }}>Dai un nome a questo servizio qui sopra per iniziare a compilarlo.</p>;
      })()}

      {modalitaServizi !== null && !servizioSenzaNomeAttivo && (
      <>
      {percorsiSalvati.length > 0 && (() => {
        const contesto = servizioIdContestoAttuale();
        function giaUsato(t: PercorsoSalvato) {
          return (form.tragitti ?? []).some((l) => l.nome === t.nome && (l.servizioId ?? null) === contesto);
        }
        // Stessa regola già usata per il raggruppamento in Tragitti
        // Salvati — l'arrivo è l'ultima fermata dell'elenco, nessun
        // campo a parte.
        function arrivoDi(t: PercorsoSalvato) {
          return t.fermate[t.fermate.length - 1]?.citta?.trim() || '— senza arrivo —';
        }
        const cittaConConteggio = [...new Map(percorsiSalvati.map((t) => [arrivoDi(t), true])).keys()]
          .map((citta) => ({ citta, conteggio: percorsiSalvati.filter((t) => arrivoDi(t) === citta).length }))
          .sort((a, b) => b.conteggio - a.conteggio || a.citta.localeCompare(b.citta));
        const percorsiDellaCitta = cittaPercorsoScelta ? percorsiSalvati.filter((t) => arrivoDi(t) === cittaPercorsoScelta) : [];
        const tuttiSelezionabiliSelezionati = percorsiDellaCitta.length > 0 && percorsiDellaCitta.every((t) => giaUsato(t) || percorsiSelezionatiIds.has(t.id));

        function aggiungiSelezionati() {
          for (const t of percorsiDellaCitta) {
            if (percorsiSelezionatiIds.has(t.id) && !giaUsato(t)) aggiungiTragittoDaPercorso(t);
          }
          setPercorsiSelezionatiIds(new Set());
          setCittaPercorsoScelta('');
        }

        return (
          <div className="section-card" style={{ marginBottom: 16 }}>
            <p className="section-label" style={{ marginBottom: 10 }}>Aggiungi un tragitto da quelli salvati</p>
            <div className="campo" style={{ marginBottom: cittaPercorsoScelta ? 10 : 0 }}>
              <label>Città di arrivo</label>
              <select
                value={cittaPercorsoScelta}
                onChange={(e) => { setCittaPercorsoScelta(e.target.value); setPercorsiSelezionatiIds(new Set()); }}
              >
                <option value="">Scegli una città di arrivo...</option>
                {cittaConConteggio.map(({ citta, conteggio }) => (
                  <option key={citta} value={citta}>{citta} ({conteggio})</option>
                ))}
              </select>
            </div>

            {cittaPercorsoScelta && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '10px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={tuttiSelezionabiliSelezionati}
                    onChange={(e) => {
                      const selezionabili = percorsiDellaCitta.filter((t) => !giaUsato(t)).map((t) => t.id);
                      setPercorsiSelezionatiIds(e.target.checked ? new Set(selezionabili) : new Set());
                    }}
                    style={{ width: 'auto' }}
                  />
                  Tutti insieme ({percorsiDellaCitta.filter((t) => !giaUsato(t)).length})
                </label>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
                  {percorsiDellaCitta.map((t) => {
                    const usato = giaUsato(t);
                    return (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', opacity: usato ? .5 : 1, cursor: usato ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={percorsiSelezionatiIds.has(t.id)}
                          disabled={usato}
                          onChange={(e) => setPercorsiSelezionatiIds((prev) => {
                            const nuovo = new Set(prev);
                            if (e.target.checked) nuovo.add(t.id); else nuovo.delete(t.id);
                            return nuovo;
                          })}
                          style={{ width: 'auto' }}
                        />
                        {t.nome}{usato ? ' (già aggiunto a questo servizio)' : ''}
                      </label>
                    );
                  })}
                </div>
                <button type="button" className="btn btn-primary" disabled={percorsiSelezionatiIds.size === 0} onClick={aggiungiSelezionati}>
                  Aggiungi {percorsiSelezionatiIds.size > 0 ? `(${percorsiSelezionatiIds.size})` : ''}
                </button>
              </>
            )}
          </div>
        );
      })()}

      {(form.tragitti ?? []).map((tragitto, idxTragitto) => {
        // Mostra solo i tragitti del contesto giusto: in modalità
        // "1 servizio" solo quelli liberi, in "Più servizi" solo quelli
        // della tab scelta (o i liberi, se è quella la tab attiva).
        if (modalitaServizi === 'singolo' && tragitto.servizioId) return null;
        if (modalitaServizi === 'multiplo') {
          const contestoGiusto = servizioTabAttivo === 'liberi' ? !tragitto.servizioId : tragitto.servizioId === servizioTabAttivo;
          if (!contestoGiusto) return null;
        }
        const espansa = tragittiAperti.has(idxTragitto);
        const disattivato = tragitto.attivo === false;
        return (
        <div key={idxTragitto} className="section-card" style={disattivato ? { opacity: .55, background: 'repeating-linear-gradient(135deg, var(--dusk), var(--dusk) 10px, var(--dusk-2) 10px, var(--dusk-2) 20px)' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={() => toggleTragittoAperto(idxTragitto)}>
              <span style={{ color: 'var(--mist)', fontSize: 13 }}>{espansa ? '▾' : '▸'}</span>
              <div style={{ flex: 1 }}>
                <input
                  value={tragitto.nome}
                  onChange={(e) => aggiornaTragitto(idxTragitto, 'nome', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Tragitto senza nome"
                  style={{ background: 'none', border: 'none', padding: 0, margin: 0, fontWeight: 700, fontSize: 'inherit', color: 'inherit', width: '100%', cursor: 'text' }}
                />
                {disattivato && <span className="badge attenzione" style={{ marginLeft: 8 }}>Disattivato</span>}
                {!espansa && (
                  <p className="section-sub" style={{ margin: '2px 0 0' }}>
                    {tragitto.fermate.length} fermat{tragitto.fermate.length === 1 ? 'a' : 'e'}
                    {tragitto.fermate.some((f) => f.citta) && ` — ${tragitto.fermate.filter((f) => f.citta).map((f) => `${f.citta}${f.orario ? ` (${f.orario})` : ''}`).join(', ')}`}
                  </p>
                )}
              </div>
            </div>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mist)', cursor: 'pointer', flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
              title="Disattivato: resta configurato, ma non è più prenotabile sul sito"
            >
              <input
                type="checkbox"
                checked={!disattivato}
                onChange={(e) => aggiornaTragitto(idxTragitto, 'attivo', e.target.checked)}
                style={{ width: 'auto' }}
              />
              Attivo
            </label>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12.5, flexShrink: 0 }} onClick={() => rimuoviTragitto(idxTragitto)}>Rimuovi tragitto</button>
          </div>

          {/* Solo qui, nella tab "Tragitti liberi" — un modo diretto per
              organizzarli dentro un servizio vero, senza doverli
              ricreare da zero (utile qualunque sia la causa per cui un
              tragitto è finito qui invece che in un servizio con nome). */}
          {modalitaServizi === 'multiplo' && !tragitto.servizioId && servizi.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <select
                value=""
                onChange={(e) => { if (e.target.value) aggiornaTragitto(idxTragitto, 'servizioId', e.target.value); }}
                style={{ fontSize: 12.5, maxWidth: 260 }}
              >
                <option value="" disabled>↳ Sposta in un servizio...</option>
                {servizi.map((v) => <option key={v.key} value={v.key}>{v.nome || 'Senza nome'}</option>)}
              </select>
            </div>
          )}

          {espansa && (
          <>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button" className="btn btn-ghost" style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={() => invertiTragitto(idxTragitto)}
              disabled={inversioneInCorso.has(tragitto.id ?? `nuovo-${idxTragitto}`)}
              title="Scambia partenza e arrivo, gira anche l'ordine delle fermate intermedie (e il nome, se segue la forma 'A → B')"
            >
              ↔ Inverti
            </button>
          </div>
          <p className="section-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center' }}>
            Fermate
            <InfoTooltip>{mappaTooltip.fermate_orario_intro ?? TOOLTIP_DEFAULT.fermate_orario_intro}</InfoTooltip>
          </p>

          <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 6 }}>Trascina una fermata per riordinarla.</p>
          {tragitto.fermate.map((f, idxFermata) => (
            <div key={idxFermata} style={{ marginBottom: 6 }}>
              {idxFermata === 0 && (
                <p style={{ marginBottom: 4, fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>Partenza</p>
              )}
              <div
                draggable
                onDragStart={() => onDragStart(idxTragitto, idxFermata)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropSu(idxTragitto, idxFermata)}
                style={{
                  display: 'grid', gridTemplateColumns: '16px 1fr 1.3fr auto auto', gap: 6, alignItems: 'center',
                  opacity: trascinata?.tragitto === idxTragitto && trascinata.fermata === idxFermata ? 0.4 : 1, cursor: 'grab',
                }}
              >
                <span style={{ color: 'var(--mist)', fontSize: 14, textAlign: 'center' }} title="Trascina per riordinare">⠿</span>
                {f.fermataAnagraficaId !== null ? (
                  // Di default (e finché non si sceglie "scrivi
                  // manualmente") si parte da qui — un elenco leggibile,
                  // non un'iconcina minuscola. Città/indirizzo arrivano
                  // dall'anagrafica quando si sceglie una voce vera.
                  <select
                    style={{ gridColumn: 'span 2' }}
                    value={f.fermataAnagraficaId ?? ''}
                    onChange={(e) => selezionaFermataAnagrafica(idxTragitto, idxFermata, e.target.value)}
                  >
                    <option value="" disabled>— Scegli una fermata dall'anagrafica —</option>
                    {fermateAnagrafica.map((fa) => {
                      // Non ha senso la stessa fermata due volte nello
                      // stesso tragitto (es. "Milano" scelta sia come
                      // fermata 1 che come fermata 3) — disabilitata se
                      // già usata da UN'ALTRA riga qui sotto (non questa
                      // stessa, che deve restare selezionabile/invariata).
                      const usataAltrove = tragitto.fermate.some((altra, i) => i !== idxFermata && altra.fermataAnagraficaId === fa.id);
                      return (
                        <option key={fa.id} value={fa.id} disabled={usataAltrove}>
                          {fa.nome === fa.citta ? fa.nome : `${fa.nome} — ${fa.citta}`}{usataAltrove ? ' (già in questo tragitto)' : ''}
                        </option>
                      );
                    })}
                    <option value="__manuale__">✎ Scrivi manualmente, senza anagrafica...</option>
                  </select>
                ) : (
                  <>
                    <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idxTragitto, idxFermata, 'citta', e.target.value)} />
                    <input placeholder="Indirizzo" value={f.indirizzo ?? ''} onChange={(e) => aggiornaFermata(idxTragitto, idxFermata, 'indirizzo', e.target.value)} />
                  </>
                )}
                <label
                  title={f.attivo === false ? 'Fermata esclusa — non compare più nelle Linee né sul sito' : 'Fermata attiva — clicca per escluderla (es. per scarse adesioni), senza doverla rimuovere del tutto'}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: f.attivo === false ? 'var(--pink)' : 'var(--mist)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <input type="checkbox" checked={f.attivo !== false} onChange={(e) => aggiornaFermata(idxTragitto, idxFermata, 'attivo', e.target.checked)} style={{ width: 'auto' }} />
                  {f.attivo === false ? 'Esclusa' : 'Attiva'}
                </label>
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', padding: '4px 8px' }} onClick={() => rimuoviFermata(idxTragitto, idxFermata)} title="Rimuovi fermata">✕</button>
              </div>
              {f.fermataAnagraficaId === null && fermateAnagrafica.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, marginLeft: 22, marginTop: 2, padding: 0 }}
                  onClick={() => setForm((prev) => {
                    const tragitti = [...(prev.tragitti ?? [])];
                    const fermate = [...tragitti[idxTragitto].fermate];
                    fermate[idxFermata] = { ...fermate[idxFermata], fermataAnagraficaId: undefined };
                    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate };
                    return { ...prev, tragitti };
                  })}
                >
                  ← Torna a scegliere dall'anagrafica
                </button>
              )}
              {/* La soglia minima si decide ORA sui Percorsi salvati,
                  non più qui — arriva già impostata quando applichi un
                  percorso (o si scrive qui per un tragitto manuale, in
                  Aggiungi fermata). Facoltativa su ogni fermata, non
                  solo su una "di Partenza" — quel concetto è stato
                  tolto. Qui resta solo un'indicazione, per sapere a
                  colpo d'occhio quali fermate ce l'hanno mentre
                  costruisci l'evento. */}
              {f.sogliaMinima != null && (
                <p style={{ marginLeft: 22, marginTop: 4, fontSize: 11.5, color: 'var(--mist)' }}>
                  ◔ Soglia minima {f.sogliaMinima} partecipanti — impostata dal tragitto salvato, si cambia solo lì
                </p>
              )}
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiungiFermata(idxTragitto)}>+ Aggiungi fermata</button>

          <p style={{ marginTop: 14, marginBottom: 4, fontSize: 15, fontWeight: 700, color: 'var(--pink)' }}>Arrivo</p>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <label>Città di arrivo
              <input
                value={tragitto.arrivoCitta ?? ''}
                onChange={(e) => aggiornaTragitto(idxTragitto, 'arrivoCitta', e.target.value)}
                placeholder="es. Roma"
              />
            </label>
            <label>Indirizzo di arrivo
              <input
                value={tragitto.arrivoIndirizzo ?? ''}
                onChange={(e) => aggiornaTragitto(idxTragitto, 'arrivoIndirizzo', e.target.value)}
                placeholder="es. Piazzale Clodio, Roma"
              />
            </label>
            <label>Orario di arrivo
              <OrarioInput value={tragitto.arrivoOrario ?? ''} onChange={(v) => aggiornaTragitto(idxTragitto, 'arrivoOrario', v)} />
            </label>
          </div>
          </>
          )}
        </div>
      );})}
      <button className="btn btn-ghost" style={{ marginBottom: 6 }} onClick={aggiungiTragittoManuale}>+ Aggiungi tragitto manuale (senza tragitto salvato)</button>
      </>
      )}
    </>
  );

  const campiImmagini: ReactNode = (
    <>
      <div className="sub-tabs">
        <button type="button" className={`sub-tab${subTabImmagini === 'immagini' ? ' active' : (!evento && numeroImmagini > 0) ? ' completato' : ''}`} onClick={() => setSubTabImmagini('immagini')}>Immagini</button>
        <button type="button" className={`sub-tab${subTabImmagini === 'biglietto' ? ' active' : (!evento && bigliettoPersonalizzato) ? ' completato' : ''}`} onClick={() => setSubTabImmagini('biglietto')}>Biglietto</button>
      </div>

      {subTabImmagini === 'immagini' && (
        <>
          <p className="section-label" style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
            Immagini
            <InfoTooltip>{mappaTooltip.immagini_evento_intro ?? TOOLTIP_DEFAULT.immagini_evento_intro}</InfoTooltip>
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            <input placeholder="https://..." value={nuovaImmagine} onChange={(e) => setNuovaImmagine(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={aggiungiImmagine}>+ Aggiungi link</button>
            <CaricaFile onCaricato={(url) => setForm({ ...form, immagini: [...(form.immagini ?? []), url] })} etichetta="+ Carica file" />
          </div>
          {(form.immagini ?? []).map((url, idx) => (
            <div key={idx} className="riga-cliccabile" style={{ cursor: 'default' }}>
              <span className="riga-titolo" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>{url}</span>
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12 }} onClick={() => rimuoviImmagine(idx)}>Rimuovi</button>
            </div>
          ))}
          {(form.immagini ?? []).length === 0 && <p className="testo-intro" style={{ fontSize: 13 }}>Nessuna immagine ancora.</p>}
        </>
      )}

      {subTabImmagini === 'biglietto' && (
        <>
          <p className="section-label" style={{ marginBottom: 14, display: 'flex', alignItems: 'center' }}>
            Grafica del biglietto
            <InfoTooltip>{mappaTooltip.biglietto_grafica_intro ?? TOOLTIP_DEFAULT.biglietto_grafica_intro}</InfoTooltip>
          </p>
          <div className="campo">
            <label>Colore d'accento</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={form.ticketColoreAccento || '#111111'}
                onChange={(e) => setForm({ ...form, ticketColoreAccento: e.target.value })}
                style={{ width: 44, height: 36, padding: 2, flexShrink: 0 }}
              />
              <input
                placeholder="#dc2626"
                value={form.ticketColoreAccento ?? ''}
                onChange={(e) => setForm({ ...form, ticketColoreAccento: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="campo">
            <label><EtichettaTooltip testo="Immagine di intestazione" chiave="immagine_intestazione" mappaTooltip={mappaTooltip} /></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="https://... (o carica un file)"
                value={form.ticketImmagineSfondoUrl ?? ''}
                onChange={(e) => setForm({ ...form, ticketImmagineSfondoUrl: e.target.value || undefined })}
                style={{ flex: 1 }}
              />
              <CaricaFile onCaricato={(url) => setForm({ ...form, ticketImmagineSfondoUrl: url })} etichetta="Carica" />
            </div>
          </div>
          <div className="campo">
            <label><EtichettaTooltip testo="Layout del biglietto" chiave="layout_biglietto_campo" mappaTooltip={mappaTooltip} /></label>
            <select
              value={form.layoutBigliettoId ?? ''}
              onChange={(e) => setForm({ ...form, layoutBigliettoId: e.target.value || null })}
            >
              <option value="">Predefinito {(() => {
                const p = layoutDisponibili.find((l) => l.predefinito);
                return p ? `(${p.nome})` : '';
              })()}</option>
              {layoutDisponibili.filter((l) => !l.predefinito).map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </>
  );

  // "form.tragitti" contiene già sia i tragitti liberi sia quelli di
  // ogni servizio (vedi sopra dove si carica il form) — basta contare
  // qui, nessuna somma aggiuntiva necessaria.
  const numeroTragitti = (form.tragitti ?? []).filter((l) => l.nome.trim()).length;
  const stepCompleto: Record<1 | 2 | 3 | 4, boolean> = {
    1: infoCompleta(),
    2: numeroTragitti > 0,
    3: numeroImmagini > 0 || bigliettoPersonalizzato,
    4: false, // il riepilogo non ha un vero "completato", è solo una vista
  };

  // ---- Vista MODIFICA (evento esistente): tab Dettagli/Partenze ----

  if (evento) {
    const titoloTab = soloQuestaTab
      ? { dettagli: 'Modifica evento', partenze: 'Partenze', 'lista-attesa': "Lista d'attesa", offerte: 'Offerte', comunicazioni: 'Comunicazioni' }[tabIniziale]
      : 'Modifica evento';
    return (
      <PaginaSezione titolo={`${titoloTab} — ${evento.artista}`} onIndietro={onClose} richiediConferma={() => chiediConferma(onClose)} larga={tabAttiva === 'partenze'}>
        {!soloQuestaTab && (
          <div className="mini-tabs">
            <button type="button" className={`mini-tab${tabAttiva === 'dettagli' ? ' active' : ''}`} onClick={() => setTabAttiva('dettagli')}>Dettagli</button>
            <button type="button" className={`mini-tab${tabAttiva === 'partenze' ? ' active' : ''}`} onClick={() => setTabAttiva('partenze')}>Partenze</button>
            <button type="button" className={`mini-tab${tabAttiva === 'lista-attesa' ? ' active' : ''}`} onClick={() => setTabAttiva('lista-attesa')}>Lista d'attesa</button>
            {evento && <button type="button" className={`mini-tab${tabAttiva === 'comunicazioni' ? ' active' : ''}`} onClick={() => setTabAttiva('comunicazioni')}>Comunicazioni</button>}
            <button type="button" className={`mini-tab${tabAttiva === 'offerte' ? ' active' : ''}`} onClick={() => setTabAttiva('offerte')}>Offerte</button>
          </div>
        )}

        {tabAttiva === 'partenze' && <PartenzeTab eventoId={evento.id} servizi={servizi.map((v) => ({ key: v.id ?? v.key, nome: v.nome }))} contestoPartenze={contestoPartenze} onSalvato={onSalvato} />}
        {tabAttiva === 'lista-attesa' && <ListaAttesaTab eventoId={evento.id} servizi={(evento.servizi ?? []).map((s) => ({ key: s.id, nome: s.nome }))} />}
        {tabAttiva === 'comunicazioni' && evento && <ComunicazioniTab evento={evento} />}
        {tabAttiva === 'offerte' && <OfferteTab eventoId={evento.id} nomeEvento={evento.artista} />}
        {tabAttiva === 'dettagli' && (
          <>
            {/* In modifica sono vere e proprie tab, non un percorso da
                completare in ordine: nessun segno di spunta sulle
                precedenti, solo quella cliccata risulta evidenziata —
                a differenza della creazione, qui i dati esistono già
                tutti, si sta solo navigando tra le sezioni. */}
            <div className="mini-tabs">
              {STEP_WIZARD.map((s) => (
                <button
                  key={s.numero}
                  type="button"
                  className={`mini-tab${step === s.numero ? ' active' : ''}`}
                  onClick={() => setStep(s.numero)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {step === 1 && campiInfoEvento}

            {step === 2 && (
              <>
                <p className="section-label">Tragitti</p>
                {campiTratte}
              </>
            )}

            {step === 3 && campiImmagini}

            {step === 4 && (
              <div className="evento-riepilogo-box">
                <div className="riepilogo-riga-evento"><span>Artista</span><b>{form.artista || '—'}</b></div>
                <div className="riepilogo-riga-evento"><span>Genere</span><b>{form.genere || '—'}</b></div>
                <div className="riepilogo-riga-evento"><span>Luogo</span><b>{form.luogo ? `${form.luogo}, ${form.citta}` : '—'}</b></div>
                <div className="riepilogo-riga-evento"><span>Data</span><b>{form.data ? new Date(form.data).toLocaleDateString('it-IT') : '—'}</b></div>
                <div className="riepilogo-riga-evento"><span>Acconto</span><b>€{Number(form.accontoEur || 10).toFixed(2)}</b></div>
                <div className="riepilogo-riga-evento"><span>In evidenza</span><b>{form.inEvidenza ? 'Sì' : 'No'}</b></div>
                <div className="riepilogo-riga-evento"><span>Tragitti</span><b>{numeroTragitti > 0 ? `${numeroTragitti} configurate` : 'Nessuna'}</b></div>
                <div className="riepilogo-riga-evento"><span>Immagini</span><b>{(form.immagini ?? []).length}</b></div>
              </div>
            )}

            {/* Salva e esci subito, disponibile su qualunque sezione ci
                si trovi — non serve passare dalle altre per salvare. */}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 18 }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva modifica'}</button>
          </>
        )}
      </PaginaSezione>
    );
  }

  // ---- Vista CREAZIONE (nuovo evento): wizard a step ----

  // Chiusura VOLONTARIA senza salvare — a differenza di un ricaricamento
  // accidentale della pagina, qui l'admin sta scegliendo di abbandonare
  // quello che stava scrivendo: la bozza nel browser va tolta, altrimenti
  // resterebbe lì e riapparirebbe da sola alla prossima ricarica pagina
  // (anche in un momento completamente scollegato da questa creazione).
  function chiudiSenzaSalvare() {
    localStorage.removeItem('inbus_bozza_form_evento');
    localStorage.removeItem('inbus_creazione_evento_in_corso');
    onClose();
  }

  return (
    <PaginaSezione titolo="Nuovo evento" onIndietro={chiudiSenzaSalvare} richiediConferma={() => chiediConferma(chiudiSenzaSalvare)}>
      <div className="mini-tabs">
        {STEP_WIZARD.map((s) => (
          <button
            key={s.numero}
            type="button"
            className={`mini-tab${step === s.numero ? ' active' : stepCompleto[s.numero] ? ' completato' : ''}`}
            onClick={() => setStep(s.numero)}
          >
            {stepCompleto[s.numero] && step !== s.numero && '✓ '}{s.label}
          </button>
        ))}
      </div>

      {step === 1 && campiInfoEvento}

      {step === 2 && (
        <>
          <p className="section-label">
            <EtichettaTooltip testo="Tragitti" chiave="tragitti" mappaTooltip={mappaTooltip} />
          </p>
          {campiTratte}
        </>
      )}

      {step === 3 && campiImmagini}

      {step === 4 && (
        <div className="evento-riepilogo-box">
          <div className="riepilogo-riga-evento"><span>Artista</span><b>{form.artista || '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Genere</span><b>{form.genere || '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Luogo</span><b>{form.luogo ? `${form.luogo}, ${form.citta}` : '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Data</span><b>{form.data ? new Date(form.data).toLocaleDateString('it-IT') : '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Acconto</span><b>€{Number(form.accontoEur || 10).toFixed(2)}</b></div>
          <div className="riepilogo-riga-evento"><span>In evidenza</span><b>{form.inEvidenza ? 'Sì' : 'No'}</b></div>
          <div className="riepilogo-riga-evento"><span>Tragitti</span><b>{numeroTragitti > 0 ? `${numeroTragitti} configurate` : 'Nessuna (aggiungibile dopo)'}</b></div>
          <div className="riepilogo-riga-evento"><span>Immagini</span><b>{(form.immagini ?? []).length}</b></div>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" disabled={step === 1} onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}>← Passo precedente</button>
        {step < 4 ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              if (step === 1 && !infoCompleta()) { alert('Compila almeno artista, genere, luogo, città e data prima di proseguire.'); return; }
              setStep((s) => (s + 1) as 2 | 3 | 4);
            }}
          >
            Avanti →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={salva} disabled={salvando}>{salvando ? 'Creo...' : 'Crea evento'}</button>
        )}
      </div>
    </PaginaSezione>
  );
}
