import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { prenotazioniApi, type DifferenzaSaldo } from '../api/prenotazioni';
import { ErroreApi } from '../api/client';
import { Layout } from '../Layout';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type Stato = 'caricamento' | 'pronto' | 'invio' | 'completato' | 'non-trovato';

export function CompletaSaldoPage() {
  const { pnr } = useParams<{ pnr: string }>();
  const [stato, setStato] = useState<Stato>('caricamento');
  const [dati, setDati] = useState<DifferenzaSaldo | null>(null);
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [couponCodice, setCouponCodice] = useState('');
  const [couponVerificato, setCouponVerificato] = useState<{ sconto: number } | null>(null);
  const [couponErrore, setCouponErrore] = useState('');
  const [verificandoCoupon, setVerificandoCoupon] = useState(false);

  useEffect(() => {
    if (!pnr) return;
    prenotazioniApi.getSaldo(pnr)
      .then((d) => { setDati(d); setStato(d.saldoPagato ? 'completato' : 'pronto'); })
      .catch(() => setStato('non-trovato'));
  }, [pnr]);

  async function verificaCoupon() {
    if (!couponCodice.trim() || !dati) return;
    setVerificandoCoupon(true);
    setCouponErrore('');
    setCouponVerificato(null);
    try {
      const r = await fetch(`${API_URL}/api/coupon/valida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice: couponCodice.trim(), importo: dati.totaleReale, eventoId: dati.eventoId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errore ?? 'Coupon non valido.');
      setCouponVerificato(d);
    } catch (e) {
      setCouponErrore(e instanceof Error ? e.message : 'Coupon non valido.');
    } finally {
      setVerificandoCoupon(false);
    }
  }

  async function salda() {
    if (!pnr) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      await prenotazioniApi.saldaResto(pnr, couponVerificato ? couponCodice.trim() : undefined);
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
                  Da saldare: €{(couponVerificato ? Math.max(0, dati.differenza - couponVerificato.sconto) : dati.differenza).toFixed(2)}
                </p>

                <div style={{ margin: '14px 0' }}>
                  <label className="field-label">Hai un codice coupon?</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={couponCodice}
                      onChange={(e) => { setCouponCodice(e.target.value.toUpperCase()); setCouponVerificato(null); setCouponErrore(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), verificaCoupon())}
                      placeholder="Facoltativo"
                      style={{ textTransform: 'uppercase', flex: 1 }}
                      disabled={!!couponVerificato}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ whiteSpace: 'nowrap' }}
                      onClick={verificaCoupon}
                      disabled={!couponCodice.trim() || verificandoCoupon || !!couponVerificato}
                    >
                      {verificandoCoupon ? '...' : couponVerificato ? '✓ Applicato' : 'Applica'}
                    </button>
                  </div>
                  {couponErrore && <p style={{ color: '#c0392b', fontSize: 12, marginTop: 6 }}>{couponErrore}</p>}
                  {couponVerificato && <p style={{ fontSize: 13, marginTop: 6 }}>Sconto applicato: <b>-€{couponVerificato.sconto.toFixed(2)}</b></p>}
                </div>

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
