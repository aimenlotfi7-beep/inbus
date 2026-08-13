import { useEffect, useState } from 'react';
import { eventiApi, type EventoInput, type LineaInput, type FermataInput } from '../../api/eventi';
import { ErroreApi } from '../../api/client';
import type { Evento } from '../../api/types';
import { PanelHead } from '../shared/PanelHead';
import { Modale } from '../shared/Modale';

const LINEA_VUOTA: LineaInput = { nome: '', postiTotali: 50, prezzoExtra: 0, fermate: [{ citta: '', indirizzo: '' }] };
const VUOTO: EventoInput = { artista: '', genere: '', luogo: '', citta: '', data: '', prezzo: 0, inEvidenza: false, linee: [] };

export function EventiScreen() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [inModifica, setInModifica] = useState<Evento | null>(null);
  const [form, setForm] = useState<EventoInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() { eventiApi.list().then(setEventi); }
  useEffect(ricarica, []);

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(ev: Evento) {
    setInModifica(ev);
    setForm({
      artista: ev.artista, genere: ev.genere, luogo: ev.luogo, citta: ev.citta,
      data: ev.data.slice(0, 10), prezzo: Number(ev.prezzo), inEvidenza: ev.inEvidenza,
      linee: ev.linee.map((l) => ({
        nome: l.nome, postiTotali: l.postiTotali, prezzoExtra: Number(l.prezzoExtra),
        fermate: l.fermate.map((f) => ({ citta: f.citta, indirizzo: f.indirizzo, orario: f.orario ?? undefined, prezzo: f.prezzo ? Number(f.prezzo) : undefined })),
      })),
    });
    setModaleAperta(true);
  }

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

  async function salva() {
    if (!form.artista || !form.genere || !form.luogo || !form.citta || !form.data || !form.prezzo) {
      alert('Compila almeno artista, genere, luogo, città, data e prezzo.');
      return;
    }

    // Pulisco i dati prima di inviarli: un bus senza nome o una fermata
    // senza città/indirizzo verrebbero rifiutati dal server (400), quindi
    // li scarto qui invece di lasciare che il salvataggio fallisca in silenzio.
    const payload = {
      ...form,
      linee: (form.linee ?? [])
        .filter((l) => l.nome.trim())
        .map((l) => ({ ...l, fermate: l.fermate.filter((f) => f.citta.trim() && f.indirizzo.trim()) })),
    };

    try {
      if (inModifica) await eventiApi.update(inModifica.id, payload);
      else await eventiApi.create(payload);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server. Controlla che il backend sia acceso.');
    }
  }
  async function elimina(ev: Evento) {
    if (!confirm(`Eliminare l'evento "${ev.artista}"?`)) return;
    await eventiApi.remove(ev.id);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Eventi" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo evento</button>} />

      <div className="cards-list">
        {eventi.map((ev) => (
          <div key={ev.id} className="evento-card" onClick={() => apriModifica(ev)}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--amber)' }}>{ev.genere}</span>
            <h3 style={{ fontSize: 17, margin: '6px 0 4px' }}>{ev.artista}</h3>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{ev.luogo}, {ev.citta}</p>
            <p style={{ color: 'var(--mist)', fontSize: 12.5 }}>{new Date(ev.data).toLocaleDateString('it-IT')} · €{Number(ev.prezzo).toFixed(2)}</p>
            <button className="btn btn-ghost" style={{ marginTop: 10, fontSize: 11, color: 'var(--pink)' }} onClick={(e) => { e.stopPropagation(); elimina(ev); }}>Elimina</button>
          </div>
        ))}
        {!eventi.length && <p style={{ color: 'var(--mist)' }}>Nessun evento ancora.</p>}
      </div>

      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica evento' : 'Nuovo evento'} onClose={() => setModaleAperta(false)}>
          <div className="form-grid">
            <label>Artista <input value={form.artista} onChange={(e) => setForm({ ...form, artista: e.target.value })} /></label>
            <label>Genere <input value={form.genere} onChange={(e) => setForm({ ...form, genere: e.target.value })} /></label>
            <label>Luogo <input value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} /></label>
            <label>Città <input value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
            <label>Data <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
            <label>Prezzo base (€) <input type="number" value={form.prezzo} onChange={(e) => setForm({ ...form, prezzo: Number(e.target.value) })} /></label>
          </div>
          <div className="campo">
            <label><input type="checkbox" checked={form.inEvidenza ?? false} onChange={(e) => setForm({ ...form, inEvidenza: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} /> In evidenza in homepage</label>
          </div>

          <p style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, margin: '18px 0 10px' }}>Bus</p>
          {(form.linee ?? []).map((linea, idxLinea) => (
            <div key={idxLinea} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr .6fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="Nome bus" value={linea.nome} onChange={(e) => aggiornaLinea(idxLinea, 'nome', e.target.value)} />
                <input placeholder="Posti totali" type="number" value={linea.postiTotali} onChange={(e) => aggiornaLinea(idxLinea, 'postiTotali', Number(e.target.value))} />
              </div>
              {linea.fermate.map((f, idxFermata) => (
                <div key={idxFermata} style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr .6fr', gap: 6, marginBottom: 6 }}>
                  <input placeholder="Città" value={f.citta} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'citta', e.target.value)} />
                  <input placeholder="Indirizzo" value={f.indirizzo} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'indirizzo', e.target.value)} />
                  <input placeholder="Orario" type="time" value={f.orario ?? ''} onChange={(e) => aggiornaFermata(idxLinea, idxFermata, 'orario', e.target.value)} />
                </div>
              ))}
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => aggiungiFermata(idxLinea)}>+ Aggiungi fermata</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ marginBottom: 18 }} onClick={() => setForm({ ...form, linee: [...(form.linee ?? []), { ...LINEA_VUOTA, fermate: [{ citta: '', indirizzo: '' }] }] })}>+ Aggiungi bus</button>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva evento</button>
        </Modale>
      )}
    </div>
  );
}
