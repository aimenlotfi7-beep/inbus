import { useEffect, useState } from 'react';
import { impostazioniApi } from '../../api/impostazioni';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';

const CHIAVE_POSTI_PER_BUS = 'posti_per_bus';

export function ImpostazioniScreen() {
  const [postiPerBus, setPostiPerBus] = useState('50');
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    impostazioniApi.list()
      .then((lista) => {
        const riga = lista.find((i) => i.chiave === CHIAVE_POSTI_PER_BUS);
        if (riga) setPostiPerBus(riga.valore);
      })
      .finally(() => setCaricamento(false));
  }, []);

  async function salva() {
    const numero = Number(postiPerBus);
    if (!Number.isFinite(numero) || numero <= 0) {
      alert('Inserisci un numero di posti valido.');
      return;
    }
    setSalvataggio(true);
    try {
      await impostazioniApi.set(CHIAVE_POSTI_PER_BUS, String(numero));
      alert('Impostazione salvata.');
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvataggio(false);
    }
  }

  return (
    <div>
      <PanelHead titolo="Impostazioni" />
      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Caricamento...</p>
      ) : (
        <div style={{ maxWidth: 420 }}>
          <div className="campo">
            <label>Posti per bus (usato per "Calcola bus necessari" nella sezione Partenze)</label>
            <input type="number" min={1} value={postiPerBus} onChange={(e) => setPostiPerBus(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={salva} disabled={salvataggio}>
            {salvataggio ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      )}
    </div>
  );
}
