import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { listaAttesaApi, type DatiFinalizzazione } from '../api/listaAttesa';
import { eventiApi } from '../api/eventi';
import { ErroreApi } from '../api/client';
import type { OpzionePartenza } from '../api/types';
import { Layout } from '../Layout';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'confermato' | 'errore' | 'non-trovato';

export function FinalizzaListaAttesaPage() {
  const { token } = useParams<{ token: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [dati, setDati] = useState<DatiFinalizzazione | null>(null);
  const [opzioni, setOpzioni] = useState<OpzionePartenza[]>([]);
  const [fermataId, setFermataId] = useState('');
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [pnr, setPnr] = useState('');

  useEffect(() => {
    if (!token) return;
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
      .catch(() => setStato('non-trovato'));
  }, [token]);

  const opzioneScelta = opzioni.find((o) => o.fermataId === fermataId);
  const totale = dati && opzioneScelta ? opzioneScelta.prezzoEffettivo * dati.passeggeri : 0;

  async function conferma(tipoPagamento: 'COMPLETO' | 'ACCONTO') {
    if (!token || !opzioneScelta) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      const r = await listaAttesaApi.finalizza(token, {
        lineaId: opzioneScelta.lineaId,
        fermataId: opzioneScelta.fermataId,
        tipoPagamento,
        metodoPagamento: 'CARTA',
      });
      setPnr(r.pnr);
      setStato('confermato');
    } catch (e) {
      setMessaggioErrore(e instanceof ErroreApi ? e.message : 'Errore imprevisto, riprova.');
      setStato('errore');
    }
  }

  return (
    <Layout>
      <div style={{ maxWidth: 480, margin: '60px auto 100px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}

        {stato === 'non-trovato' && (
          <div className="checkout-summary">
            Questo link non è valido, è scaduto, oppure la prenotazione è già stata completata in precedenza.
          </div>
        )}

        {(dati && stato !== 'non-trovato') && (
          <div className="evento-pagina-checkout" style={{ position: 'static' }}>
            {stato === 'confermato' ? (
              <>
                <h3>Prenotazione confermata 🎉</h3>
                <div className="checkout-summary">Il tuo PNR è <b>{pnr}</b>. I biglietti arriveranno all'email <b>{dati.email}</b>.</div>
              </>
            ) : (
              <>
                <h3>Completa la tua prenotazione</h3>
                <p style={{ fontSize: 13.5, color: 'var(--mist)', margin: '0 0 4px' }}>
                  {dati.artista} — {dati.luogo}, {dati.citta}{dati.data ? ` · ${new Date(dati.data).toLocaleDateString('it-IT')}` : ''}
                </p>
                <p style={{ fontSize: 13, color: 'var(--mist)' }}>
                  {dati.nome} {dati.cognome} · {dati.email} · {dati.passeggeri} passeggero/i
                </p>

                {opzioni.filter((o) => o.postiDisponibili > 0).length === 0 ? (
                  <p className="errore">Purtroppo i posti si sono di nuovo esauriti nel frattempo. Ci scusiamo per il disagio.</p>
                ) : (
                  <>
                    <label className="field-label">Fermata di partenza</label>
                    <select value={fermataId} onChange={(e) => setFermataId(e.target.value)}>
                      {opzioni.filter((o) => o.postiDisponibili > 0).map((o) => (
                        <option key={o.fermataId} value={o.fermataId}>
                          {o.fermataCitta} ({o.fermataOrario || 'orario da definire'}) — €{o.prezzoEffettivo.toFixed(2)}
                        </option>
                      ))}
                    </select>

                    <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 24, margin: '18px 0 6px' }}>€{totale.toFixed(2)}</p>

                    {messaggioErrore && <p className="errore">{messaggioErrore}</p>}

                    <button className="search-cta" style={{ opacity: stato === 'invio' ? .5 : 1 }} disabled={stato === 'invio'} onClick={() => conferma('COMPLETO')}>
                      {stato === 'invio' ? 'Invio...' : 'Acquista'}
                    </button>
                    <button className="search-cta-secondaria" style={{ opacity: stato === 'invio' ? .5 : 1 }} disabled={stato === 'invio'} onClick={() => conferma('ACCONTO')}>
                      {stato === 'invio' ? 'Invio...' : 'Prenota con acconto'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
