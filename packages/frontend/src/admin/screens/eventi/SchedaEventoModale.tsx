import { useEffect, useState, type ReactNode } from 'react';
import { eventiApi, type EventoInput, type LineaInput, type FermataInput } from '../../../api/eventi';
import { tragittiApi, type Tragitto } from '../../../api/tragitti';
import { categorieApi, type Categoria } from '../../../api/categorie';
import { ErroreApi } from '../../../api/client';
import type { Evento } from '../../../api/types';
import { PaginaSezione } from '../../shared/PaginaSezione';
import { OrarioInput } from '../../shared/OrarioInput';
import { useAvvisoModificheNonSalvate } from '../../shared/useAvvisoModificheNonSalvate';
import { PartenzeTab } from '../partenze/PartenzeTab';
import { ListaAttesaTab } from './ListaAttesaTab';
import { OfferteTab } from './OfferteTab';
import { geocodifica, durataViaggio, attesa } from '../../shared/geo';

const VUOTO: EventoInput = { artista: '', genere: '', luogo: '', citta: '', data: '', inEvidenza: false, accontoEur: 10, immagini: [], linee: [] };

const STEP_WIZARD = [
  { numero: 1, label: 'Info evento' },
  { numero: 2, label: 'Tratte' },
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
  const [tragitti, setTragitti] = useState<Tragitto[]>([]);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [form, setForm] = useState<EventoInput>(VUOTO);
  const [tabAttiva, setTabAttiva] = useState<'dettagli' | 'partenze' | 'lista-attesa' | 'offerte'>(tabIniziale);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [aggiustiPerTratta, setAggiustiPerTratta] = useState<Record<number, string>>({});
  const [nuovaImmagine, setNuovaImmagine] = useState('');
  const [trascinata, setTrascinata] = useState<{ linea: number; fermata: number } | null>(null);
  const [statoRicalcolo, setStatoRicalcolo] = useState<Record<number, string>>({});
  const [ricalcolando, setRicalcolando] = useState<Record<number, boolean>>({});
  const [formIniziale, setFormIniziale] = useState('');

  function ricaricaCategorie() {
    categorieApi.list().then(setCategorie);
  }

  useEffect(() => {
    tragittiApi.list().then(setTragitti);
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
        immagini: [...evento.immagini].sort((a, b) => a.ordine - b.ordine).map((i) => i.url),
        linee: evento.linee.map((l) => ({
          id: l.id,
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
    setFormIniziale(JSON.stringify(nuovoForm));
    setAggiustiPerTratta({});
    setStatoRicalcolo({});
    setTabAttiva(tabIniziale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento?.id]);

  function aggiornaLinea(idx: number, campo: keyof LineaInput, valore: string | number) {
    const linee = [...(form.linee ?? [])];
    linee[idx] = { ...linee[idx], [campo]: valore };
    setForm({ ...form, linee });
  }
  function aggiungiFermata(idxLinea: number) {
    const linee = [...(form.linee ?? [])];
    const fermate = [...linee[idxLinea].fermate, { citta: '', indirizzo: '' } as FermataInput];
    linee[idxLinea] = { ...linee[idxLinea], fermate };
    setForm({ ...form, linee });
  }
  function aggiornaFermata(idxLinea: number, idxFermata: number, campo: keyof FermataInput, valore: string) {
    const linee = [...(form.linee ?? [])];
    const fermate = [...linee[idxLinea].fermate];
    fermate[idxFermata] = { ...fermate[idxFermata], [campo]: (campo === 'prezzo' || campo === 'postiMax') ? (Number(valore) || undefined) : valore };
    linee[idxLinea] = { ...linee[idxLinea], fermate };
    setForm({ ...form, linee });
  }
  function rimuoviFermata(idxLinea: number, idxFermata: number) {
    const linee = [...(form.linee ?? [])];
    const fermate = linee[idxLinea].fermate.filter((_, i) => i !== idxFermata);
    linee[idxLinea] = { ...linee[idxLinea], fermate: fermate.length ? fermate : [{ citta: '', indirizzo: '' }] };
    setForm({ ...form, linee });
  }
  function rimuoviLinea(idxLinea: number) {
    const linee = (form.linee ?? []).filter((_, i) => i !== idxLinea);
    setForm({ ...form, linee });
  }

  // ---- Riordino fermate trascinandole (drag & drop nativo, senza librerie) ----
  function onDragStart(idxLinea: number, idxFermata: number) {
    setTrascinata({ linea: idxLinea, fermata: idxFermata });
  }
  function onDropSu(idxLinea: number, idxFermataDestinazione: number) {
    if (!trascinata || trascinata.linea !== idxLinea) { setTrascinata(null); return; }
    const linee = [...(form.linee ?? [])];
    const fermate = [...linee[idxLinea].fermate];
    const [spostata] = fermate.splice(trascinata.fermata, 1);
    fermate.splice(idxFermataDestinazione, 0, spostata);
    linee[idxLinea] = { ...linee[idxLinea], fermate };
    setForm({ ...form, linee });
    setTrascinata(null);
  }

  /** Aggiunge una tratta a partire da un tragitto salvato: nome e fermate
   *  (con prezzo) vengono copiati — da qui in poi sono indipendenti,
   *  modificabili liberamente senza toccare il tragitto originale. I
   *  tragitti non hanno orari: l'arrivo (unico per tutto l'evento) va
   *  compilato una volta sola nel box qui sopra. */
  function aggiungiTrattaDaTragitto(tragitto: Tragitto) {
    const nuovaLinea: LineaInput = {
      nome: tragitto.nome,
      postiTotali: 50,
      prezzoExtra: 0,
      fermate: tragitto.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, prezzo: f.prezzo ?? undefined })),
    };
    setForm({ ...form, linee: [...(form.linee ?? []), nuovaLinea] });
  }
  function aggiungiTrattaManuale() {
    setForm({ ...form, linee: [...(form.linee ?? []), { nome: '', postiTotali: 50, prezzoExtra: 0, fermate: [{ citta: '', indirizzo: '' }] }] });
  }

  /** Applica +/- € a tutte le fermate con un prezzo già impostato di
   *  questa tratta (es. +10 aggiunge 10€ ovunque, -5 toglie 5€, mai sotto
   *  zero). Le fermate senza prezzo proprio non vengono toccate. */
  function aggiustaPrezziTratta(idxLinea: number) {
    const delta = Number(aggiustiPerTratta[idxLinea]);
    if (!delta) return;
    const linee = [...(form.linee ?? [])];
    linee[idxLinea] = {
      ...linee[idxLinea],
      fermate: linee[idxLinea].fermate.map((f) => (
        f.prezzo !== undefined ? { ...f, prezzo: Math.max(0, Number((f.prezzo + delta).toFixed(2))) } : f
      )),
    };
    setForm({ ...form, linee });
    setAggiustiPerTratta((s) => ({ ...s, [idxLinea]: '' }));
  }

  /** Ricalcola gli orari di una tratta a ritroso dall'orario di arrivo
   *  (ultima fermata), usando le distanze reali tra gli indirizzi via
   *  Nominatim + OSRM (gratuiti) — stessa logica già usata per i tragitti. */
  /** Ricalcola gli orari di una tratta a ritroso dall'ARRIVO (campo
   *  separato della tratta, non più l'ultima fermata), usando le distanze
   *  reali tra gli indirizzi via Nominatim + OSRM (gratuiti). Tutte le
   *  fermate ricevono un orario calcolato — nessuna è "l'arrivo". */
  async function ricalcolaOrariTratta(idxLinea: number) {
    const linea = (form.linee ?? [])[idxLinea];
    if (!linea) return;
    const fermateValide = linea.fermate.filter((f) => f.indirizzo.trim());
    if (fermateValide.length === 0) { setStatoRicalcolo((s) => ({ ...s, [idxLinea]: 'Aggiungi almeno una fermata con indirizzo compilato.' })); return; }
    if (!form.arrivoIndirizzo?.trim()) { setStatoRicalcolo((s) => ({ ...s, [idxLinea]: "Inserisci prima l'indirizzo di arrivo qui sopra (vale per tutte le tratte)." })); return; }
    if (!form.arrivoOrario) { setStatoRicalcolo((s) => ({ ...s, [idxLinea]: "Inserisci prima l'orario di arrivo qui sopra." })); return; }

    setRicalcolando((s) => ({ ...s, [idxLinea]: true }));
    setStatoRicalcolo((s) => ({ ...s, [idxLinea]: 'Localizzo gli indirizzi...' }));

    // La sequenza da geolocalizzare è: fermate in ordine, poi l'arrivo per
    // ultimo — il viaggio finisce sempre lì.
    const indirizziCompleti = [...fermateValide.map((f) => `${f.indirizzo}, ${f.citta}`), form.arrivoIndirizzo];
    const coordinate: (Awaited<ReturnType<typeof geocodifica>>['coordinate'])[] = [];
    let problemaRete = false;
    for (const indirizzo of indirizziCompleti) {
      const r = await geocodifica(indirizzo);
      coordinate.push(r.coordinate);
      if (r.erroreRete) problemaRete = true;
      await attesa(1100);
    }

    if (problemaRete) {
      setStatoRicalcolo((s) => ({ ...s, [idxLinea]: 'Richiesta a OpenStreetMap non riuscita (rete/firewall). Apri la Console (F12) per il dettaglio.' }));
      setRicalcolando((s) => ({ ...s, [idxLinea]: false }));
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
    let cursore = Number(form.arrivoOrario.split(':')[0]) * 60 + Number(form.arrivoOrario.split(':')[1]);
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
    const linee = [...(form.linee ?? [])];
    linee[idxLinea] = {
      ...linee[idxLinea],
      fermate: linee[idxLinea].fermate.map((f) => {
        if (!f.indirizzo.trim()) return f;
        const orario = orariCalcolati[idxValida]; idxValida++;
        return orario ? { ...f, orario } : f;
      }),
    };
    setForm({ ...form, linee });

    setStatoRicalcolo((s) => ({ ...s, [idxLinea]: errori ? `Fatto, ma ${errori} indirizzo/i non localizzato/i: controlla a mano.` : 'Orari ricalcolati e applicati.' }));
    setRicalcolando((s) => ({ ...s, [idxLinea]: false }));
  }

  function infoCompleta() {
    return Boolean(form.artista && form.genere && form.luogo && form.citta && form.data);
  }

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
    const payload = {
      ...form,
      linee: (form.linee ?? [])
        .filter((l) => l.nome.trim())
        .map((l) => ({ ...l, fermate: l.fermate.filter((f) => f.citta.trim() && f.indirizzo.trim()) })),
    };
    try {
      if (evento) await eventiApi.update(evento.id, payload);
      else await eventiApi.create(payload);
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
          <input type="number" min={1} value={form.accontoEur ?? 10} onChange={(e) => setForm({ ...form, accontoEur: Number(e.target.value) })} />
        </label>
        <label>Avviso disponibilità (mostrato ai clienti al posto dei posti reali)
          <select
            value={form.statoDisponibilita ?? ''}
            onChange={(e) => setForm({ ...form, statoDisponibilita: (e.target.value || null) as typeof form.statoDisponibilita })}
          >
            <option value="">Nessuno (normale)</option>
            <option value="POCHI_POSTI">Pochi posti disponibili</option>
            <option value="NUOVI_POSTI">Nuovi posti disponibili</option>
            <option value="ESAURITO">Posti terminati</option>
          </select>
        </label>
      </div>
      {evento && (
        <p className="testo-intro" style={{ marginTop: -8, fontSize: 12.5 }}>
          Pagina pubblica: <code style={{ color: 'var(--paper)' }}>{window.location.origin}/eventi/{evento.slug}</code>
        </p>
      )}
      <p className="testo-intro" style={{ marginTop: -8, fontSize: 12.5 }}>
        I prezzi si impostano per fermata nello step "Tratte" (arrivano dai tragitti che applichi). Chi prenota con
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
      <div className="campo">
        <label>Informazioni per i clienti (mostrate sulla pagina dell'evento, sotto la foto)</label>
        <textarea
          value={form.descrizione ?? ''}
          onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
          rows={5}
          placeholder="Es. orario e punto di ritrovo, cosa portare, regole del bus, contatti in caso di emergenza..."
        />
      </div>
    </>
  );

  const campiTratte: ReactNode = (
    <>
      <div className="section-card" style={{ marginBottom: 16, border: '1px solid var(--pink-dim)' }}>
        <p style={{ fontSize: 9.5, fontFamily: "'Space Mono',monospace", textTransform: 'uppercase', letterSpacing: 1, color: 'var(--pink)', marginBottom: 6 }}>Arrivo (destinazione) — vale per tutte le tratte di questo evento</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr .4fr', gap: 8 }}>
          <input placeholder="Indirizzo di arrivo" value={form.arrivoIndirizzo ?? ''} onChange={(e) => setForm({ ...form, arrivoIndirizzo: e.target.value })} />
          <OrarioInput value={form.arrivoOrario ?? ''} onChange={(v) => setForm({ ...form, arrivoOrario: v })} placeholder="Orario" />
        </div>
      </div>

      {tragitti.length > 0 && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Aggiungi una tratta da un tragitto salvato</p>
          <select
            value=""
            onChange={(e) => {
              const t = tragitti.find((x) => x.id === e.target.value);
              if (t) aggiungiTrattaDaTragitto(t);
            }}
          >
            <option value="">Scegli un tragitto...</option>
            {tragitti.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
      )}

      {(form.linee ?? []).map((linea, idxLinea) => (
        <div key={idxLinea} className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr .6fr', gap: 8, flex: 1 }}>
              <input placeholder="Nome tratta" value={linea.nome} onChange={(e) => aggiornaLinea(idxLinea, 'nome', e.target.value)} />
              <input placeholder="Posti totali" type="number" value={linea.postiTotali} onChange={(e) => aggiornaLinea(idxLinea, 'postiTotali', Number(e.target.value))} />
            </div>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12.5 }} onClick={() => rimuoviLinea(idxLinea)}>Rimuovi tratta</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              placeholder="es. +10 o -5"
              type="number"
              style={{ maxWidth: 130 }}
              value={aggiustiPerTratta[idxLinea] ?? ''}
              onChange={(e) => setAggiustiPerTratta((s) => ({ ...s, [idxLinea]: e.target.value }))}
            />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiustaPrezziTratta(idxLinea)}>
              Applica € a tutte le fermate
            </button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => ricalcolaOrariTratta(idxLinea)} disabled={ricalcolando[idxLinea]}>
              {ricalcolando[idxLinea] ? 'Calcolo orari...' : '↻ Calcola orari dall\'arrivo'}
            </button>
          </div>
          {statoRicalcolo[idxLinea] && <p className="testo-intro" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>{statoRicalcolo[idxLinea]}</p>}

          <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 6 }}>Trascina una fermata per riordinarla. Ognuna ha un prezzo — l'arrivo si imposta qui sopra, separatamente.</p>
          {linea.fermate.map((f, idxFermata) => (
            <div
              key={idxFermata}
              draggable
              onDragStart={() => onDragStart(idxLinea, idxFermata)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropSu(idxLinea, idxFermata)}
              style={{
                display: 'grid', gridTemplateColumns: '16px 1fr 1.3fr .55fr .55fr .55fr auto', gap: 6, marginBottom: 6, alignItems: 'center',
                opacity: trascinata?.linea === idxLinea && trascinata.fermata === idxFermata ? 0.4 : 1, cursor: 'grab',
              }}
            >
              <span style={{ color: 'var(--mist)', fontSize: 14, textAlign: 'center' }} title="Trascina per riordinare">⠿</span>
              <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'citta', e.target.value)} />
              <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'indirizzo', e.target.value)} />
              <OrarioInput value={f.orario ?? ''} onChange={(v) => aggiornaFermata(idxLinea, idxFermata, 'orario', v)} />
              <input placeholder="Prezzo € *" type="number" value={f.prezzo ?? ''} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'prezzo', e.target.value)} />
              <input placeholder="Posti max" title="Facoltativo: limite posti solo per questa fermata. Se vuoto, condivide i posti di tutto il bus." type="number" value={f.postiMax ?? ''} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'postiMax', e.target.value)} />
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', padding: '4px 8px' }} onClick={() => rimuoviFermata(idxLinea, idxFermata)} title="Rimuovi fermata">✕</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiungiFermata(idxLinea)}>+ Aggiungi fermata</button>
          <p className="testo-intro" style={{ fontSize: 11.5, marginTop: 6 }}>
            "Posti max" è facoltativo: mettilo solo se vuoi limitare quante persone possono salire da quella
            città specifica, indipendentemente dai posti liberi sul resto del bus.
          </p>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ marginBottom: 6 }} onClick={aggiungiTrattaManuale}>+ Aggiungi tratta manuale (senza tragitto salvato)</button>
    </>
  );

  const campiImmagini: ReactNode = (
    <>
      <p className="testo-intro">Aggiungi gli indirizzi (URL) delle immagini dell'evento — vengono mostrate nella galleria della pagina evento sul sito.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input placeholder="https://..." value={nuovaImmagine} onChange={(e) => setNuovaImmagine(e.target.value)} style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={aggiungiImmagine}>+ Aggiungi</button>
      </div>
      {(form.immagini ?? []).map((url, idx) => (
        <div key={idx} className="riga-cliccabile" style={{ cursor: 'default' }}>
          <span className="riga-titolo" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>{url}</span>
          <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12 }} onClick={() => rimuoviImmagine(idx)}>Rimuovi</button>
        </div>
      ))}
      {(form.immagini ?? []).length === 0 && <p className="testo-intro" style={{ fontSize: 13 }}>Nessuna immagine ancora.</p>}
    </>
  );

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

        {tabAttiva === 'partenze' && <PartenzeTab eventoId={evento.id} />}
        {tabAttiva === 'lista-attesa' && <ListaAttesaTab eventoId={evento.id} />}
        {tabAttiva === 'offerte' && <OfferteTab eventoId={evento.id} nomeEvento={evento.artista} />}
        {tabAttiva === 'dettagli' && (
          <>
            {/* eslint-disable-next-line */}
            {campiInfoEvento}
            <p className="section-label" style={{ marginTop: 18 }}>Tratte</p>
            {campiTratte}
            <p className="section-label" style={{ marginTop: 18 }}>Immagini</p>
            {campiImmagini}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={salva}>Salva evento</button>
          </>
        )}
      </PaginaSezione>
    );
  }

  // ---- Vista CREAZIONE (nuovo evento): wizard a step ----

  const numeroTratte = (form.linee ?? []).filter((l) => l.nome.trim()).length;

  return (
    <PaginaSezione titolo="Nuovo evento" onIndietro={onClose} richiediConferma={() => chiediConferma(onClose)}>
      <div className="wizard-stepper">
        {STEP_WIZARD.map((s) => (
          <div key={s.numero} className={`wizard-dot${step === s.numero ? ' active' : step > s.numero ? ' completato' : ''}`}>
            <span>{step > s.numero ? '✓' : s.numero}</span> {s.label}
          </div>
        ))}
      </div>

      {step === 1 && campiInfoEvento}

      {step === 2 && (
        <>
          <p className="section-label">Tratte (facoltative — puoi aggiungerle anche dopo)</p>
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
          <div className="riepilogo-riga-evento"><span>Tratte</span><b>{numeroTratte > 0 ? `${numeroTratte} configurate` : 'Nessuna (aggiungibile dopo)'}</b></div>
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
