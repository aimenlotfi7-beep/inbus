import { useEffect, useState } from 'react';
import { promoterApi, type Promoter, type PromoterInput } from '../../api/promoter';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { Modale } from '../shared/Modale';

const VUOTO: PromoterInput = { nome: '', email: '', password: '', commissionePercentuale: 10 };

export function PromoterScreen() {
  const [promoter, setPromoter] = useState<Promoter[]>([]);
  const [inModifica, setInModifica] = useState<Promoter | null>(null);
  const [form, setForm] = useState<PromoterInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [statistiche, setStatistiche] = useState<{ numeroPrenotazioni: number; fatturato: number } | null>(null);
  const [ricerca, setRicerca] = useState('');

  function ricarica() { promoterApi.list().then(setPromoter); }
  useEffect(ricarica, []);

  const promoterFiltrati = ricerca.trim()
    ? promoter.filter((p) => `${p.nome} ${p.email} ${p.codice}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : promoter;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setStatistiche(null); setModaleAperta(true); }
  function apriModifica(p: Promoter) {
    setInModifica(p);
    setForm({ nome: p.nome, email: p.email, telefono: p.telefono ?? undefined, commissionePercentuale: Number(p.commissionePercentuale) });
    setModaleAperta(true);
    promoterApi.statistiche(p.id).then(setStatistiche);
  }

  async function salva() {
    if (!form.nome || !form.email) return;
    try {
      if (inModifica) await promoterApi.update(inModifica.id, form);
      else await promoterApi.create(form);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: impossibile contattare il server.');
    }
  }
  async function elimina(p: Promoter) {
    if (!confirm(`Eliminare il promoter "${p.nome}"?`)) return;
    await promoterApi.remove(p.id);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Promoter" azione={<button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo promoter</button>} />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o codice..." />
      <TabellaGenerica
        righe={promoterFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (p) => p.nome },
          { etichetta: 'Email', render: (p) => p.email },
          { etichetta: 'Codice', render: (p) => p.codice },
          { etichetta: 'Commissione', render: (p) => `${p.commissionePercentuale}%` },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />
      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica promoter' : 'Nuovo promoter'} onClose={() => setModaleAperta(false)}>
          <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="campo"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="campo"><label>Telefono</label><input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
          {!inModifica && <div className="campo"><label>Password iniziale</label><input type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
          <div className="campo"><label>Commissione %</label><input type="number" value={form.commissionePercentuale ?? 10} onChange={(e) => setForm({ ...form, commissionePercentuale: Number(e.target.value) })} /></div>
          {statistiche && (
            <p style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 14 }}>
              {statistiche.numeroPrenotazioni} prenotazioni portate · €{statistiche.fatturato.toFixed(2)} di fatturato generato
            </p>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva promoter</button>
        </Modale>
      )}
    </div>
  );
}
