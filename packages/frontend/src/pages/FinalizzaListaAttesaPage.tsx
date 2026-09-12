import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { listaAttesaApi, type DatiFinalizzazione } from '../api/listaAttesa';
import { eventiApi } from '../api/eventi';
import { ErroreApi } from '../api/client';
import type { OpzionePartenza } from '../api/types';
import { Layout } from '../Layout';
import { SceltaFermata } from '../features/checkout/SceltaFermata';
import { formattaDataCard } from '../features/eventi/EventoCard';
import { Icona } from '../features/Icone';
import { formattaEuro, plurale } from '../shared/formato';
import { testoErrore } from '../shared/errori';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'errore' | 'non-trovato';

/** /finalizza/:token — dal link della lista d'attesa: si è liberato un
 *  posto, il cliente sceglie la fermata e conferma. Solo le fermate con
 *  posti: qui non c'è più una lista d'attesa a cui iscriversi. */
export function FinalizzaListaAttesaPage() {
  const { token } = useParams<{ token: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [dati, setDati] = useState<DatiFinalizzazione | null>(null);
  const [opzioni, setOpzioni] = useState<OpzionePartenza[]>([]);
  const [fermataId, setFermataId] = useState('');
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [pnr, setPnr] = useState('');
  const [azioneInCorso, setAzioneInCorso] = useState<'acquista' | 'acconto' | null>(null);
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    if (!token) return;
    setStato('caricamento');
    listaAttesaApi.getByToken(token)
      .then(async (d) => {
        setDati(d);
        const opz = await eventiApi.opzioniPartenza(d.eventoId);
        setOpzioni(opz);
        const preferita = opz.find((o) => o.fermataId === d.fermataId && o.postiDisponibili > 0);
        const primaConPosti = opz.find((o) => o.postiDisponibili > 0);
        setFermataId((preferita ?? primaConPosti)?.fermataId ?? '');
        setStato('pronto');
      })
      .catch((e) => setStato(e instanceof ErroreApi && e.status === 404 ? 'non-trovato' : 'errore'));
  }, [token, tentativo]);

  const disponibili = opzioni.filter((o) => o.postiDisponibili > 0);
  const opzioneScelta = disponibili.find((o) => o.fermataId === fermataId);
  const totale = dati && opzioneScelta ? opzioneScelta.prezzoEffettivo * dati.passeggeri : 0;
  const invio = stato === 'invio';

  async function conferma(tipoPagamento: 'COMPLETO' | 'ACCONTO') {
    if (!token || !opzioneScelta) { setMessaggioErrore('Scegli una fermata di partenza per continuare'); return; }
    setStato('invio');
    setAzioneInCorso(tipoPagamento === 'COMPLETO' ? 'acquista' : 'acconto');
    setMessaggioErrore('');
    try {
      const r = await listaAttesaApi.finalizza(token, {
        tragittoId: opzioneScelta.tragittoId,
        fermataId: opzioneScelta.fermataId,
        tipoPagamento,
        metodoPagamento: 'CARTA',
      });
      setPnr(r.pnr);
      setStato('confermato');
    } catch (e) {
      setMessaggioErrore(testoErrore(e));
      setStato('errore');
      setAzioneInCorso(null);
    }
  }

  return (
    <Layout>
      <main className="container-form pagina-modulo">
        <div className="pagina-modulo-testata">
          <h1>Completa la tua prenotazione</h1>
          {dati && stato !== 'confermato' && <p>Si è liberato un posto: scegli la fermata e conferma.</p>}
        </div>

        {stato === 'caricamento' && <p className="testo-intro" aria-live="polite">Carico la prenotazione…</p>}

        {stato === 'non-trovato' && (
          <div className="stato-vuoto">
            <h3>Link non valido</h3>
            <p>Questo link è scaduto, oppure la prenotazione è già stata completata.</p>
          </div>
        )}

        {!dati && stato === 'errore' && (
          <div className="stato-vuoto" role="alert">
            <h3>Non riesco a caricare la pagina</h3>
            <p>Potrebbe essere un problema temporaneo di connessione.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setTentativo((n) => n + 1)}>Riprova</button>
          </div>
        )}

        {dati && stato !== 'non-trovato' && (
          <div className="pannello-chiaro superficie-chiara">
            {stato === 'confermato' ? (
              <div className="esito">
                <span className="esito-icona" aria-hidden="true"><Icona nome="spunta" dimensione={40} strokeWidth={2.4} /></span>
                <h2>Prenotazione confermata</h2>
                <p>Il tuo codice è <b>{pnr}</b>. Ti abbiamo mandato la conferma a <b>{dati.email}</b>; il biglietto con il numero del bus arriva via email prima della partenza.</p>
              </div>
            ) : (
              <>
                <div className="blocco">
                  <p><b>{dati.artista}</b> · {dati.luogo}, {dati.citta}{dati.data ? ` · ${formattaDataCard(dati.data)}` : ''}</p>
                  <p className="checkout-nota">{dati.nome} {dati.cognome} · {dati.email} · {plurale(dati.passeggeri, 'passeggero', 'passeggeri')}</p>
                </div>

                {disponibili.length === 0 ? (
                  <p className="avviso avviso-attenzione">Purtroppo i posti si sono esauriti di nuovo nel frattempo. Ci scusiamo per il disagio.</p>
                ) : (
                  <>
                    <SceltaFermata opzioni={disponibili} valore={fermataId} onSeleziona={(id) => { setFermataId(id); setMessaggioErrore(''); }} />

                    <div className="blocco">
                      <p className="checkout-nota">Totale per {plurale(dati.passeggeri, 'passeggero', 'passeggeri')}</p>
                      <p className="importo-grande">{formattaEuro(totale)}</p>
                    </div>

                    {messaggioErrore && <p className="campo-errore" role="alert">{messaggioErrore}</p>}
                    <p className="checkout-nota">Non paghi ora online: la prenotazione viene registrata e concordiamo il pagamento con te.</p>

                    <div className="checkout-azioni">
                      <button type="button" className="btn btn-primary btn-lg btn-block" disabled={invio} onClick={() => conferma('COMPLETO')}>
                        {azioneInCorso === 'acquista' ? 'Invio…' : 'Conferma la prenotazione'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-lg btn-block" disabled={invio} onClick={() => conferma('ACCONTO')}>
                        {azioneInCorso === 'acconto' ? 'Invio…' : 'Conferma con acconto'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </Layout>
  );
}
