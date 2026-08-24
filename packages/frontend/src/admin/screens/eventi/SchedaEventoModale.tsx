import { useEffect, useRef, useState, type ReactNode } from 'react';
import { eventiApi, type EventoInput, type TragittoInput, type FermataInput } from '../../../api/eventi';
import { percorsiSalvatiApi, type PercorsoSalvato } from '../../../api/percorsiSalvati';
import { layoutBigliettoApi, type LayoutBiglietto } from '../../../api/layoutBiglietto';
import { categorieApi, type Categoria } from '../../../api/categorie';
import { ErroreApi } from '../../../api/client';
import type { Evento } from '../../../api/types';
import { PaginaSezione } from '../../shared/PaginaSezione';
import { OrarioInput } from '../../shared/OrarioInput';
import { useAvvisoModificheNonSalvate } from '../../shared/useAvvisoModificheNonSalvate';
import { CaricaFile } from '../../shared/CaricaFile';
import { CampoNumero } from '../../shared/CampoNumero';
import { PartenzeTab } from '../partenze/PartenzeTab';
import { ListaAttesaTab } from './ListaAttesaTab';
import { OfferteTab } from './OfferteTab';
import { geocodifica, durataViaggio, attesa } from '../../shared/geo';

const VUOTO: EventoInput = { artista: '', genere: '', luogo: '', citta: '', data: '', inEvidenza: false, accontoEur: 10, immagini: [], tragitti: [] };

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
  evento, tabIniziale = 'dettagli', soloQuestaTab = false, onClose, onSalvato,
}: {
  evento: Evento | null; // null = nuovo evento
  tabIniziale?: 'dettagli' | 'partenze' | 'lista-attesa' | 'offerte';
  // Se vero, nasconde del tutto le altre tab — usato dalle sezioni
  // principali del menu (Partenze, Lista d'attesa, Offerte), che devono
  // occuparsi solo della propria competenza, senza poter navigare per
  // sbaglio nelle altre.
  soloQuestaTab?: boolean;
  onClose: () => void;
  onSalvato: () => void;
}) {
  const [percorsiSalvati, setPercorsiSalvati] = useState<PercorsoSalvato[]>([]);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [layoutDisponibili, setLayoutDisponibili] = useState<LayoutBiglietto[]>([]);
  const [form, setForm] = useState<EventoInput>(VUOTO);
  const [tabAttiva, setTabAttiva] = useState<'dettagli' | 'partenze' | 'lista-attesa' | 'offerte'>(tabIniziale);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subTabInfo, setSubTabInfo] = useState<'info' | 'descrizione'>('info');
  const [subTabImmagini, setSubTabImmagini] = useState<'immagini' | 'biglietto'>('immagini');
  // Id della bozza salvata in automatico durante QUESTA sessione di
  // creazione (null finché non c'è abbastanza per salvarla la prima
  // volta) — una volta creata, i salvataggi successivi la aggiornano
  // invece di crearne una nuova ogni volta.
  const bozzaIdRef = useRef<string | null>(null);
  const [aggiustiPerTragitto, setAggiustiPerTratta] = useState<Record<number, string>>({});
  // Tratte comprimibili come in Partenze — le nuove restano aperte per
  // poterle compilare subito, le altre si possono chiudere per non
  // dover scorrere tutto quando ce ne sono tante.
  const [tragittiAperti, setTragittiAperti] = useState<Set<number>>(new Set());
  // I servizi — completamente locali finché non si salva tutto insieme
  // (anche alla primissima creazione dell'evento): quelli già esistenti
  // hanno l'id vero del server, quelli appena aggiunti hanno una
  // chiave temporanea che il backend riconosce come "nuovo" (nessun id).
  const [servizi, setServizi] = useState<{ key: string; id?: string; nome: string; arrivoIndirizzo?: string; arrivoOrario?: string }[]>(
    (evento?.servizi ?? []).map((p) => ({ key: p.id, id: p.id, nome: p.nome, arrivoIndirizzo: p.arrivoIndirizzo ?? undefined, arrivoOrario: p.arrivoOrario ?? undefined }))
  );
  // Due modalità nettamente separate: con un solo servizio (o nessuno) è
  // la stessa identica interfaccia di prima, senza nessun concetto di
  // "servizio" in giro — con più servizi diventano tab, come in Partenze,
  // ognuna con la propria sezione tragitti dedicata.
  const [modalitaServizi, setModalitaServizi] = useState<'singolo' | 'multiplo' | null>(() => {
    if ((evento?.servizi ?? []).length >= 1) return 'multiplo';
    if ((evento?.tragitti ?? []).some((t) => !t.servizioId)) return 'singolo';
    return null; // evento nuovo, senza nessun tragitto ancora — aspetta la scelta
  });
  const [servizioTabAttivo, setServizioTabAttivo] = useState<string | null>(servizi[0]?.key ?? null);
  const [rinominaServizioAperto, setRinominaServizioAperto] = useState(false);

  function nuovoServizio() {
    const chiave = `nuovo-${Date.now()}`;
    const numero = servizi.length + 1;
    setServizi((prev) => [...prev, { key: chiave, nome: `Servizio ${numero}`, arrivoOrario: undefined }]);
    setModalitaServizi('multiplo');
    setServizioTabAttivo(chiave);
    // Nome già pronto (default) — subito utilizzabile con un click, non
    // serve rinominarla per forza prima di poterci lavorare.
  }
  /** Passando a "Più servizi" per la prima volta, partono già 2 tab
   *  pronte all'uso (con nome di default) — non zero, come chiesto:
   *  è raro che serva "più servizi" per finirne con uno solo. */
  function passaAMultiplo() {
    setModalitaServizi('multiplo');
    if (servizi.length === 0) {
      const chiave1 = `nuovo-${Date.now()}`;
      const chiave2 = `nuovo-${Date.now() + 1}`;
      setServizi([{ key: chiave1, nome: 'Servizio 1', arrivoOrario: undefined }, { key: chiave2, nome: 'Servizio 2', arrivoOrario: undefined }]);
      setServizioTabAttivo(chiave1);
    } else if (!servizioTabAttivo) {
      setServizioTabAttivo(servizi[0]?.key ?? 'liberi');
    }
  }
  function rinominaServizio(key: string, nome: string) {
    setServizi((prev) => prev.map((v) => v.key === key ? { ...v, nome } : v));
  }
  function aggiornaArrivoServizio(key: string, campo: 'arrivoIndirizzo' | 'arrivoOrario', valore: string) {
    setServizi((prev) => prev.map((v) => v.key === key ? { ...v, [campo]: valore } : v));
  }
  function eliminaServizioConferma(key: string, nome: string) {
    if (!confirm(`Eliminare il servizio "${nome}"? I suoi tragitti non vengono cancellati, tornano "liberi" (senza servizio) — si elimina davvero solo salvando.`)) return;
    const rimasti = servizi.filter((v) => v.key !== key);
    setServizi(rimasti);
    setForm((f) => ({ ...f, tragitti: (f.tragitti ?? []).map((l) => l.servizioId === key ? { ...l, servizioId: null } : l) }));
    setServizioTabAttivo(rimasti[0]?.key ?? 'liberi');
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
  const [statoRicalcolo, setStatoRicalcolo] = useState<Record<number, string>>({});
  const [ricalcolando, setRicalcolando] = useState<Record<number, boolean>>({});
  const [formIniziale, setFormIniziale] = useState('');

  function ricaricaCategorie() {
    categorieApi.list().then(setCategorie);
  }

  useEffect(() => {
    percorsiSalvatiApi.list().then(setPercorsiSalvati);
    layoutBigliettoApi.list().then(setLayoutDisponibili).catch(() => setLayoutDisponibili([]));
    ricaricaCategorie();
    let nuovoForm: EventoInput;
    if (evento) {
      nuovoForm = {
        artista: evento.artista, genere: evento.genere, luogo: evento.luogo, citta: evento.citta,
        data: evento.data.slice(0, 10), inEvidenza: evento.inEvidenza,
        slug: evento.slug,
        accontoEur: evento.accontoEur ? Number(evento.accontoEur) : 10,
        statoDisponibilita: evento.statoDisponibilita,
        arrivoIndirizzo: evento.arrivoIndirizzo ?? undefined,
        arrivoOrario: evento.arrivoOrario ?? undefined,
        visibileSito: evento.visibileSito,
        descrizione: evento.descrizione ?? undefined,
        descrizioneSeo: evento.descrizioneSeo ?? undefined,
        ticketColoreAccento: evento.ticketColoreAccento ?? undefined,
        ticketImmagineSfondoUrl: evento.ticketImmagineSfondoUrl ?? undefined,
        layoutBigliettoId: evento.layoutBigliettoId,
        immagini: [...evento.immagini].sort((a, b) => a.ordine - b.ordine).map((i) => i.url),
        tragitti: evento.tragitti.map((l) => ({
          id: l.id,
          servizioId: l.servizioId,
          nome: l.nome, postiTotali: l.postiTotali, prezzoExtra: Number(l.prezzoExtra),
          // Normalizzo qui il prezzo che arriva dal server: se una fermata
          // non ne aveva uno salvato, arriva `null`, non `undefined` — va
          // convertito subito, altrimenti finirebbe di nuovo a rimbalzare
          // in giro come null fino a far fallire la validazione al salvataggio.
          fermate: l.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario ?? undefined, prezzo: f.prezzo ? Number(f.prezzo) : undefined, postiMax: f.postiMax ?? undefined })),
        })),
      };
    } else {
      nuovoForm = VUOTO;
      setStep(1);
    }
    setForm(nuovoForm);
    const serviziCaricati = (evento?.servizi ?? []).map((p) => ({ key: p.id, id: p.id, nome: p.nome, arrivoIndirizzo: p.arrivoIndirizzo ?? undefined, arrivoOrario: p.arrivoOrario ?? undefined }));
    setServizi(serviziCaricati);
    setModalitaServizi(
      serviziCaricati.length >= 1 ? 'multiplo' : ((nuovoForm.tragitti ?? []).some((t) => !t.servizioId) ? 'singolo' : null)
    );
    setServizioTabAttivo(serviziCaricati[0]?.key ?? null);
    setFormIniziale(JSON.stringify(nuovoForm));
    setAggiustiPerTratta({});
    setStatoRicalcolo({});
    setTabAttiva(tabIniziale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento?.id]);

  function aggiornaTragitto(idx: number, campo: keyof TragittoInput, valore: string | number) {
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
  function aggiornaFermata(idxTragitto: number, idxFermata: number, campo: keyof FermataInput, valore: string) {
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = [...tragitti[idxTragitto].fermate];
    fermate[idxFermata] = { ...fermate[idxFermata], [campo]: (campo === 'prezzo' || campo === 'postiMax') ? (Number(valore) || undefined) : valore };
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate };
    setForm({ ...form, tragitti });
  }
  function rimuoviFermata(idxTragitto: number, idxFermata: number) {
    const tragitti = [...(form.tragitti ?? [])];
    const fermate = tragitti[idxTragitto].fermate.filter((_, i) => i !== idxFermata);
    tragitti[idxTragitto] = { ...tragitti[idxTragitto], fermate: fermate.length ? fermate : [{ citta: '', indirizzo: '' }] };
    setForm({ ...form, tragitti });
  }
  function rimuoviTragitto(idxTragitto: number) {
    const tragitti = (form.tragitti ?? []).filter((_, i) => i !== idxTragitto);
    setForm({ ...form, tragitti });
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

  function aggiungiTragittoDaPercorso(percorso: PercorsoSalvato) {
    const nuovoTragitto: TragittoInput = {
      nome: percorso.nome,
      postiTotali: 50,
      prezzoExtra: 0,
      servizioId: servizioIdContestoAttuale(),
      fermate: percorso.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, prezzo: f.prezzo ?? undefined })),
    };
    setTragittiAperti((prev) => new Set(prev).add((form.tragitti ?? []).length));
    setForm({ ...form, tragitti: [...(form.tragitti ?? []), nuovoTragitto] });
  }
  function aggiungiTragittoManuale() {
    setTragittiAperti((prev) => new Set(prev).add((form.tragitti ?? []).length));
    setForm({ ...form, tragitti: [...(form.tragitti ?? []), { nome: '', postiTotali: 50, prezzoExtra: 0, servizioId: servizioIdContestoAttuale(), fermate: [{ citta: '', indirizzo: '' }] }] });
  }

  /** Applica +/- € a tutte le fermate con un prezzo già impostato di
   *  questa tratta (es. +10 aggiunge 10€ ovunque, -5 toglie 5€, mai sotto
   *  zero). Le fermate senza prezzo proprio non vengono toccate. */
  function aggiustaPrezziTragitto(idxTragitto: number) {
    const delta = Number(aggiustiPerTragitto[idxTragitto]);
    if (!delta) return;
    const tragitti = [...(form.tragitti ?? [])];
    tragitti[idxTragitto] = {
      ...tragitti[idxTragitto],
      fermate: tragitti[idxTragitto].fermate.map((f) => (
        f.prezzo !== undefined ? { ...f, prezzo: Math.max(0, Number((f.prezzo + delta).toFixed(2))) } : f
      )),
    };
    setForm({ ...form, tragitti });
    setAggiustiPerTratta((s) => ({ ...s, [idxTragitto]: '' }));
  }

  /** Ricalcola gli orari di una tratta a ritroso dall'orario di arrivo
   *  (ultima fermata), usando le distanze reali tra gli indirizzi via
   *  Nominatim + OSRM (gratuiti) — stessa logica già usata per i tragitti. */
  /** Ricalcola gli orari di una tratta a ritroso dall'ARRIVO (campo
   *  separato della tratta, non più l'ultima fermata), usando le distanze
   *  reali tra gli indirizzi via Nominatim + OSRM (gratuiti). Tutte le
   *  fermate ricevono un orario calcolato — nessuna è "l'arrivo". */
  async function ricalcolaOrariTragitto(idxTragitto: number) {
    const tragitto = (form.tragitti ?? [])[idxTragitto];
    if (!tragitto) return;
    const fermateValide = tragitto.fermate.filter((f) => f.indirizzo.trim());
    if (fermateValide.length === 0) { setStatoRicalcolo((s) => ({ ...s, [idxTragitto]: 'Aggiungi almeno una fermata con indirizzo compilato.' })); return; }

    // L'arrivo giusto dipende dal contesto: se questa tratta appartiene
    // a un servizio, usa l'arrivo di QUEL servizio (non più uno
    // condiviso); se è una tratta libera, quello dell'evento.
    const servizioDellaTratta = tragitto.servizioId ? servizi.find((v) => v.key === tragitto.servizioId) : null;
    const arrivoIndirizzoContesto = servizioDellaTratta ? servizioDellaTratta.arrivoIndirizzo : form.arrivoIndirizzo;
    const arrivoOrarioContesto = servizioDellaTratta ? servizioDellaTratta.arrivoOrario : form.arrivoOrario;
    const doveScriverlo = servizioDellaTratta ? `nella sezione arrivo di "${servizioDellaTratta.nome}" qui sopra` : 'qui sopra (vale per tutte le tratte)';

    if (!arrivoIndirizzoContesto?.trim()) { setStatoRicalcolo((s) => ({ ...s, [idxTragitto]: `Inserisci prima l'indirizzo di arrivo ${doveScriverlo}.` })); return; }
    if (!arrivoOrarioContesto) { setStatoRicalcolo((s) => ({ ...s, [idxTragitto]: `Inserisci prima l'orario di arrivo ${doveScriverlo}.` })); return; }

    setRicalcolando((s) => ({ ...s, [idxTragitto]: true }));
    setStatoRicalcolo((s) => ({ ...s, [idxTragitto]: 'Localizzo gli indirizzi...' }));

    // La sequenza da geolocalizzare è: fermate in ordine, poi l'arrivo per
    // ultimo — il viaggio finisce sempre lì.
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
      setStatoRicalcolo((s) => ({ ...s, [idxTragitto]: 'Richiesta a OpenStreetMap non riuscita (rete/firewall). Apri la Console (F12) per il dettaglio.' }));
      setRicalcolando((s) => ({ ...s, [idxTragitto]: false }));
      return;
    }

    const durate: (number | null)[] = [];
    for (let i = 0; i < coordinate.length - 1; i++) {
      const a = coordinate[i], b = coordinate[i + 1];
      durate.push(a && b ? await durataViaggio(a, b) : null);
      await attesa(300);
    }

    // Parto dall'orario di arrivo e risalgo tappa per tappa, dall'ultima
    // fermata (quella più vicina all'arrivo) fino alla prima.
    let cursore = Number(arrivoOrarioContesto.split(':')[0]) * 60 + Number(arrivoOrarioContesto.split(':')[1]);
    const orariCalcolati = new Array<string>(fermateValide.length);
    let errori = 0;
    for (let i = fermateValide.length - 1; i >= 0; i--) {
      const durata = durate[i]; // durata[i] = tratta dalla fermata i al punto successivo (fermata i+1, o l'arrivo se i è l'ultima)
      if (durata === null) { errori++; orariCalcolati[i] = ''; continue; }
      cursore -= durata + 5;
      const h = Math.floor(((cursore % 1440) + 1440) % 1440 / 60);
      const m = ((cursore % 1440) + 1440) % 1440 % 60;
      orariCalcolati[i] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    let idxValida = 0;
    const tragitti = [...(form.tragitti ?? [])];
    tragitti[idxTragitto] = {
      ...tragitti[idxTragitto],
      fermate: tragitti[idxTragitto].fermate.map((f) => {
        if (!f.indirizzo.trim()) return f;
        const orario = orariCalcolati[idxValida]; idxValida++;
        return orario ? { ...f, orario } : f;
      }),
    };
    setForm({ ...form, tragitti });

    setStatoRicalcolo((s) => ({ ...s, [idxTragitto]: errori ? `Fatto, ma ${errori} indirizzo/i non localizzato/i: controlla a mano.` : 'Orari ricalcolati e applicati.' }));
    setRicalcolando((s) => ({ ...s, [idxTragitto]: false }));
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

  // Auto-salvataggio in bozza — solo per un evento NUOVO (non in modifica
  // di uno esistente): appena ci sono almeno i campi minimi, salva da
  // sola una bozza sul server (non solo nel browser) e la tiene
  // aggiornata mentre si continua a compilare, così un'uscita
  // accidentale o un ricaricamento della pagina non fa perdere nulla —
  // riaprendo "Nuovo evento" viene proposto di riprenderla.
  useEffect(() => {
    if (evento) return; // in modifica di un evento vero, non serve: è già salvato
    if (!infoCompleta()) return;
    const timeout = setTimeout(async () => {
      try {
        const payload = { ...form, bozza: true };
        if (bozzaIdRef.current) {
          await eventiApi.update(bozzaIdRef.current, payload);
        } else {
          const creata = await eventiApi.create(payload);
          bozzaIdRef.current = creata.id;
          localStorage.setItem('inbus_bozza_evento_id', creata.id);
        }
      } catch {
        // Silenzioso apposta: un fallimento dell'auto-salvataggio non
        // deve interrompere chi sta scrivendo — riproverà al prossimo
        // cambiamento.
      }
    }, 1500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

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

  function aggiungiImmagine() {
    if (!nuovaImmagine.trim()) return;
    setForm({ ...form, immagini: [...(form.immagini ?? []), nuovaImmagine.trim()] });
    setNuovaImmagine('');
  }
  function rimuoviImmagine(idx: number) {
    setForm({ ...form, immagini: (form.immagini ?? []).filter((_, i) => i !== idx) });
  }

  async function salva() {
    if (!infoCompleta()) {
      alert('Compila almeno artista, genere, luogo, città e data.');
      return;
    }
    if (numeroTragitti === 0) {
      alert('Aggiungi almeno un tragitto prima di salvare.');
      setStep(2);
      return;
    }
    if (modalitaServizi === 'multiplo' && servizi.length < 2) {
      alert('Hai scelto "Più servizi" ma ne hai creato solo uno — aggiungine almeno un secondo, oppure torna su "Un solo servizio".');
      setStep(2);
      return;
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
    for (let i = 0; i < (form.tragitti ?? []).length; i++) {
      const tragitto = (form.tragitti ?? [])[i];
      if (!tragitto.nome.trim()) continue; // tratte vuote (mai compilate) vengono comunque scartate al salvataggio
      const fermataSenzaOrario = tragitto.fermate.find((f) => f.citta.trim() && !f.orario?.trim());
      if (fermataSenzaOrario) {
        alert(`Manca l'orario per la fermata "${fermataSenzaOrario.citta}" nel tragitto "${tragitto.nome}" — è un campo obbligatorio, come tutti gli altri.`);
        setStep(2);
        setTragittiAperti((prev) => new Set(prev).add(i));
        return;
      }
    }
    if (numeroImmagini === 0) {
      alert('Carica almeno un\'immagine prima di salvare.');
      setStep(3);
      setSubTabImmagini('immagini');
      return;
    }
    const tratteValide = (form.tragitti ?? [])
      .filter((l) => l.nome.trim())
      .map((l) => ({ ...l, fermate: l.fermate.filter((f) => f.citta.trim() && f.indirizzo.trim()) }));
    const payload = {
      ...form,
      // Solo i tragitti liberi restano qui — quelli dentro un servizio
      // vanno annidati sotto il loro servizio, il server li aspetta lì.
      tragitti: tratteValide.filter((l) => !l.servizioId),
      servizi: servizi.map((v) => ({
        id: v.id, // assente = servizio nuovo, non ancora salvato
        nome: v.nome,
        arrivoIndirizzo: v.arrivoIndirizzo,
        arrivoOrario: v.arrivoOrario,
        tragitti: tratteValide.filter((l) => l.servizioId === v.key).map((l) => ({ ...l, servizioId: undefined })),
      })),
    };
    try {
      if (evento) {
        // Se si tratta di una bozza ripresa e completata da qui, la
        // "confermo" col salvataggio normale — altrimenti resterebbe
        // segnata come bozza per sempre, anche dopo averla finita.
        await eventiApi.update(evento.id, { ...payload, bozza: false });
      } else if (bozzaIdRef.current) {
        // C'era già una bozza salvata in automatico: la aggiorno e la
        // "confermo" (bozza:false), invece di crearne una seconda.
        await eventiApi.update(bozzaIdRef.current, { ...payload, bozza: false });
      } else {
        await eventiApi.create({ ...payload, bozza: false });
      }
      localStorage.removeItem('inbus_bozza_evento_id');
      onSalvato();
      onClose();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server. Controlla che il backend sia acceso.');
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
            <label>Artista <input value={form.artista} onChange={(e) => setForm({ ...form, artista: e.target.value })} /></label>
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
            <label>Luogo <input value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} /></label>
            <label>Città <input value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
            <label>Data <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
            <label>Indirizzo pubblico (facoltativo — se lo lasci vuoto, si genera da solo)
              <input
                value={form.slug ?? ''}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder={`es. ${(form.artista || 'nome-evento').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(form.citta || 'citta').toLowerCase()}`}
              />
            </label>
            <label>Acconto (€)
              <CampoNumero valuta min={1} value={form.accontoEur} onChange={(v) => setForm({ ...form, accontoEur: v ?? 0 })} />
            </label>
            <label>Avviso disponibilità (mostrato ai clienti al posto dei posti reali)
              <select
                value={form.statoDisponibilita ?? ''}
                onChange={(e) => setForm({ ...form, statoDisponibilita: (e.target.value || null) as typeof form.statoDisponibilita })}
              >
                <option value="">Automatico (calcolato dai posti veri)</option>
                <option value="POCHI_POSTI">Pochi posti disponibili</option>
                <option value="NUOVI_POSTI">Nuovi posti disponibili</option>
                <option value="ESAURITO">Posti terminati</option>
              </select>
              <p className="testo-intro" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                Lasciandolo su "Automatico", il sito mostra da solo "Pochi posti" (sotto il 20% rimasto) o "Posti
                terminati" quando serve, senza che tu debba pensarci — scegli una delle altre opzioni solo se vuoi
                forzarla tu (es. per una promozione), a prescindere dai numeri reali.
              </p>
            </label>
          </div>
          {evento && (
            <p className="testo-intro" style={{ marginTop: -8, fontSize: 12.5 }}>
              Pagina pubblica: <code style={{ color: 'var(--paper)' }}>{window.location.origin}/eventi/{evento.slug}</code>
            </p>
          )}
          <p className="testo-intro" style={{ marginTop: -8, fontSize: 12.5 }}>
            I prezzi si impostano per fermata nello step "Tragitti" (arrivano dai percorsi che applichi). Chi prenota con
            acconto salda il resto entro 15 giorni prima della partenza. L'avviso disponibilità è solo un'etichetta
            (per creare urgenza o scarsità): non blocca davvero le prenotazioni, quello dipende dai posti reali.
          </p>
          <div className="campo">
            <label><input type="checkbox" checked={form.inEvidenza ?? false} onChange={(e) => setForm({ ...form, inEvidenza: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> In evidenza in homepage</label>
          </div>
          <div className="campo">
            <label><input type="checkbox" checked={form.visibileSito ?? true} onChange={(e) => setForm({ ...form, visibileSito: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> Visibile sul sito</label>
            <p className="testo-intro" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
              Se lo disattivi, l'evento non compare mai sul sito (anche se è nel futuro). Gli eventi con data già
              passata comunque non compaiono più sul sito, a prescindere da questo interruttore.
            </p>
          </div>
        </>
      )}

      {subTabInfo === 'descrizione' && (
        <>
          <div className="campo">
            <label>Informazioni viaggio per i clienti (mostrate sulla pagina dell'evento, sotto la foto)</label>
            <textarea
              value={form.descrizione ?? ''}
              onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
              rows={5}
              placeholder="Es. orario e punto di ritrovo, cosa portare, regole del bus, contatti in caso di emergenza..."
            />
          </div>
          <div className="campo">
            <label>Descrizione evento (visibile ai clienti sulla pagina, e usata anche per Google/social)</label>
            <textarea
              value={form.descrizioneSeo ?? ''}
              onChange={(e) => setForm({ ...form, descrizioneSeo: e.target.value })}
              rows={4}
              placeholder="Un testo descrittivo sull'evento/artista — se la lasci vuota, per Google viene generata automaticamente (artista, data, città, prezzo), ma sulla pagina non comparirà nessuna sezione."
            />
            <p className="testo-intro" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
              Diversa dalle "Informazioni viaggio" sopra: questa è un testo più discorsivo su evento/artista (utile
              anche per farsi trovare meglio su Google), quella sopra è pratica (ritrovo, regole del bus, ecc.).
            </p>
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
      {modalitaServizi === null ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <div className="section-card" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '40px 32px' }}>
            <p className="section-label" style={{ marginBottom: 18, fontSize: 15 }}>Quanti servizi ha questo evento?</p>
            <div className="mini-tabs" style={{ justifyContent: 'center' }}>
              <button type="button" className="mini-tab" style={{ padding: '14px 28px', fontSize: 14 }} onClick={() => setModalitaServizi('singolo')}>
                Un solo servizio
              </button>
              <button type="button" className="mini-tab" style={{ padding: '14px 28px', fontSize: 14 }} onClick={passaAMultiplo}>
                Più servizi
              </button>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Nessuna domanda "quanti servizi" qui — l'hai già scelto una
          volta sola nel pannello iniziale, non torna più indietro
          (specialmente per "Più servizi": non ha senso poter tornare a
          un solo servizio quando ne hai già più di uno configurati).
          Solo "Un solo servizio", appena l'evento esiste davvero,
          mostra la minima voce per passare a più servizi se serve. */}
      {modalitaServizi === 'singolo' && evento && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5, marginBottom: 16, borderRadius: 999 }} onClick={passaAMultiplo}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                      <input
                        placeholder="Nome servizio"
                        defaultValue={servizioCorrente.nome}
                        onBlur={(e) => rinominaServizio(servizioCorrente.key, e.target.value)}
                        autoFocus
                      />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setRinominaServizioAperto(false)}>✓ Fatto</button>
                      <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12 }} onClick={() => eliminaServizioConferma(servizioCorrente.key, servizioCorrente.nome || 'senza nome')}>Elimina</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13 }}>
                      <span>{servizioCorrente.nome}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setRinominaServizioAperto(true)}>Rinomina</button>
                        <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12 }} onClick={() => eliminaServizioConferma(servizioCorrente.key, servizioCorrente.nome)}>Elimina servizio</button>
                      </div>
                    </div>
                  )}

                  {/* L'arrivo (indirizzo + orario) è tutto suo, non
                      condiviso con gli altri servizi — ognuno può
                      arrivare in un posto e a un orario diversi. */}
                  <div style={{ background: 'var(--night)', border: '1px solid var(--pink-dim)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 9.5, fontFamily: "'Space Mono',monospace", textTransform: 'uppercase', letterSpacing: 1, color: 'var(--pink)', marginBottom: 6 }}>
                      Arrivo di "{servizioCorrente.nome}"
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr .4fr', gap: 8 }}>
                      <input
                        placeholder="Indirizzo di arrivo"
                        value={servizioCorrente.arrivoIndirizzo ?? ''}
                        onChange={(e) => aggiornaArrivoServizio(servizioCorrente.key, 'arrivoIndirizzo', e.target.value)}
                      />
                      <OrarioInput
                        value={servizioCorrente.arrivoOrario ?? ''}
                        onChange={(v) => aggiornaArrivoServizio(servizioCorrente.key, 'arrivoOrario', v)}
                        placeholder="Orario"
                      />
                    </div>
                  </div>
                </>
              );
            })()}
        </div>
      )}

      {modalitaServizi === 'singolo' && (
        <div className="section-card" style={{ marginBottom: 16, border: '1px solid var(--pink-dim)' }}>
          <p style={{ fontSize: 9.5, fontFamily: "'Space Mono',monospace", textTransform: 'uppercase', letterSpacing: 1, color: 'var(--pink)', marginBottom: 6 }}>
            Arrivo (destinazione) — vale per tutte le tratte di questo evento
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr .4fr', gap: 8 }}>
            <input placeholder="Indirizzo di arrivo" value={form.arrivoIndirizzo ?? ''} onChange={(e) => setForm({ ...form, arrivoIndirizzo: e.target.value })} />
            <OrarioInput value={form.arrivoOrario ?? ''} onChange={(v) => setForm({ ...form, arrivoOrario: v })} placeholder="Orario" />
          </div>
        </div>
      )}

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
      {percorsiSalvati.length > 0 && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Aggiungi un tragitto da un percorso salvato</p>
          <select
            value=""
            onChange={(e) => {
              const t = percorsiSalvati.find((x) => x.id === e.target.value);
              // Un percorso può essere riusato su servizi diversi (es.
              // Milano-Roma sia sul servizio delle 14:00 sia su quello
              // delle 18:00) — non può essere doppio solo dentro lo
              // STESSO servizio.
              const contesto = servizioIdContestoAttuale();
              const giaUsatoQui = (form.tragitti ?? []).some((l) => l.nome === t?.nome && (l.servizioId ?? null) === contesto);
              if (t && !giaUsatoQui) aggiungiTragittoDaPercorso(t);
            }}
          >
            <option value="">Scegli un tragitto...</option>
            {percorsiSalvati.map((t) => {
              const contesto = servizioIdContestoAttuale();
              const giaUsatoQui = (form.tragitti ?? []).some((l) => l.nome === t.nome && (l.servizioId ?? null) === contesto);
              return <option key={t.id} value={t.id} disabled={giaUsatoQui}>{t.nome}{giaUsatoQui ? ' (già aggiunto a questo servizio)' : ''}</option>;
            })}
          </select>
        </div>
      )}

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
        return (
        <div key={idxTragitto} className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={() => toggleTragittoAperto(idxTragitto)}>
              <span style={{ color: 'var(--mist)', fontSize: 13 }}>{espansa ? '▾' : '▸'}</span>
              <div style={{ flex: 1 }}>
                <b>{tragitto.nome || 'Tragitto senza nome'}</b>
                {!espansa && (
                  <p className="section-sub" style={{ margin: '2px 0 0' }}>
                    {tragitto.fermate.length} fermat{tragitto.fermate.length === 1 ? 'a' : 'e'}
                    {tragitto.fermate.some((f) => f.citta) && ` — ${tragitto.fermate.filter((f) => f.citta).map((f) => `${f.citta}${f.orario ? ` (${f.orario})` : ''}`).join(', ')}`}
                  </p>
                )}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12.5, flexShrink: 0 }} onClick={() => rimuoviTragitto(idxTragitto)}>Rimuovi tragitto</button>
          </div>

          {espansa && (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr .6fr', gap: 8, marginBottom: 10 }}>
            <input placeholder="Nome tragitto" value={tragitto.nome} onChange={(e) => aggiornaTragitto(idxTragitto, 'nome', e.target.value)} />
            <CampoNumero placeholder="Posti totali" value={tragitto.postiTotali} onChange={(v) => aggiornaTragitto(idxTragitto, 'postiTotali', v ?? 0)} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              placeholder="es. +10 o -5"
              type="number"
              style={{ maxWidth: 130 }}
              value={aggiustiPerTragitto[idxTragitto] ?? ''}
              onChange={(e) => setAggiustiPerTratta((s) => ({ ...s, [idxTragitto]: e.target.value }))}
            />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiustaPrezziTragitto(idxTragitto)}>
              Applica € a tutte le fermate
            </button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => ricalcolaOrariTragitto(idxTragitto)} disabled={ricalcolando[idxTragitto]}>
              {ricalcolando[idxTragitto] ? 'Calcolo orari...' : '↻ Calcola orari dall\'arrivo'}
            </button>
          </div>
          {statoRicalcolo[idxTragitto] && <p className="testo-intro" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>{statoRicalcolo[idxTragitto]}</p>}

          <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 6 }}>Trascina una fermata per riordinarla. Ognuna ha un prezzo — l'arrivo si imposta qui sopra, separatamente.</p>
          {tragitto.fermate.map((f, idxFermata) => (
            <div
              key={idxFermata}
              draggable
              onDragStart={() => onDragStart(idxTragitto, idxFermata)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropSu(idxTragitto, idxFermata)}
              style={{
                display: 'grid', gridTemplateColumns: '16px 1fr 1.3fr .55fr .55fr .55fr auto', gap: 6, marginBottom: 6, alignItems: 'center',
                opacity: trascinata?.tragitto === idxTragitto && trascinata.fermata === idxFermata ? 0.4 : 1, cursor: 'grab',
              }}
            >
              <span style={{ color: 'var(--mist)', fontSize: 14, textAlign: 'center' }} title="Trascina per riordinare">⠿</span>
              <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idxTragitto, idxFermata, 'citta', e.target.value)} />
              <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idxTragitto, idxFermata, 'indirizzo', e.target.value)} />
              <OrarioInput value={f.orario ?? ''} onChange={(v) => aggiornaFermata(idxTragitto, idxFermata, 'orario', v)} />
              <CampoNumero
                valuta placeholder="Prezzo"
                value={f.prezzo}
                onChange={(v) => aggiornaFermata(idxTragitto, idxFermata, 'prezzo', v !== undefined ? String(v) : '')}
              />
              <CampoNumero
                placeholder="Posti max"
                title="Facoltativo: limite posti solo per questa fermata. Se vuoto, condivide i posti di tutto il bus."
                value={f.postiMax ?? undefined}
                onChange={(v) => aggiornaFermata(idxTragitto, idxFermata, 'postiMax', v !== undefined ? String(v) : '')}
              />
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', padding: '4px 8px' }} onClick={() => rimuoviFermata(idxTragitto, idxFermata)} title="Rimuovi fermata">✕</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiungiFermata(idxTragitto)}>+ Aggiungi fermata</button>
          <p className="testo-intro" style={{ fontSize: 11.5, marginTop: 6 }}>
            "Posti max" è facoltativo: mettilo solo se vuoi limitare quante persone possono salire da quella
            città specifica, indipendentemente dai posti liberi sul resto del bus.
          </p>
          </>
          )}
        </div>
      );})}
      <button className="btn btn-ghost" style={{ marginBottom: 6 }} onClick={aggiungiTragittoManuale}>+ Aggiungi tragitto manuale (senza percorso salvato)</button>
      </>
      )}
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
          <p className="testo-intro">Carica un'immagine, oppure incolla il link se è già online da qualche parte — vengono mostrate nella galleria della pagina evento sul sito.</p>
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
          <p className="testo-intro" style={{ fontSize: 12, marginBottom: 14 }}>
            Grafica del biglietto digitale — facoltativa, se non la imposti il PDF (con QR) usa l'aspetto di base.
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
            <label>Immagine di intestazione (facoltativa)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="https://... (o carica un file)"
                value={form.ticketImmagineSfondoUrl ?? ''}
                onChange={(e) => setForm({ ...form, ticketImmagineSfondoUrl: e.target.value || undefined })}
                style={{ flex: 1 }}
              />
              <CaricaFile onCaricato={(url) => setForm({ ...form, ticketImmagineSfondoUrl: url })} etichetta="Carica" />
            </div>
            <p className="testo-intro" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
              Compare come fascia in cima al biglietto (larga quanto la pagina, ritagliata automaticamente).
            </p>
          </div>
          <div className="campo">
            <label>Layout del biglietto</label>
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
            <p className="testo-intro" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
              Composizione grafica del PDF (ordine sezioni, posizione QR) — si gestiscono da Marketing → Layout
              biglietto.
            </p>
          </div>
        </>
      )}
    </>
  );

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
      ? { dettagli: 'Modifica evento', partenze: 'Partenze', 'lista-attesa': "Lista d'attesa", offerte: 'Offerte' }[tabIniziale]
      : 'Modifica evento';
    return (
      <PaginaSezione titolo={`${titoloTab} — ${evento.artista}`} onIndietro={onClose} richiediConferma={() => chiediConferma(onClose)} larga={tabAttiva === 'partenze'}>
        {!soloQuestaTab && (
          <div className="mini-tabs">
            <button type="button" className={`mini-tab${tabAttiva === 'dettagli' ? ' active' : ''}`} onClick={() => setTabAttiva('dettagli')}>Dettagli</button>
            <button type="button" className={`mini-tab${tabAttiva === 'partenze' ? ' active' : ''}`} onClick={() => setTabAttiva('partenze')}>Partenze</button>
            <button type="button" className={`mini-tab${tabAttiva === 'lista-attesa' ? ' active' : ''}`} onClick={() => setTabAttiva('lista-attesa')}>Lista d'attesa</button>
            <button type="button" className={`mini-tab${tabAttiva === 'offerte' ? ' active' : ''}`} onClick={() => setTabAttiva('offerte')}>Offerte</button>
          </div>
        )}

        {tabAttiva === 'partenze' && <PartenzeTab eventoId={evento.id} servizi={servizi.map((v) => ({ key: v.id ?? v.key, nome: v.nome }))} />}
        {tabAttiva === 'lista-attesa' && <ListaAttesaTab eventoId={evento.id} />}
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
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 18 }} onClick={salva}>Salva modifica</button>
          </>
        )}
      </PaginaSezione>
    );
  }

  // ---- Vista CREAZIONE (nuovo evento): wizard a step ----

  return (
    <PaginaSezione titolo="Nuovo evento" onIndietro={onClose} richiediConferma={() => chiediConferma(onClose)}>
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
          <p className="section-label">Tragitti (facoltativi — puoi aggiungerli anche dopo)</p>
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
          <button className="btn btn-primary" onClick={salva}>Crea evento</button>
        )}
      </div>
    </PaginaSezione>
  );
}
