import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { clienteAuthApi, type DatiCliente } from '../api/clienteAuth';
import { prenotazioniApi } from '../api/prenotazioni';
import { clienteLoggato } from '../features/clienteSessione';

/** Il carrello — elenco degli articoli già compilati nella tab di
 *  prenotazione (fermata, passeggeri con nomi veri, dati richiedente
 *  già raccolti lì), e qui SOLO l'ultimo pezzo che prima stava nello
 *  step 3 del checkout: credito, coupon, metodo di pagamento. Un
 *  acquisto solo, anche con più eventi diversi nel carrello — il
 *  server valida e crea tutto in un'unica transazione atomica. */
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
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24 }}>🎉 Ordine completato!</h1>
        <p style={{ color: 'var(--mist)', marginBottom: 20 }}>
          Hai prenotato {fatto.length} biglietto{fatto.length === 1 ? '' : 'i'} — trovi tutto nel tuo account, con i PDF pronti da scaricare.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/account">Vai ai miei biglietti</Link>
          <Link className="btn btn-ghost" to="/">Torna al sito</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Il tuo carrello</h1>

      {articoli.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ color: 'var(--mist)', marginBottom: 16 }}>Il carrello è vuoto.</p>
          <Link className="btn btn-primary" to="/#eventi">Scopri gli eventi</Link>
        </div>
      )}

      {articoli.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {articoli.map((a) => (
              <div key={a.id} className="ticket" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <b>{a.eventoArtista}</b>
                  <p style={{ fontSize: 13, color: 'var(--mist)', margin: '4px 0 0' }}>
                    {a.fermataCitta}{a.fermataOrario ? ` · ore ${a.fermataOrario}` : ''} · {new Date(a.eventoData).toLocaleDateString('it-IT')}
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--mist)', margin: '4px 0 0' }}>
                    {a.passeggeri} passeggero{a.passeggeri > 1 ? 'i' : ''}: {a.cliente.nome} {a.cliente.cognome}
                    {a.partecipanti.length > 0 && `, ${a.partecipanti.map((p) => `${p.nome} ${p.cognome}`).join(', ')}`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <b style={{ minWidth: 70, textAlign: 'right' }}>€{(a.prezzoStimato * a.passeggeri).toFixed(2)}</b>
                  <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)' }} onClick={() => rimuovi(a.id)} aria-label="Rimuovi">✕</button>
                </div>
              </div>
            ))}
          </div>

          {!clienteLoggato() ? (
            <p style={{ fontSize: 13.5, marginBottom: 16 }}>
              <Link to="/accedi?dopo=/carrello" style={{ textDecoration: 'underline' }}>Accedi o registrati</Link> per completare l'acquisto.
            </p>
          ) : (
            <div className="ticket" style={{ marginBottom: 20 }}>
              {creditoDisponibile > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '0 0 14px', cursor: 'pointer' }}>
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
                style={{ textTransform: 'uppercase', marginBottom: 4 }}
                disabled={tipoPagamento !== 'COMPLETO'}
              />
              <p style={{ fontSize: 11.5, opacity: .65, marginBottom: 14 }}>
                Il coupon si applica solo pagando tutto subito — controllato al momento di completare l'ordine. Se qualche articolo appartiene a un evento diverso, deve valere per ciascuno.
              </p>

              <p className="section-label" style={{ marginBottom: 8 }}>Come vuoi pagare?</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button type="button" className={`mini-tab${tipoPagamento === 'COMPLETO' ? ' active' : ''}`} onClick={() => setTipoPagamento('COMPLETO')}>Tutto subito</button>
                <button type="button" className={`mini-tab${tipoPagamento === 'ACCONTO' ? ' active' : ''}`} onClick={() => setTipoPagamento('ACCONTO')}>Solo acconto</button>
              </div>
              {tipoPagamento === 'ACCONTO' && (
                <p style={{ fontSize: 11.5, opacity: .7, marginBottom: 14 }}>
                  Verserai solo l'acconto per ciascun articolo ora, e salderai il resto entro la scadenza indicata via email — coupon e credito non si applicano all'acconto.
                </p>
              )}

              <p className="section-label" style={{ marginBottom: 8 }}>Metodo di pagamento</p>
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
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid var(--line)', marginBottom: 16 }}>
            <span>Totale stimato</span>
            <b style={{ fontSize: 20 }}>€{totaleStimato.toFixed(2)}</b>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 16 }}>
            Il totale definitivo (con coupon/credito applicati) viene sempre ricalcolato dal server al momento di completare l'ordine.
          </p>

          {errore && <p className="errore" style={{ marginBottom: 12 }}>{errore}</p>}

          <button type="button" className="search-cta" onClick={completaAcquisto} disabled={inviando}>
            {inviando ? 'Sto elaborando...' : !clienteLoggato() ? 'Accedi per continuare' : 'Completa l\'acquisto'}
          </button>
          <p style={{ fontSize: 11, opacity: .6, marginTop: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            🔒 I tuoi dati sono trattati in modo riservato, secondo la nostra informativa privacy.
          </p>
        </>
      )}
    </div>
  );
}
