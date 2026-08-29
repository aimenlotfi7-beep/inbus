import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { prenotazioniApi, type DifferenzaSaldo } from '../api/prenotazioni';
import { ErroreApi } from '../api/client';
import { Layout } from '../Layout';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'completato' | 'non-trovato';

export function CompletaSaldoPage() {
  const { pnr } = useParams<{ pnr: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [dati, setDati] = useState<DifferenzaSaldo | null>(null);
  const [messaggioErrore, setMessaggioErrore] = useState('');

  useEffect(() => {
    if (!pnr) return;
    prenotazioniApi.getSaldo(pnr)
      .then((d) => { setDati(d); setStato(d.saldoPagato ? 'completato' : 'pronto'); })
      .catch(() => setStato('non-trovato'));
  }, [pnr]);

  async function salda() {
    if (!pnr) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      await prenotazioniApi.saldaResto(pnr);
      setStato('completato');
    } catch (e) {
      setMessaggioErrore(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
      setStato('pronto');
    }
  }

  return (
    <Layout>
      <div style={{ maxWidth: 480, margin: '60px auto 100px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">Prenotazione non trovata. Controlla il link ricevuto via email.</div>
        )}

        {(dati && (stato === 'completato' || stato === 'pronto' || stato === 'invio')) && (
          <div className="evento-pagina-checkout" style={{ position: 'static' }}>
            {stato === 'completato' ? (
              <>
                <h3>Saldo completato ✓</h3>
                <div className="checkout-summary">La tua prenotazione <b>{dati.pnr}</b> per <b>{dati.artista}</b> è saldata per intero. A presto!</div>
              </>
            ) : (
              <>
                <h3>Completa il saldo</h3>
                <p style={{ fontSize: 13.5, color: 'var(--mist)', margin: '0 0 4px' }}>
                  {dati.artista} — prenotazione <b>{dati.pnr}</b>
                  {dati.dataEvento ? ` · partenza ${new Date(dati.dataEvento).toLocaleDateString('it-IT')}` : ''}
                </p>
                <p style={{ fontSize: 13, color: 'var(--mist)' }}>
                  Acconto già versato: €{dati.accontoVersato.toFixed(2)} su un totale di €{dati.totaleReale.toFixed(2)}.
                </p>
                <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 24, margin: '18px 0 6px' }}>
                  Da saldare: €{dati.differenza.toFixed(2)}
                </p>

                {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

                <button className="search-cta" style={{ opacity: stato === 'invio' ? .5 : 1 }} disabled={stato === 'invio'} onClick={salda}>
                  {stato === 'invio' ? 'Elaborazione...' : 'Salda ora'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
