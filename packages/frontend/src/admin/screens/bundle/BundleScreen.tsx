import { useEffect, useState } from 'react';
import { bundleApi, type BundleRiga } from '../../../api/bundle';
import { notifica } from '../../shared/notifiche';
import { ErroreApi } from '../../../api/client';
import { PanelHead } from '../../shared/PanelHead';
import { RicercaSezione } from '../../shared/RicercaSezione';
import { BundleCardCompatta } from '../../shared/BundleCardCompatta';
import { BundleForm } from './BundleForm';

/** Elenco dei bundle (sul modello delle altre sezioni) + apertura del
 *  form. Lo stato arriva già calcolato dal server. */
export function BundleScreen() {
  const [lista, setLista] = useState<BundleRiga[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [aperto, setAperto] = useState<{ id: string | null } | null>(null);

  function ricarica() { bundleApi.list().then(setLista).catch(() => setLista([])); }
  useEffect(ricarica, []);

  const filtrati = ricerca.trim() ? lista.filter((b) => b.nome.toLowerCase().includes(ricerca.trim().toLowerCase())) : lista;

  async function elimina(b: BundleRiga) {
    if (!confirm(`Eliminare il bundle "${b.nome}"? Gli ordini già fatti restano.`)) return;
    try { await bundleApi.remove(b.id); notifica('Bundle eliminato.'); ricarica(); }
    catch (e) { notifica(e instanceof ErroreApi ? e.message : 'Eliminazione non riuscita.'); }
  }

  if (aperto) return <BundleForm bundleId={aperto.id} onChiudi={() => { setAperto(null); ricarica(); }} />;

  return (
    <div>
      <PanelHead titolo="Bundle" azione={<button className="btn btn-primary" onClick={() => setAperto({ id: null })}>+ Nuovo bundle</button>} />
      <p className="testo-intro" style={{ marginBottom: 12 }}>Più eventi già esistenti venduti insieme con uno sconto. Gli eventi restano acquistabili anche singolarmente.</p>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome..." />
      {filtrati.length === 0 ? (
        <p className="testo-intro">{ricerca ? 'Nessun bundle trovato.' : 'Nessun bundle creato ancora.'}</p>
      ) : (
        <div className="cards-list">
          {filtrati.map((b) => (
            <BundleCardCompatta key={b.id} bundle={b} onClick={() => setAperto({ id: b.id })} onElimina={() => elimina(b)} />
          ))}
        </div>
      )}
    </div>
  );
}
