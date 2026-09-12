import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { variazioniApi, type InfoVariazione } from '../api/variazioni';
import { ErroreApi } from '../api/client';
import { Layout } from '../Layout';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'fatto' | 'non-trovato' | 'errore';

/** Pagina pubblica aperta dal link nella mail di variazione — nessun
 *  login, il token stesso fa da autenticazione (come /finalizza/:token). */
export function VariazionePage() {
  const { token } = useParams<{ token: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [dati, setDati] = useState<InfoVariazione | null>(null);
  const [rispostaScelta, setRispostaScelta] = useState<'ACCETTATA' | 'RIMBORSO_RICHIESTO' | null>(null);
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    if (!token) return;
    setStato('caricamento');
    variazioniApi.getByToken(token)
      .then((d) => { setDati(d); setStato(d.giaRisposto ? 'fatto' : 'pronto'); })
      .catch((e) => setStato(e instanceof ErroreApi && e.status === 404 ? 'non-trovato' : 'errore'));
  }, [token, tentativo]);

  async function rispondi(risposta: 'ACCETTATA' | 'RIMBORSO_RICHIESTO') {
    if (!token) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      await variazioniApi.rispondi(token, risposta);
      setRispostaScelta(risposta);
      setStato('fatto');
    } catch (e) {
      setMessaggioErrore(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
      setStato('pronto');
    }
  }

  const invio = stato === 'invio';

  return (
    <Layout>
      <div className="container-form pagina-modulo">
        <div className="pagina-modulo-testata">
          <h1>Una variazione al tuo viaggio</h1>
          {dati && <p>Prenotazione {dati.pnr}</p>}
        </div>

        {stato === 'caricamento' && <p className="testo-intro" aria-live="polite">Carico…</p>}

        {stato === 'non-trovato' && (
          <div className="stato-vuoto">
            <h3>Link non valido</h3>
            <p>Questo link non è valido, o si riferisce a una prenotazione che non esiste più.</p>
          </div>
        )}

        {stato === 'errore' && (
          <div className="stato-vuoto" role="alert">
            <h3>Non riesco a caricare la pagina</h3>
            <p>Potrebbe essere un problema temporaneo di connessione.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setTentativo((n) => n + 1)}>Riprova</button>
          </div>
        )}

        {dati && stato !== 'non-trovato' && stato !== 'errore' && (
          <div className="pannello-chiaro superficie-chiara">
            <p className="avviso avviso-neutro">{dati.descrizione}</p>

            {stato === 'fatto' ? (
              <p className="avviso avviso-ok">
                {(rispostaScelta ?? dati.giaRisposto) === 'RIMBORSO_RICHIESTO'
                  ? 'Hai richiesto il rimborso: riceverai un\'email di conferma appena verrà elaborato.'
                  : 'Grazie, la tua prenotazione resta confermata così com\'è.'}
              </p>
            ) : (
              <>
                <p className="checkout-nota">
                  Se va bene così non devi fare nulla: puoi anche chiudere questa pagina, la prenotazione resta confermata.
                  Se invece preferisci il rimborso, scegli qui sotto.
                </p>
                {messaggioErrore && <p className="campo-errore" role="alert">{messaggioErrore}</p>}
                <div className="checkout-azioni">
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={invio} onClick={() => rispondi('ACCETTATA')}>
                    {invio ? 'Invio…' : 'Va bene così'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-lg btn-block" disabled={invio} onClick={() => rispondi('RIMBORSO_RICHIESTO')}>
                    Voglio il rimborso
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
