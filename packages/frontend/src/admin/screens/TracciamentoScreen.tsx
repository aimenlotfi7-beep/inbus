import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { impostazioniApi } from '../../api/impostazioni';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';

// Prima vivevano dentro "Impostazioni" generiche, in mezzo a soglie
// numeriche senza nessun legame — spostati qui, nel gruppo Marketing,
// dove chi li cerca li trova davvero.
const CAMPI: { chiave: string; etichetta: string; tipo: 'testo' | 'segreto'; nota: string }[] = [
  {
    chiave: 'meta_pixel_id', etichetta: 'Meta Pixel — ID (Events Manager → Origini dati → il tuo Pixel)', tipo: 'testo',
    nota: 'Parte solo per i clienti che accettano i cookie di marketing nel banner del sito. Traccia automaticamente le visite; "inizio prenotazione" e "acquisto" sono già collegati nel codice.',
  },
  {
    chiave: 'meta_capi_token', etichetta: 'Meta Pixel — Token Conversions API (Events Manager → Impostazioni → Conversions API → Genera token di accesso)', tipo: 'segreto',
    nota: 'Manda gli stessi eventi anche dal server, come backup — recupera quelli persi dal browser (Safari, ad-blocker). Senza questo token, il Pixel funziona comunque, solo senza il backup lato server.',
  },
  {
    chiave: 'ga4_measurement_id', etichetta: 'Google Analytics 4 — ID di misurazione (Amministrazione → Origini dati → Web, formato "G-XXXXXXXXXX")', tipo: 'testo',
    nota: 'Comportamento dei visitatori (da dove arrivano, quanto restano, dove abbandonano) — diverso dal Pixel, che serve a ottimizzare le campagne Meta. Parte con lo stesso consenso cookie del Pixel.',
  },
  {
    chiave: 'google_ads_conversion_id', etichetta: 'Google Ads — ID conversione (Strumenti → Conversioni → l\'azione "Acquisto" → Configurazione del tag, formato "AW-XXXXXXXXX")', tipo: 'testo',
    nota: 'Usa lo stesso script di GA4 (nessun altro codice da caricare) — dice a Google Ads quali visite dai tuoi annunci si sono trasformate in vendite, per ottimizzare le campagne sulle vendite vere, non solo sui clic.',
  },
  {
    chiave: 'google_ads_conversion_label', etichetta: 'Google Ads — Etichetta della conversione "Acquisto" (stessa pagina di sopra, la parte dopo la barra nel tag)', tipo: 'testo',
    nota: 'Serve insieme all\'ID qui sopra — senza uno dei due, le conversioni Google Ads non partono (GA4 e Meta continuano a funzionare comunque).',
  },
];

export function TracciamentoScreen() {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState<string | null>(null);

  useEffect(() => {
    impostazioniApi.list()
      .then((lista) => {
        const mappa: Record<string, string> = {};
        for (const c of CAMPI) mappa[c.chiave] = lista.find((r) => r.chiave === c.chiave)?.valore ?? '';
        setValori(mappa);
      })
      .finally(() => setCaricamento(false));
  }, []);

  async function salva(chiave: string) {
    setSalvataggio(chiave);
    try {
      await impostazioniApi.set(chiave, valori[chiave] ?? '');
      notifica('Impostazione salvata.', 'successo');
    } catch (e) {
      notifica(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvataggio(null);
    }
  }

  return (
    <div>
      <PanelHead titolo="Tracciamento" />
      <p className="testo-intro" style={{ marginBottom: 16 }}>Meta Pixel e Google Analytics 4 — da dove arrivano le visite, dove abbandonano, cosa comprano. Il pixel di un singolo organizzatore si imposta invece nella sua scheda White Label.</p>
      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Carico...</p>
      ) : (
        <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {CAMPI.map((c) => (
            <div key={c.chiave} className="section-card">
              <div className="campo" style={{ marginBottom: 10 }}>
                <label>{c.etichetta}</label>
                <input
                  type={c.tipo === 'segreto' ? 'password' : 'text'}
                  placeholder="(non impostato)"
                  value={valori[c.chiave] ?? ''}
                  onChange={(e) => setValori((v) => ({ ...v, [c.chiave]: e.target.value }))}
                />
                <p style={{ fontSize: 12, color: 'var(--mist)', marginTop: 6 }}>{c.nota}</p>
              </div>
              <button className="btn btn-ghost" onClick={() => salva(c.chiave)} disabled={salvataggio === c.chiave}>
                {salvataggio === c.chiave ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
