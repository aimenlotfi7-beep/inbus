import { useEffect, useState } from 'react';
import { motivoErrore } from '../shared/errori';
import { notifica } from '../shared/notifiche';
import { impostazioniApi } from '../../api/impostazioni';
import { PanelHead } from '../shared/PanelHead';

// Un'unica lista, così è facile aggiungerne altre in futuro senza
// riscrivere la schermata — prima ogni impostazione aggiunta nel
// backend restava "nascosta" (mai esposta qui).
// Solo numeriche ora — Pixel/GA4 (testo/segreto) si sono spostati in
// Promozioni → Tracciamento, una sezione dedicata invece di stare
// mescolati qui in mezzo a soglie senza nessun legame con loro.
//
// Ogni riquadro ha un TITOLO breve e la spiegazione sotto (proprietario,
// ottobre 2026: prima c'era solo una frase lunga per riquadro e per
// capire di cosa si trattasse bisognava leggerla tutta), e i riquadri
// sono raggruppati per argomento.
// minimo: sotto questo numero il server userebbe il valore iniziale, quindi
// si rifiuta subito con un messaggio (stesse regole nel server).

type Gruppo = 'viaggi' | 'date' | 'fornitori' | 'clienti';

const GRUPPI: { id: Gruppo; titolo: string; sottotitolo: string }[] = [
  { id: 'viaggi', titolo: 'Bus e prezzi', sottotitolo: 'Come si calcolano posti di pareggio e prezzi delle fermate.' },
  { id: 'date', titolo: 'Date dei viaggi', sottotitolo: 'Quando si decide il piano dei bus e quando chiudono le vendite. Ogni evento può avere date sue.' },
  { id: 'fornitori', titolo: 'Fornitori e preventivi', sottotitolo: 'Chi riceve le richieste automatiche e per quanto tempo valgono.' },
  { id: 'clienti', titolo: 'Clienti', sottotitolo: 'Credito fedeltà, invita un amico e avvisi quando cambia un orario.' },
];

const IMPOSTAZIONI: { chiave: string; gruppo: Gruppo; titolo: string; unita: string; etichetta: string; default: string; minimo: number; messaggio: string }[] = [
  {
    chiave: 'posti_per_bus', gruppo: 'viaggi', titolo: 'Posti per bus', unita: 'posti',
    etichetta: 'Usati quando la quotazione scelta non indica i posti: pareggio, proposte dei bus, statistiche.',
    default: '50', minimo: 1, messaggio: 'I posti per bus devono essere almeno 1.',
  },
  {
    chiave: 'giorni_decisione_piano', gruppo: 'date', titolo: 'Quando si decide il piano bus', unita: 'giorni prima dell\'evento',
    etichetta: 'Fino a quel momento si raccolgono prenotazioni e nessuna richiesta di preventivo parte ai fornitori. Da lì si costruisce il piano. La scheda del singolo evento può avere una data propria.',
    default: '30', minimo: 0, messaggio: 'Inserisci i giorni prima dell\'evento, da 0 a 365.',
  },
  {
    chiave: 'giorni_fine_vendite', gruppo: 'date', titolo: 'Quando chiudono le vendite', unita: 'giorni prima dell\'evento',
    etichetta: 'Dopo non si compra più, ma la lista d\'attesa resta aperta. 0 = si vende fino al giorno dell\'evento. La scheda del singolo evento può avere una data propria.',
    default: '0', minimo: 0, messaggio: 'Inserisci i giorni prima dell\'evento, da 0 a 365.',
  },
  {
    chiave: 'raggio_km_preventivo', gruppo: 'fornitori', titolo: 'Raggio di ricerca dei fornitori', unita: 'km',
    etichetta: 'Distanza in linea d\'aria dalla partenza entro cui i fornitori ricevono le richieste automatiche di quotazione e preventivo.',
    default: '40', minimo: 1, messaggio: 'Il raggio deve essere di almeno 1 km.',
  },
  {
    chiave: 'giorni_validita_link_preventivo', gruppo: 'fornitori', titolo: 'Durata del link per i fornitori', unita: 'giorni',
    etichetta: 'Dopo, il link per rispondere a una richiesta risulta scaduto. Chi ha già risposto continua a vedere la sua risposta.',
    default: '60', minimo: 1, messaggio: 'Il link deve valere almeno 1 giorno.',
  },
  {
    chiave: 'credito_per_passeggero', gruppo: 'clienti', titolo: 'Credito fedeltà', unita: '€ per passeggero',
    etichetta: 'Accreditato al cliente per ogni passeggero della prenotazione. 0 = disattivato.',
    default: '0.5', minimo: 0, messaggio: 'Inserisci un importo da 0 in su.',
  },
  {
    chiave: 'credito_referral_invitante', gruppo: 'clienti', titolo: 'Invita un amico — bonus a chi invita', unita: '€',
    etichetta: 'Arriva dopo il primo viaggio dell\'amico, e torna indietro se quel viaggio viene rimborsato. 0 = disattivato.',
    default: '0', minimo: 0, messaggio: 'Inserisci un importo da 0 in su.',
  },
  {
    chiave: 'credito_referral_amico', gruppo: 'clienti', titolo: 'Invita un amico — bonus all\'amico', unita: '€',
    etichetta: 'Arriva subito alla registrazione dell\'amico invitato. 0 = disattivato.',
    default: '0', minimo: 0, messaggio: 'Inserisci un importo da 0 in su.',
  },
  {
    chiave: 'soglia_posticipo_variazione_minuti', gruppo: 'clienti', titolo: 'Avviso per un orario posticipato', unita: 'minuti',
    etichetta: 'Sotto questa soglia il posticipo non fa partire l\'avviso al cliente. L\'anticipo e il cambio di città o indirizzo avvisano sempre. 0 = avvisa sempre.',
    default: '0', minimo: 0, messaggio: 'Inserisci un numero di minuti da 0 in su.',
  },
];

// Chiave della formula prezzi (riquadro dedicato) — salvata gia' come
// percentuale vera (es. 60, non 0.6), cosi' il numero nel database e'
// leggibile cosi' com'e', senza bisogno di convertirlo mentalmente.
const CHIAVE_SOGLIA_OCCUPAZIONE = 'soglia_occupazione_pareggio';
const DEFAULT_SOGLIA_OCCUPAZIONE = '50';

export function ImpostazioniScreen() {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [sogliaOccupazione, setSogliaOccupazione] = useState(DEFAULT_SOGLIA_OCCUPAZIONE);
  const [notificaNonScelti, setNotificaNonScelti] = useState(true);
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
        const rigaNotifica = lista.find((r) => r.chiave === 'notifica_fornitori_non_scelti');
        if (rigaNotifica) setNotificaNonScelti(rigaNotifica.valore === 'true');
      })
      .finally(() => setCaricamento(false));
  }, []);

  async function salva(chiave: string) {
    const impostazione = IMPOSTAZIONI.find((i) => i.chiave === chiave)!;
    const testo = (valori[chiave] ?? '').trim();
    const numero = Number(testo);
    if (testo === '' || !Number.isFinite(numero) || numero < impostazione.minimo) {
      notifica(impostazione.messaggio, 'errore');
      return;
    }
    setSalvataggio(chiave);
    try {
      await impostazioniApi.set(chiave, String(numero));
      notifica('Impostazione salvata.', 'successo');
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
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
      notifica('Inserisci una percentuale tra 1 e 100.', 'errore');
      return;
    }
    setSalvataggio(CHIAVE_SOGLIA_OCCUPAZIONE);
    try {
      await impostazioniApi.set(CHIAVE_SOGLIA_OCCUPAZIONE, String(numero));
      notifica('Impostazione salvata.', 'successo');
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvataggio(null);
    }
  }

  // Booleana, salvata subito al clic — non ha senso un pulsante
  // "Salva" a parte per un solo sì/no.
  async function alternaNotificaNonScelti() {
    const nuovo = !notificaNonScelti;
    setNotificaNonScelti(nuovo);
    try {
      await impostazioniApi.set('notifica_fornitori_non_scelti', String(nuovo));
    } catch (e) {
      setNotificaNonScelti(!nuovo); // ripristina se il salvataggio fallisce
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    }
  }

  /** Un riquadro con titolo, spiegazione e il campo numerico. */
  function CampoImpostazione({ i }: { i: (typeof IMPOSTAZIONI)[number] }) {
    return (
      <div className="section-card">
        <p className="section-label" style={{ marginBottom: 4 }}>{i.titolo}</p>
        <p className="testo-secondario" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{i.etichetta}</p>
        <div className="campo" style={{ marginBottom: 10 }}>
          <label htmlFor={`impostazione-${i.chiave}`}>{i.unita}</label>
          <input
            id={`impostazione-${i.chiave}`}
            type="number" min={i.minimo} step="0.01"
            value={valori[i.chiave] ?? i.default}
            onChange={(e) => setValori((v) => ({ ...v, [i.chiave]: e.target.value }))}
          />
        </div>
        <button className="btn btn-ghost" onClick={() => salva(i.chiave)} disabled={salvataggio === i.chiave}>
          {salvataggio === i.chiave ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <PanelHead titolo="Impostazioni" />
      {caricamento ? (
        <p style={{ color: 'var(--mist)' }}>Carico…</p>
      ) : (
        GRUPPI.map((gruppo) => (
          <div key={gruppo.id} style={{ marginBottom: 28 }}>
            <PanelHead titolo={gruppo.titolo} />
            <p className="testo-intro" style={{ marginTop: -6 }}>{gruppo.sottotitolo}</p>
            <div className="griglia-schede">
              {IMPOSTAZIONI.filter((i) => i.gruppo === gruppo.id).map((i) => <CampoImpostazione key={i.chiave} i={i} />)}

              {/* La formula dei prezzi sta con i bus: è lì che si decide
                  il pareggio da cui nascono i prezzi delle fermate. */}
              {gruppo.id === 'viaggi' && (
                <div className="section-card larga" style={{ borderColor: 'var(--blue)' }}>
                  <p className="section-label" style={{ marginBottom: 4 }}>Formula di calcolo prezzi</p>
                  <p className="testo-secondario" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
                    Usata dal pulsante «Calcola prezzi per fermata» (Partenze › Prezzi) per suggerire il prezzo di ogni fermata, partendo dal costo della quotazione:
                    <br />
                    <code style={{ fontSize: 'var(--testo-sm)' }}>Posti di pareggio = Posti bus × Soglia di occupazione</code>
                    <br />
                    <code style={{ fontSize: 'var(--testo-sm)' }}>Prezzo minimo = Costo bus ÷ Posti di pareggio</code>
                    <br />
                    <code style={{ fontSize: 'var(--testo-sm)' }}>Costo al km per persona = Costo bus ÷ km del tragitto ÷ Posti di pareggio</code>
                    <br />
                    <code style={{ fontSize: 'var(--testo-sm)' }}>Prezzo fermata = Prezzo minimo + (Costo al km per persona × km di strada fino all'arrivo)</code>
                    <br />
                    Nessuna fermata scende mai sotto il prezzo minimo; la più lontana paga circa il doppio. La stessa soglia decide quando nasce la proposta di un bus in Da confermare.
                  </p>
                  <div className="campo" style={{ marginBottom: 10 }}>
                    <label htmlFor="soglia-occupazione">Soglia di occupazione assunta per il pareggio (%) — più bassa = prezzi più prudenti/alti</label>
                    <input
                      id="soglia-occupazione"
                      type="number" min={1} max={100} step="1"
                      value={sogliaOccupazione}
                      onChange={(e) => setSogliaOccupazione(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-ghost" onClick={salvaSogliaOccupazione} disabled={salvataggio === CHIAVE_SOGLIA_OCCUPAZIONE}>
                    {salvataggio === CHIAVE_SOGLIA_OCCUPAZIONE ? 'Salvataggio…' : 'Salva'}
                  </button>
                </div>
              )}

              {/* Sì/no dei preventivi: sta con gli altri campi dei fornitori. */}
              {gruppo.id === 'fornitori' && (
                <div className="section-card">
                  <p className="section-label" style={{ marginBottom: 4 }}>Fornitori non scelti</p>
                  <p className="testo-secondario" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
                    Quando confermi un bus con il preventivo di un fornitore, gli altri che avevano risposto ricevono una mail che glielo dice.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={notificaNonScelti} onChange={alternaNotificaNonScelti} style={{ width: 'auto' }} />
                    Avvisa i fornitori non scelti
                  </label>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
