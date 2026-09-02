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
  { chiave: 'soglia_posticipo_variazione_minuti', etichetta: 'Soglia posticipo per notifica variazione (minuti — l\'anticipo e il cambio città/indirizzo notificano sempre, senza soglia; 0 o vuoto = avvisa sempre anche per il posticipo)', default: '0' },
];

// Chiave della formula prezzi (sezione dedicata più sotto, separata
// dall'elenco generico) — salvata gia' come percentuale vera (es. 60,
// non 0.6), cosi' il numero nel database e' leggibile cosi' com'e',
// senza bisogno di convertirlo mentalmente.
const CHIAVE_SOGLIA_OCCUPAZIONE = 'soglia_occupazione_pareggio';
const DEFAULT_SOGLIA_OCCUPAZIONE = '50';

export function ImpostazioniScreen() {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [sogliaOccupazione, setSogliaOccupazione] = useState(DEFAULT_SOGLIA_OCCUPAZIONE);
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
        const rigaSoglia = lista.find((r) => r.chiave === CHIAVE_SOGLIA_OCCUPAZIONE);
        if (rigaSoglia) setSogliaOccupazione(rigaSoglia.valore);
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

  async function salvaSogliaOccupazione() {
    const numero = Number(sogliaOccupazione);
    // Percentuale vera ora (es. 60 = 60%) — 0 romperebbe il calcolo
    // (divisione per zero sui posti di pareggio), oltre 100 non
    // avrebbe senso (più del 100% di riempimento del bus).
    if (!Number.isFinite(numero) || numero <= 0 || numero > 100) {
      alert('Inserisci una percentuale tra 1 e 100.');
      return;
    }
    setSalvataggio(CHIAVE_SOGLIA_OCCUPAZIONE);
    try {
      await impostazioniApi.set(CHIAVE_SOGLIA_OCCUPAZIONE, String(numero));
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

          {/* Sezione dedicata, separata dall'elenco generico sopra —
              qui vive la formula usata da "Calcola preventivo" (dentro
              un tragitto, in Prezzi) per suggerire il prezzo di ogni
              fermata dal costo del fornitore. */}
          <div className="section-card" style={{ borderColor: 'var(--blue)' }}>
            <p className="section-label" style={{ marginBottom: 4 }}>Formula di calcolo prezzi</p>
            <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 12, lineHeight: 1.5 }}>
              Usata dal pulsante "Calcola preventivo" per suggerire il prezzo di ogni fermata, partendo dal costo del fornitore:
              <br />
              <code style={{ fontSize: 11.5 }}>Posti di pareggio = Posti bus × Soglia di occupazione</code>
              <br />
              <code style={{ fontSize: 11.5 }}>Prezzo minimo = Costo bus ÷ Posti di pareggio</code>
              <br />
              <code style={{ fontSize: 11.5 }}>Prezzo fermata = Prezzo minimo + (tariffa al km × km fino all'arrivo)</code>
              <br />
              Nessuna fermata scende mai sotto il prezzo minimo — chi sale più lontano dall'arrivo paga di più.
            </p>
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>Soglia di occupazione assunta per il pareggio (%) — più bassa = prezzi più prudenti/alti</label>
              <input
                type="number" min={1} max={100} step="1"
                value={sogliaOccupazione}
                onChange={(e) => setSogliaOccupazione(e.target.value)}
              />
            </div>
            <button className="btn btn-ghost" onClick={salvaSogliaOccupazione} disabled={salvataggio === CHIAVE_SOGLIA_OCCUPAZIONE}>
              {salvataggio === CHIAVE_SOGLIA_OCCUPAZIONE ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
