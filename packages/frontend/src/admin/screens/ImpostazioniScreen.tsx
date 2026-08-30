import { useEffect, useState } from 'react';
import { impostazioniApi } from '../../api/impostazioni';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';

// Un'unica lista, così è facile aggiungerne altre in futuro senza
// riscrivere la schermata — prima ogni impostazione aggiunta nel
// backend restava "nascosta" (mai esposta qui), trovate 3 così mentre
// se ne aggiungeva una nuova (posti_per_bus era l'unica visibile).
const IMPOSTAZIONI: { chiave: string; etichetta: string; default: string; suffisso?: string }[] = [
  { chiave: 'posti_per_bus', etichetta: 'Posti per bus (usato per "Calcola bus necessari" in Partenze)', default: '50' },
  { chiave: 'credito_per_passeggero', etichetta: 'Credito fedeltà per passeggero (€)', default: '0.5' },
  { chiave: 'soglia_posticipo_variazione_minuti', etichetta: 'Soglia posticipo per notifica variazione (minuti — l\'anticipo e il cambio città/indirizzo notificano sempre, senza soglia)', default: '20' },
  { chiave: 'soglia_minima_fermata_partenza', etichetta: 'Soglia minima partecipanti per una fermata "Partenza" (sotto questo numero non conviene includerla in una Linea)', default: '10' },
];

export function ImpostazioniScreen() {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState<string | null>(null);

  useEffect(() => {
    impostazioniApi.list()
      .then((lista) => {
        const mappa: Record<string, string> = {};
        for (const i of IMPOSTAZIONI) {
          const riga = lista.find((r) => r.chiave === i.chiave);
          mappa[i.chiave] = riga ? riga.valore : i.default;
        }
        setValori(mappa);
      })
      .finally(() => setCaricamento(false));
  }, []);

  async function salva(chiave: string) {
    const numero = Number(valori[chiave]);
    if (!Number.isFinite(numero) || numero < 0) {
      alert('Inserisci un numero valido.');
      return;
    }
    setSalvataggio(chiave);
    try {
      await impostazioniApi.set(chiave, String(numero));
      alert('Impostazione salvata.');
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvataggio(null);
    }
  }

  return (
    <div>
      <PanelHead titolo="Impostazioni" />
      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Caricamento...</p>
      ) : (
        <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {IMPOSTAZIONI.map((i) => (
            <div key={i.chiave} className="section-card">
              <div className="campo" style={{ marginBottom: 10 }}>
                <label>{i.etichetta}</label>
                <input
                  type="number" min={0} step="0.01"
                  value={valori[i.chiave] ?? i.default}
                  onChange={(e) => setValori((v) => ({ ...v, [i.chiave]: e.target.value }))}
                />
              </div>
              <button className="btn btn-ghost" onClick={() => salva(i.chiave)} disabled={salvataggio === i.chiave}>
                {salvataggio === i.chiave ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
