import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { prenotazioniApi, type DifferenzaSaldo } from '../api/prenotazioni';
import { ErroreApi } from '../api/client';

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
    <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px' }}>
      {stato === 'caricamento' && <p>Carico...</p>}

      {stato === 'non-trovato' && (
        <div className="checkout-summary">Prenotazione non trovata. Controlla il link ricevuto via email.</div>
      )}

      {dati && stato === 'completato' && (
        <>
          <h1 style={{ fontFamily: "'Anton',sans-serif", textTransform: 'uppercase' }}>Saldo completato ✓</h1>
          <div className="checkout-summary">La tua prenotazione <b>{dati.pnr}</b> per <b>{dati.artista}</b> è saldata per intero.</div>
        </>
      )}

      {dati && (stato === 'pronto' || stato === 'invio') && (
        <>
          <h1 style={{ fontFamily: "'Anton',sans-serif", textTransform: 'uppercase' }}>Completa il saldo</h1>
          <div className="checkout-summary">
            {dati.artista} — prenotazione <b>{dati.pnr}</b>
            {dati.dataEvento ? ` · partenza ${new Date(dati.dataEvento).toLocaleDateString('it-IT')}` : ''}
          </div>
          <p style={{ fontSize: 13, opacity: .8 }}>Acconto già versato: €{dati.accontoVersato.toFixed(2)} su un totale di €{dati.totaleReale.toFixed(2)}.</p>
          <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '18px 0 6px' }}>Da saldare: €{dati.differenza.toFixed(2)}</p>

          {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

          <button className="search-cta" style={{ opacity: stato === 'invio' ? .5 : 1 }} disabled={stato === 'invio'} onClick={salda}>
            {stato === 'invio' ? 'Elaborazione...' : 'Salda ora'}
          </button>
        </>
      )}
    </div>
  );
}
