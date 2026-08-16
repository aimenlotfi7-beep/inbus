import { useEffect, useState } from 'react';
import { fornitoriApi, type Fornitore, type FornitoreInput } from '../../api/fornitori';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';

const VUOTO: Partial<FornitoreInput> = { nome: '', partitaIva: '', referente: '', telefono: '', email: '', indirizzo: '', note: '' };

export function FornitoriScreen() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [inModifica, setInModifica] = useState<Fornitore | null>(null);
  const [form, setForm] = useState<Partial<FornitoreInput>>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { fornitoriApi.list().then(setFornitori); }
  useEffect(ricarica, []);

  const fornitoriFiltrati = ricerca.trim()
    ? fornitori.filter((f) => `${f.nome} ${f.referente ?? ''} ${f.indirizzo ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : fornitori;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(f: Fornitore) { setInModifica(f); setForm(f); setModaleAperta(true); }

  async function salva() {
    if (!form.nome) return;
    try {
      if (inModifica) await fornitoriApi.update(inModifica.id, form);
      else await fornitoriApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(f: Fornitore) {
    if (!confirm(`Eliminare "${f.nome}"?`)) return;
    await fornitoriApi.remove(f.id);
    ricarica();
  }

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica fornitore' : 'Nuovo fornitore'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome</label><input value={form.nome ?? ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="campo"><label>Partita IVA</label><input value={form.partitaIva ?? ''} onChange={(e) => setForm({ ...form, partitaIva: e.target.value })} /></div>
        <div className="campo"><label>Referente</label><input value={form.referente ?? ''} onChange={(e) => setForm({ ...form, referente: e.target.value })} /></div>
        <div className="campo"><label>Telefono</label><input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="campo"><label>Indirizzo</label><input value={form.indirizzo ?? ''} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} /></div>
        <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva fornitore</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Fornitori" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo fornitore</button>} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, referente o indirizzo..." />
      <TabellaGenerica
        righe={fornitoriFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (f) => f.nome },
          { etichetta: 'Referente', render: (f) => f.referente ?? '—' },
          { etichetta: 'Telefono', render: (f) => f.telefono ?? '—' },
          { etichetta: 'Indirizzo', render: (f) => f.indirizzo ?? '—' },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
