import { useEffect, useState, type ReactNode } from 'react';
import { eventiApi, type EventoInput, type LineaInput, type FermataInput } from '../../../api/eventi';
import { tragittiApi, type Tragitto } from '../../../api/tragitti';
import { categorieApi, type Categoria } from '../../../api/categorie';
import { ErroreApi } from '../../../api/client';
import type { Evento } from '../../../api/types';
import { Modale } from '../../shared/Modale';
import { PartenzeTab } from '../partenze/PartenzeTab';

const LINEA_VUOTA: LineaInput = { nome: '', postiTotali: 50, prezzoExtra: 0, fermate: [{ citta: '', indirizzo: '' }] };
const VUOTO: EventoInput = { artista: '', genere: '', luogo: '', citta: '', data: '', prezzo: 0, inEvidenza: false, linee: [] };

const STEP_WIZARD = [
  { numero: 1, label: 'Info evento' },
  { numero: 2, label: 'Tratte' },
  { numero: 3, label: 'Riepilogo' },
] as const;

/**
 * Scheda completa di un evento.
 * - Creazione (evento === null): wizard a step (Info evento → Tratte →
 *   Riepilogo), come nel prototipo originale.
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
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
        linee: evento.linee.map((l) => ({
          nome: l.nome, postiTotali: l.postiTotali, prezzoExtra: Number(l.prezzoExtra),
          fermate: l.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario ?? undefined, prezzo: f.prezzo ? Number(f.prezzo) : undefined })),
        })),
      });
    } else {
      setForm(VUOTO);
      setStep(1);
    }
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
  function applicaTragitto(idxLinea: number, tragittoId: string) {
    if (!tragittoId) return;
    const tragitto = tragitti.find((t) => t.id === tragittoId);
    if (!tragitto) return;
    const linee = [...(form.linee ?? [])];
    linee[idxLinea] = {
      ...linee[idxLinea],
      fermate: tragitto.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario, prezzo: f.prezzo })),
    };
    setForm({ ...form, linee });
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
      </div>
      <div className="campo">
        <label><input type="checkbox" checked={form.inEvidenza ?? false} onChange={(e) => setForm({ ...form, inEvidenza: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> In evidenza in homepage</label>
      </div>
    </>
  );

  const campiTratte: ReactNode = (
    <>
      {(form.linee ?? []).map((linea, idxLinea) => (
        <div key={idxLinea} className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr .6fr', gap: 8, flex: 1 }}>
              <input placeholder="Nome tratta" value={linea.nome} onChange={(e) => aggiornaLinea(idxLinea, 'nome', e.target.value)} />
              <input placeholder="Posti totali" type="number" value={linea.postiTotali} onChange={(e) => aggiornaLinea(idxLinea, 'postiTotali', Number(e.target.value))} />
            </div>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12.5 }} onClick={() => rimuoviLinea(idxLinea)}>Rimuovi tratta</button>
          </div>

          {tragitti.length > 0 && (
            <select
              defaultValue=""
              style={{ marginBottom: 10 }}
              onChange={(e) => { applicaTragitto(idxLinea, e.target.value); e.target.value = ''; }}
            >
              <option value="" disabled>Applica un tragitto salvato...</option>
              {tragitti.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          )}

          {linea.fermate.map((f, idxFermata) => (
            <div key={idxFermata} style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr .6fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'citta', e.target.value)} />
              <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'indirizzo', e.target.value)} />
              <input placeholder="Orario" type="time" value={f.orario ?? ''} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'orario', e.target.value)} />
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', padding: '4px 8px' }} onClick={() => rimuoviFermata(idxLinea, idxFermata)} title="Rimuovi fermata">✕</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => aggiungiFermata(idxLinea)}>+ Aggiungi fermata</button>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ marginBottom: 6 }} onClick={() => setForm({ ...form, linee: [...(form.linee ?? []), { ...LINEA_VUOTA, fermate: [{ citta: '', indirizzo: '' }] }] })}>+ Aggiungi tratta</button>
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

      {step === 3 && (
        <div className="evento-riepilogo-box">
          <div className="riepilogo-riga-evento"><span>Artista</span><b>{form.artista || '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Genere</span><b>{form.genere || '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Luogo</span><b>{form.luogo ? `${form.luogo}, ${form.citta}` : '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Data</span><b>{form.data ? new Date(form.data).toLocaleDateString('it-IT') : '—'}</b></div>
          <div className="riepilogo-riga-evento"><span>Prezzo base</span><b>€{Number(form.prezzo || 0).toFixed(2)}</b></div>
          <div className="riepilogo-riga-evento"><span>In evidenza</span><b>{form.inEvidenza ? 'Sì' : 'No'}</b></div>
          <div className="riepilogo-riga-evento"><span>Tratte</span><b>{numeroTratte > 0 ? `${numeroTratte} configurate` : 'Nessuna (aggiungibile dopo)'}</b></div>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" disabled={step === 1} onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s))}>← Indietro</button>
        {step < 3 ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              if (step === 1 && !infoCompleta()) { alert('Compila almeno artista, genere, luogo, città, data e prezzo prima di proseguire.'); return; }
              setStep((s) => (s + 1) as 2 | 3);
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
