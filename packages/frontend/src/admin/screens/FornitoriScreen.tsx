import { useEffect, useState } from 'react';
import { fornitoriApi, type Fornitore, type FornitoreInput } from '../../api/fornitori';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

const VUOTO: Partial<FornitoreInput> = { nome: '', partitaIva: '', referente: '', telefono: '', email: '', indirizzo: '', note: '' };

export function FornitoriScreen() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [inModifica, setInModifica] = useState<Fornitore | null>(null);
  const [form, setForm] = useState<Partial<FornitoreInput>>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  function ricarica() { fornitoriApi.list().then(setFornitori); }
  useEffect(ricarica, []);

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

  return (
    <div>
      <PanelHead titolo="Fornitori" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo fornitore</button>} />
      <TabellaGenerica
        righe={fornitori}
        colonne={[
          { etichetta: 'Nome', render: (f) => f.nome },
          { etichetta: 'Referente', render: (f) => f.referente ?? '—' },
          { etichetta: 'Telefono', render: (f) => f.telefono ?? '—' },
          { etichetta: 'Indirizzo', render: (f) => f.indirizzo ?? '—' },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica fornitore' : 'Nuovo fornitore'} onClose={() => setModaleAperta(false)}>
          <div className="campo"><label>Nome</label><input value={form.nome ?? ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="campo"><label>Partita IVA</label><input value={form.partitaIva ?? ''} onChange={(e) => setForm({ ...form, partitaIva: e.target.value })} /></div>
          <div className="campo"><label>Referente</label><input value={form.referente ?? ''} onChange={(e) => setForm({ ...form, referente: e.target.value })} /></div>
          <div className="campo"><label>Telefono</label><input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
          <div className="campo"><label>Email</label><input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="campo"><label>Indirizzo</label><input value={form.indirizzo ?? ''} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} /></div>
          <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva fornitore</button>
        </Modale>
      )}
    </div>
  );
}
