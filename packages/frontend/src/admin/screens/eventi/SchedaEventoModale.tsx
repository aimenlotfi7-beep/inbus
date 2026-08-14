import { useEffect, useState, type ReactNode } from 'react';
import { eventiApi, type EventoInput, type LineaInput, type FermataInput } from '../../../api/eventi';
import { tragittiApi, type Tragitto } from '../../../api/tragitti';
import { categorieApi, type Categoria } from '../../../api/categorie';
import { ErroreApi } from '../../../api/client';
import type { Evento } from '../../../api/types';
import { Modale } from '../../shared/Modale';
import { PartenzeTab } from '../partenze/PartenzeTab';

const VUOTO: EventoInput = { artista: '', genere: '', luogo: '', citta: '', data: '', prezzo: 0, inEvidenza: false, accontoEur: 10, immagini: [], linee: [] };

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
 */
export function SchedaEventoModale({
  evento, tabIniziale = 'dettagli', onClose, onSalvato,
}: {
  evento: Evento | null; // null = nuovo evento
  tabIniziale?: 'dettagli' | 'partenze';
  onClose: () => void;
  onSalvato: () => void;
}) {
  const [tragitti, setTragitti] = useState<Tragitto[]>([]);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [form, setForm] = useState<EventoInput>(VUOTO);
  const [tabAttiva, setTabAttiva] = useState<'dettagli' | 'partenze'>(tabIniziale);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [aggiustiPerTratta, setAggiustiPerTratta] = useState<Record<number, string>>({});
  const [nuovaImmagine, setNuovaImmagine] = useState('');

  function ricaricaCategorie() {
    categorieApi.list().then(setCategorie);
  }

  useEffect(() => {
    tragittiApi.list().then(setTragitti);
    ricaricaCategorie();
    if (evento) {
      setForm({
        artista: evento.artista, genere: evento.genere, luogo: evento.luogo, citta: evento.citta,
        data: evento.data.slice(0, 10), prezzo: Number(evento.prezzo), inEvidenza: evento.inEvidenza,
        accontoEur: evento.accontoEur ? Number(evento.accontoEur) : 10,
        immagini: [...evento.immagini].sort((a, b) => a.ordine - b.ordine).map((i) => i.url),
        linee: evento.linee.map((l) => ({
          nome: l.nome, postiTotali: l.postiTotali, prezzoExtra: Number(l.prezzoExtra),
          fermate: l.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario ?? undefined, prezzo: f.prezzo ? Number(f.prezzo) : undefined })),
        })),
      });
    } else {
      setForm(VUOTO);
      setStep(1);
    }
    setAggiustiPerTratta({});
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
    linee[idxLinea] = { ...linee[idxLinea], fermate: [...linee[idxLinea].fermate, { citta: '', indirizzo: '' }] };
    setForm({ ...form, linee });
  }
  function aggiornaFermata(idxLinea: number, idxFermata: number, campo: keyof FermataInput, valore: string) {
    const linee = [...(form.linee ?? [])];
    const fermate = [...linee[idxLinea].fermate];
    fermate[idxFermata] = { ...fermate[idxFermata], [campo]: campo === 'prezzo' ? Number(valore) || undefined : valore };
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

  /** Aggiunge una tratta a partire da un tragitto salvato: nome e fermate
   *  (con il prezzo per fermata già impostato nel tragitto) vengono
   *  copiati — da qui in poi sono indipendenti, modificabili liberamente
   *  senza toccare il tragitto originale. */
  function aggiungiTrattaDaTragitto(tragitto: Tragitto) {
    const nuovaLinea: LineaInput = {
      nome: tragitto.nome,
      postiTotali: 50,
      prezzoExtra: 0,
      fermate: tragitto.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario, prezzo: f.prezzo })),
    };
    setForm({ ...form, linee: [...(form.linee ?? []), nuovaLinea] });
  }
  function trattaGiaAggiunta(tragitto: Tragitto) {
    return (form.linee ?? []).some((l) => l.nome === tragitto.nome);
  }
  function rimuoviTrattaPerNome(nome: string) {
    setForm({ ...form, linee: (form.linee ?? []).filter((l) => l.nome !== nome) });
  }

  function aggiungiTrattaManuale() {
    setForm({ ...form, linee: [...(form.linee ?? []), { nome: '', postiTotali: 50, prezzoExtra: 0, fermate: [{ citta: '', indirizzo: '' }] }] });
  }

  /** Applica +/- € a tutte le fermate con un prezzo già impostato di
   *  questa tratta (es. +10 aggiunge 10€ ovunque, -5 toglie 5€, mai sotto
   *  zero). Le fermate senza prezzo proprio non vengono toccate: usano
   *  comunque il prezzo base evento + eventuale prezzoExtra della tratta. */
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

  function infoCompleta() {
    return Boolean(form.artista && form.genere && form.luogo && form.citta && form.data && form.prezzo);
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
      alert('Compila almeno artista, genere, luogo, città, data e prezzo.');
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
        <label>Prezzo base (€) <input type="number" value={form.prezzo} onChange={(e) => setForm({ ...form, prezzo: Number(e.target.value) })} /></label>
        <label>Acconto (€)
          <input type="number" min={1} value={form.accontoEur ?? 10} onChange={(e) => setForm({ ...form, accontoEur: Number(e.target.value) })} />
        </label>
      </div>
      <p className="testo-intro" style={{ marginTop: -8, fontSize: 12.5 }}>
        Chi prenota con acconto salda il resto entro 15 giorni prima della partenza.
      </p>
      <div className="campo">
        <label><input type="checkbox" checked={form.inEvidenza ?? false} onChange={(e) => setForm({ ...form, inEvidenza: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> In evidenza in homepage</label>
      </div>
    </>
  );

  const campiTratte: ReactNode = (
    <>
      {tragitti.length > 0 && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Tragitti salvati — clicca per aggiungerli come tratta</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tragitti.map((t) => {
              const aggiunta = trattaGiaAggiunta(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`badge badge-btn ${aggiunta ? 'coperta' : 'dal-ruolo'}`}
                  onClick={() => (aggiunta ? rimuoviTrattaPerNome(t.nome) : aggiungiTrattaDaTragitto(t))}
                >
                  {aggiunta ? '✓ ' : '+ '}{t.nome}
                </button>
              );
            })}
          </div>
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

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              placeholder="es. +10 o -5"
              type="number"
              style={{ maxWidth: 130 }}
              value={aggiustiPerTratta[idxLinea] ?? ''}
              onChange={(e) => setAggiustiPerTratta((s) => ({ ...s, [idxLinea]: e.target.value }))}
            />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiustaPrezziTratta(idxLinea)}>
              Applica € a tutte le fermate di questa tratta
            </button>
          </div>

          {linea.fermate.map((f, idxFermata) => (
            <div key={idxFermata} style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr .55fr .55fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'citta', e.target.value)} />
              <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'indirizzo', e.target.value)} />
              <input placeholder="Orario" type="time" value={f.orario ?? ''} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'orario', e.target.value)} />
              <input placeholder="Prezzo €" type="number" value={f.prezzo ?? ''} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'prezzo', e.target.value)} />
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', padding: '4px 8px' }} onClick={() => rimuoviFermata(idxLinea, idxFermata)} title="Rimuovi fermata">✕</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiungiFermata(idxLinea)}>+ Aggiungi fermata</button>
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
    return (
      <Modale titolo="Modifica evento" onClose={onClose} larga={tabAttiva === 'partenze'}>
        <div className="mini-tabs">
          <button type="button" className={`mini-tab${tabAttiva === 'dettagli' ? ' active' : ''}`} onClick={() => setTabAttiva('dettagli')}>Dettagli</button>
          <button type="button" className={`mini-tab${tabAttiva === 'partenze' ? ' active' : ''}`} onClick={() => setTabAttiva('partenze')}>Partenze</button>
        </div>

        {tabAttiva === 'partenze' ? (
          <PartenzeTab eventoId={evento.id} />
        ) : (
          <>
            {campiInfoEvento}
            <p className="section-label" style={{ marginTop: 18 }}>Tratte</p>
            {campiTratte}
            <p className="section-label" style={{ marginTop: 18 }}>Immagini</p>
            {campiImmagini}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={salva}>Salva evento</button>
          </>
        )}
      </Modale>
    );
  }

  // ---- Vista CREAZIONE (nuovo evento): wizard a step ----

  const numeroTratte = (form.linee ?? []).filter((l) => l.nome.trim()).length;

  return (
    <Modale titolo="Nuovo evento" onClose={onClose}>
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
          <div className="riepilogo-riga-evento"><span>Prezzo base</span><b>€{Number(form.prezzo || 0).toFixed(2)}</b></div>
          <div className="riepilogo-riga-evento"><span>Acconto</span><b>€{Number(form.accontoEur || 10).toFixed(2)}</b></div>
          <div className="riepilogo-riga-evento"><span>In evidenza</span><b>{form.inEvidenza ? 'Sì' : 'No'}</b></div>
          <div className="riepilogo-riga-evento"><span>Tratte</span><b>{numeroTratte > 0 ? `${numeroTratte} configurate` : 'Nessuna (aggiungibile dopo)'}</b></div>
          <div className="riepilogo-riga-evento"><span>Immagini</span><b>{(form.immagini ?? []).length}</b></div>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" disabled={step === 1} onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}>← Indietro</button>
        {step < 4 ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              if (step === 1 && !infoCompleta()) { alert('Compila almeno artista, genere, luogo, città, data e prezzo prima di proseguire.'); return; }
              setStep((s) => (s + 1) as 2 | 3 | 4);
            }}
          >
            Avanti →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={salva}>Crea evento</button>
        )}
      </div>
    </Modale>
  );
}
