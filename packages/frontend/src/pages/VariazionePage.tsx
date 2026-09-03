import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { variazioniApi, type InfoVariazione } from '../api/variazioni';
import { ErroreApi } from '../api/client';
import { Layout } from '../Layout';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'fatto' | 'non-trovato' | 'errore';

/** Pagina pubblica aperta dal link nella mail di variazione — nessun
 *  login, il token stesso fa da autenticazione (stesso schema già
 *  usato per "/finalizza/:token" della lista d'attesa). */
export function VariazionePage() {
  const { token } = useParams<{ token: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [dati, setDati] = useState<InfoVariazione | null>(null);
  const [rispostaScelta, setRispostaScelta] = useState<'ACCETTATA' | 'RIMBORSO_RICHIESTO' | null>(null);

  useEffect(() => {
    if (!token) return;
    variazioniApi.getByToken(token)
      .then((d) => { setDati(d); setStato(d.giaRisposto ? 'fatto' : 'pronto'); })
      .catch((e) => setStato(e instanceof ErroreApi && e.status === 404 ? 'non-trovato' : 'errore'));
  }, [token]);

  async function rispondi(risposta: 'ACCETTATA' | 'RIMBORSO_RICHIESTO') {
    if (!token) return;
    setStato('invio');
    try {
      await variazioniApi.rispondi(token, risposta);
      setRispostaScelta(risposta);
      setStato('fatto');
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
      setStato('pronto');
    }
  }

  return (
    <Layout>
      <div style={{ maxWidth: 480, margin: '60px auto 100px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">
            Questo link non è valido, o si riferisce a una prenotazione che non esiste più.
          </div>
        )}

        {stato === 'errore' && (
          <div className="checkout-summary">
            Non riusciamo a caricare questa pagina in questo momento — potrebbe essere un problema temporaneo di connessione. <a href="" onClick={(e) => { e.preventDefault(); window.location.reload(); }}>Riprova</a>.
          </div>
        )}

        {dati && stato !== 'non-trovato' && stato !== 'errore' && (
          <div className="evento-pagina-checkout" style={{ position: 'static' }}>
            <h3>Una variazione al tuo viaggio</h3>
            <p style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>PNR {dati.pnr}</p>
            <p className="checkout-summary" style={{ marginBottom: 20 }}>{dati.descrizione}</p>

            {stato === 'fatto' ? (
              <p className="checkout-summary">
                {(rispostaScelta ?? dati.giaRisposto) === 'RIMBORSO_RICHIESTO'
                  ? 'Hai richiesto il rimborso — lo riceverai un\'email di conferma appena verrà elaborato.'
                  : 'Grazie — la tua prenotazione resta confermata così com\'è.'}
              </p>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: 'var(--mist)', marginBottom: 16 }}>
                  Se va bene così, non devi fare nulla — puoi anche chiudere questa pagina, la tua prenotazione resta confermata automaticamente. Se invece preferisci il rimborso, scegli qui sotto.
                </p>
                <button className="search-cta" style={{ opacity: stato === 'invio' ? .5 : 1 }} disabled={stato === 'invio'} onClick={() => rispondi('ACCETTATA')}>
                  Va bene così
                </button>
                <button className="search-cta-secondaria" style={{ opacity: stato === 'invio' ? .5 : 1 }} disabled={stato === 'invio'} onClick={() => rispondi('RIMBORSO_RICHIESTO')}>
                  Voglio il rimborso
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
