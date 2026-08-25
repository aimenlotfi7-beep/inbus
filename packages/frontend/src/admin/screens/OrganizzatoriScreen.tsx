import { useEffect, useState } from 'react';
import { organizzatoriApi, type Organizzatore, type OrganizzatoreInput } from '../../api/organizzatori';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CampoCopiabile } from '../shared/CampoCopiabile';
import { SelettoreEventi } from '../shared/SelettoreEventi';

const VUOTO: OrganizzatoreInput = { nome: '', email: '', password: '', eventiAbilitati: [] };

export function OrganizzatoriScreen() {
  const [organizzatori, setOrganizzatori] = useState<Organizzatore[]>([]);
  const [inModifica, setInModifica] = useState<Organizzatore | null>(null);
  const [form, setForm] = useState<OrganizzatoreInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { organizzatoriApi.list().then(setOrganizzatori); }
  useEffect(ricarica, []);

  const organizzatoriFiltrati = ricerca.trim()
    ? organizzatori.filter((o) => `${o.nome} ${o.email}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : organizzatori;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setModaleAperta(true); }
  function apriModifica(o: Organizzatore) {
    setInModifica(o);
    setForm({ nome: o.nome, email: o.email, telefono: o.telefono ?? undefined, note: o.note ?? undefined, eventiAbilitati: o.eventiAbilitati });
    setModaleAperta(true);
  }

  async function salva() {
    if (!form.nome || !form.email) return;
    try {
      if (inModifica) await organizzatoriApi.update(inModifica.id, form);
      else await organizzatoriApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(o: Organizzatore) {
    if (!confirm(`Eliminare l'organizzatore "${o.nome}"?`)) return;
    await organizzatoriApi.remove(o.id);
    ricarica();
  }

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica organizzatore' : 'Nuovo organizzatore'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="campo"><label>Telefono</label><input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
        {!inModifica && <div className="campo"><label>Password iniziale</label><input type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
        <div className="campo"><label>Note interne</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <div className="campo">
          <label>Eventi associati</label>
          <SelettoreEventi selezionati={form.eventiAbilitati ?? []} onChange={(ids) => setForm({ ...form, eventiAbilitati: ids })} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={salva}>Salva organizzatore</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Organizzatori" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo organizzatore</button>} />
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <CampoCopiabile etichetta="Link di accesso per gli organizzatori" valore={`${window.location.origin}/organizzatore`} />
      </div>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome o email..." />
      <TabellaGenerica
        righe={organizzatoriFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (o) => o.nome },
          { etichetta: 'Email', render: (o) => o.email },
          { etichetta: 'Eventi associati', render: (o) => String(o.eventiAbilitati.length) },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
    </div>
  );
}
