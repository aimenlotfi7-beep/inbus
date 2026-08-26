import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { clienteAuthApi, type DatiCliente } from '../api/clienteAuth';
import { prenotazioniApi } from '../api/prenotazioni';
import { clienteLoggato } from '../features/clienteSessione';

/** Il carrello — stessa identica veste grafica del checkout esistente
 *  (.checkout-form per etichette/campi, .checkout-summary per i box di
 *  riepilogo: niente stile nuovo inventato, niente ".ticket" che è
 *  pensato per un contesto diverso e qui stonava). Elenco articoli già
 *  compilati nella tab di prenotazione, e in fondo solo l'ultimo pezzo
 *  che prima stava nello step 3 del checkout: credito, coupon, metodo
 *  di pagamento. */
export function CarrelloPage() {
  const { articoli, rimuovi, svuota, totaleStimato } = useCarrello();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<DatiCliente | null>(null);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState<{ pnr: string }[] | null>(null);

  const [tipoPagamento, setTipoPagamento] = useState<'COMPLETO' | 'ACCONTO'>('COMPLETO');
  const [usaCredito, setUsaCredito] = useState(false);
  const [couponCodice, setCouponCodice] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState<'carta' | 'apple' | 'google'>('carta');

  useEffect(() => {
    if (clienteLoggato()) clienteAuthApi.me().then(setCliente).catch(() => {});
  }, []);

  const creditoDisponibile = cliente ? Number(cliente.creditoDisponibile) : 0;

  async function completaAcquisto() {
    if (!clienteLoggato()) {
      navigate('/accedi?dopo=/carrello');
      return;
    }
    if (!cliente) return;
    setInviando(true);
    setErrore('');
    try {
      const risultato = await prenotazioniApi.creaOrdine(
        articoli.map((a) => ({
          eventoId: a.eventoId,
          tragittoId: a.tragittoId,
          fermataId: a.fermataId,
          passeggeri: a.passeggeri,
          tipoPagamento,
          metodoPagamento: 'CARTA' as const,
          cliente: a.cliente,
          partecipanti: a.partecipanti,
          offertaId: a.offertaId,
          ...(usaCredito && tipoPagamento === 'COMPLETO' && { usaCredito: true }),
          ...(couponCodice.trim() && tipoPagamento === 'COMPLETO' && { couponCodice: couponCodice.trim() }),
        }))
      );
      setFatto(risultato.prenotazioni.map((p) => ({ pnr: p.pnr })));
      svuota();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Acquisto non riuscito. Riprova.');
    } finally {
      setInviando(false);
    }
  }

  if (fatto) {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h3>Ordine completato 🎉</h3>
        <div className="checkout-summary">
          Hai prenotato {fatto.length} biglietto{fatto.length === 1 ? '' : 'i'} — trovi tutto nel tuo account, con i PDF pronti da scaricare.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
          <Link className="btn btn-primary" to="/account">Vai ai miei biglietti</Link>
          <Link className="btn btn-ghost" to="/">Torna al sito</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 20px' }}>
      <div className="checkout-form">
        <h3>Il tuo carrello</h3>

        {articoli.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <p style={{ color: 'var(--mist)', marginBottom: 16 }}>Il carrello è vuoto.</p>
            <Link className="btn btn-primary" to="/#eventi">Scopri gli eventi</Link>
          </div>
        )}

        {articoli.length > 0 && (
          <>
            {articoli.map((a) => (
              <div key={a.id} className="checkout-summary" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <b>{a.eventoArtista}</b>
                  <p style={{ margin: '4px 0 0' }}>
                    {a.fermataCitta}{a.fermataOrario ? ` — ore ${a.fermataOrario}` : ''} · {new Date(a.eventoData).toLocaleDateString('it-IT')}
                  </p>
                  <p style={{ margin: '4px 0 0' }}>
                    {a.passeggeri} passeggero{a.passeggeri > 1 ? 'i' : ''}: {a.cliente.nome} {a.cliente.cognome}
                    {a.partecipanti.length > 0 && `, ${a.partecipanti.map((p) => `${p.nome} ${p.cognome}`).join(', ')}`}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <b>€{(a.prezzoStimato * a.passeggeri).toFixed(2)}</b>
                  <button type="button" className="search-cta-secondaria" style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: 11, color: '#c0392b' }} onClick={() => rimuovi(a.id)}>
                    Rimuovi
                  </button>
                </div>
              </div>
            ))}

            {!clienteLoggato() ? (
              <div className="checkout-summary">
                <Link to="/accedi?dopo=/carrello" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Accedi o registrati</Link> per completare l'acquisto.
              </div>
            ) : (
              <>
                {creditoDisponibile > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '10px 0', cursor: tipoPagamento === 'COMPLETO' ? 'pointer' : 'default', opacity: tipoPagamento === 'COMPLETO' ? 1 : .5 }}>
                    <input type="checkbox" checked={usaCredito} onChange={(e) => setUsaCredito(e.target.checked)} style={{ width: 'auto' }} disabled={tipoPagamento !== 'COMPLETO'} />
                    Usa il tuo credito fedeltà (€{creditoDisponibile.toFixed(2)} disponibili)
                  </label>
                )}

                <label className="field-label">Hai un codice coupon?</label>
                <input
                  type="text"
                  value={couponCodice}
                  onChange={(e) => setCouponCodice(e.target.value.toUpperCase())}
                  placeholder="Facoltativo"
                  style={{ textTransform: 'uppercase', opacity: tipoPagamento === 'COMPLETO' ? 1 : .5 }}
                  disabled={tipoPagamento !== 'COMPLETO'}
                />
                <p style={{ fontSize: 11.5, opacity: .65, marginTop: 6 }}>
                  Coupon e credito si applicano solo pagando tutto subito — con l'acconto potrai usarli quando salderai il resto.
                </p>

                <p className="section-label" style={{ marginTop: 18 }}>Come vuoi pagare?</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <button type="button" className={`mini-tab${tipoPagamento === 'COMPLETO' ? ' active' : ''}`} onClick={() => setTipoPagamento('COMPLETO')}>Tutto subito</button>
                  <button type="button" className={`mini-tab${tipoPagamento === 'ACCONTO' ? ' active' : ''}`} onClick={() => setTipoPagamento('ACCONTO')}>Solo acconto</button>
                </div>
                {tipoPagamento === 'ACCONTO' && (
                  <p style={{ fontSize: 11.5, opacity: .7, marginTop: 6 }}>
                    Verserai solo l'acconto per ciascun articolo ora, e salderai il resto entro la scadenza indicata via email.
                  </p>
                )}

                <p className="section-label" style={{ marginTop: 18 }}>Metodo di pagamento</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button type="button" className={`mini-tab${metodoPagamento === 'carta' ? ' active' : ''}`} onClick={() => setMetodoPagamento('carta')}>💳 Carta</button>
                  <button type="button" className={`mini-tab${metodoPagamento === 'apple' ? ' active' : ''}`} onClick={() => setMetodoPagamento('apple')}> Apple Pay</button>
                  <button type="button" className={`mini-tab${metodoPagamento === 'google' ? ' active' : ''}`} onClick={() => setMetodoPagamento('google')}>G Pay</button>
                </div>
                {metodoPagamento === 'carta' && (
                  <div style={{ marginBottom: 4 }}>
                    <label className="field-label">Numero carta</label>
                    <input type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" autoComplete="cc-number" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      <div>
                        <label className="field-label">Scadenza</label>
                        <input type="text" placeholder="MM/AA" autoComplete="cc-exp" />
                      </div>
                      <div>
                        <label className="field-label">CVV</label>
                        <input type="text" inputMode="numeric" placeholder="123" autoComplete="cc-csc" />
                      </div>
                    </div>
                  </div>
                )}
                {metodoPagamento !== 'carta' && (
                  <p style={{ fontSize: 13, opacity: .7 }}>
                    Al momento di completare l'ordine ti verrà mostrata la richiesta di conferma di {metodoPagamento === 'apple' ? 'Apple Pay' : 'Google Pay'}.
                  </p>
                )}
              </>
            )}

            <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 22, margin: '18px 0 6px' }}>
              Totale stimato: €{totaleStimato.toFixed(2)}
            </p>
            <p style={{ fontSize: 11, opacity: .65, marginTop: -4 }}>
              Il totale definitivo (con coupon/credito applicati) viene sempre ricalcolato dal server al momento di completare l'ordine.
            </p>

            {errore && <p className="errore">{errore}</p>}

            <button className="search-cta" style={{ marginTop: 10, opacity: inviando ? .5 : 1 }} disabled={inviando} onClick={completaAcquisto}>
              {inviando ? 'Invio...' : !clienteLoggato() ? 'Accedi per continuare' : 'Completa l\'acquisto'}
            </button>
            <p style={{ fontSize: 11, opacity: .6, marginTop: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              🔒 I tuoi dati sono trattati in modo riservato, secondo la nostra informativa privacy.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
