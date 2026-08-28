import { useEffect, useState } from 'react';
import { fermateAnagraficaApi, type FermataAnagrafica, type FermataAnagraficaInput } from '../../api/fermateAnagrafica';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { Modale } from '../shared/Modale';

const VUOTA: FermataAnagraficaInput = { nome: '', citta: '', indirizzo: '', lat: undefined, lng: undefined, note: '' };

/**
 * L'anagrafica delle fermate: il luogo fisico, a se' stante da come
 * viene poi usato in un tragitto. Una voce qui si sceglie da un
 * elenco componendo un tragitto in un evento, invece di riscrivere
 * ogni volta citta'/indirizzo/coordinate, e resta riutilizzabile su
 * quanti eventi vuoi. Modificarla qui non tocca mai i tragitti che la
 * usano gia' (tengono la propria copia dei dati, presa al momento
 * della scelta).
 */
export function FermateScreen() {
  const [fermate, setFermate] = useState<FermataAnagrafica[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [inModifica, setInModifica] = useState<FermataAnagrafica | null>(null);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [form, setForm] = useState<FermataAnagraficaInput>(VUOTA);
  const [salvando, setSalvando] = useState(false);

  function ricarica() {
    fermateAnagraficaApi.list().then(setFermate);
  }
  useEffect(ricarica, []);

  function apriNuova() {
    setInModifica(null);
    setForm(VUOTA);
    setModaleAperta(true);
  }
  function apriModifica(f: FermataAnagrafica) {
    setInModifica(f);
    setForm({ nome: f.nome, citta: f.citta, indirizzo: f.indirizzo, lat: f.lat, lng: f.lng, note: f.note ?? '' });
    setModaleAperta(true);
  }

  async function salva() {
    if (!form.nome.trim() || !form.citta.trim() || !form.indirizzo.trim()) {
      alert('Nome, citta e indirizzo sono obbligatori.');
      return;
    }
    setSalvando(true);
    try {
      if (inModifica) await fermateAnagraficaApi.update(inModifica.id, form);
      else await fermateAnagraficaApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : 'Impossibile salvare. Riprova.');
    } finally {
      setSalvando(false);
    }
  }

  async function elimina(f: FermataAnagrafica) {
    if (!confirm('Eliminare "' + f.nome + '"?')) return;
    try {
      await fermateAnagraficaApi.remove(f.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : 'Impossibile eliminare. Riprova.');
    }
  }

  const fermateFiltrate = ricerca.trim()
    ? fermate.filter((f) => (f.nome + ' ' + f.citta + ' ' + f.indirizzo).toLowerCase().includes(ricerca.trim().toLowerCase()))
    : fermate;

  return (
    <div>
      <PanelHead
        titolo="Fermate"
        info="L'anagrafica dei luoghi fisici — si scelgono da qui componendo i tragitti di un evento, invece di riscrivere ogni volta città e indirizzo."
        azione={<button className="btn btn-primary" onClick={apriNuova}>+ Nuova fermata</button>}
      />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, città o indirizzo..." />

      {fermateFiltrate.length === 0 ? (
        <p className="testo-intro">
          {ricerca ? 'Nessuna fermata trovata.' : 'Nessuna fermata in anagrafica ancora.'}
        </p>
      ) : (
        <div className="cards-list">
          {fermateFiltrate.map((f) => (
            <div key={f.id} className="section-card" style={{ cursor: 'pointer' }} onClick={() => apriModifica(f)}>
              <b>{f.nome}</b>
              <p style={{ color: 'var(--mist)', fontSize: 12.5, margin: '4px 0 0' }}>{f.citta}</p>
              <p style={{ color: 'var(--mist)', fontSize: 12, margin: '2px 0 0' }}>{f.indirizzo}</p>
              {f.lat && f.lng && (
                <p style={{ color: 'var(--mist)', fontSize: 11, margin: '4px 0 0' }}>
                  {f.lat.toFixed(4)}, {f.lng.toFixed(4)}
                </p>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 8, fontSize: 11, color: 'var(--pink)', padding: 0 }}
                onClick={(e) => { e.stopPropagation(); elimina(f); }}
              >
                Elimina
              </button>
            </div>
          ))}
        </div>
      )}

      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica — ' + inModifica.nome : 'Nuova fermata'} onClose={() => setModaleAperta(false)}>
          <div className="campo">
            <label>Nome<span style={{ opacity: 0.6, fontWeight: 400 }}> — es. "Milano Lambrate", non solo "Milano"</span></label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="form-grid">
            <label>Città
              <input value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} />
            </label>
            <label>Indirizzo
              <input value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} />
            </label>
          </div>
          <div className="form-grid">
            <label>Latitudine (facoltativa)
              <input
                type="number"
                step="any"
                value={form.lat ?? ''}
                onChange={(e) => setForm({ ...form, lat: e.target.value ? Number(e.target.value) : null })}
                placeholder="es. 45.4642"
              />
            </label>
            <label>Longitudine (facoltativa)
              <input
                type="number"
                step="any"
                value={form.lng ?? ''}
                onChange={(e) => setForm({ ...form, lng: e.target.value ? Number(e.target.value) : null })}
                placeholder="es. 9.1900"
              />
            </label>
          </div>
          <div className="campo">
            <label>Note (facoltative)</label>
            <textarea rows={2} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={salvando} onClick={salva}>
            {salvando ? 'Salvo...' : 'Salva'}
          </button>
        </Modale>
      )}
    </div>
  );
}
