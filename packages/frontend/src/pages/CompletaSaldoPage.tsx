import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { prenotazioniApi, type DifferenzaSaldo } from '../api/prenotazioni';
import { ErroreApi } from '../api/client';
import { Layout } from '../Layout';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { formattaDataCard } from '../features/eventi/EventoCard';
import { Icona } from '../features/Icone';
import { formattaEuro } from '../shared/formato';
import { MESSAGGIO_CONNESSIONE, testoErrore } from '../shared/errori';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type Stato = 'caricamento' | 'chiedi-email' | 'pronto' | 'invio' | 'completato' | 'non-trovato' | 'errore';

/** /completa-saldo/:pnr — dal link nell'email: chi ha prenotato con
 *  l'acconto salda il resto (eventualmente con un codice sconto). */
export function CompletaSaldoPage() {
  const { pnr } = useParams<{ pnr: string }>();
  const [searchParams] = useSearchParams();
  // I link recenti portano già l'email (prova di proprietà: il link
  // arriva solo nell'inbox del titolare). Per quelli vecchi si chiede.
  const emailDaLink = searchParams.get('email');
  const [email, setEmail] = useState(emailDaLink ?? '');
  const [emailDigitata, setEmailDigitata] = useState('');
  const [stato, setStato] = useState<Stato>(emailDaLink ? 'caricamento' : 'chiedi-email');
  const [dati, setDati] = useState<DifferenzaSaldo | null>(null);
  const [messaggioErrore, setMessaggioErrore] = useState('');
  const [tentativo, setTentativo] = useState(0);
  const [couponCodice, setCouponCodice] = useState('');
  const [couponVerificato, setCouponVerificato] = useState<{ sconto: number } | null>(null);
  const [couponErrore, setCouponErrore] = useState('');
  const [verificandoCoupon, setVerificandoCoupon] = useState(false);

  useEffect(() => {
    if (!pnr || !email) return;
    setStato('caricamento');
    prenotazioniApi.getSaldo(pnr, email)
      .then((d) => { setDati(d); setStato(d.saldoPagato ? 'completato' : 'pronto'); })
      .catch((e) => setStato(e instanceof ErroreApi && e.status === 404 ? 'non-trovato' : 'errore'));
  }, [pnr, email, tentativo]);

  function confermaEmail() {
    if (!emailDigitata.trim()) return;
    setEmail(emailDigitata.trim());
  }

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
      if (!r.ok) throw new Error(d.errore ?? 'Codice non valido.');
      setCouponVerificato(d);
    } catch (e) {
      setCouponErrore(e instanceof TypeError ? MESSAGGIO_CONNESSIONE : e instanceof Error ? e.message : 'Codice non valido.');
    } finally {
      setVerificandoCoupon(false);
    }
  }

  async function salda() {
    if (!pnr || !email) return;
    setStato('invio');
    setMessaggioErrore('');
    try {
      await prenotazioniApi.saldaResto(pnr, email, couponVerificato ? couponCodice.trim() : undefined);
      setStato('completato');
    } catch (e) {
      setMessaggioErrore(testoErrore(e));
      setStato('pronto');
    }
  }

  const daSaldare = dati ? (couponVerificato ? Math.max(0, dati.differenza - couponVerificato.sconto) : dati.differenza) : 0;
  const invio = stato === 'invio';

  return (
    <Layout>
      <main className="container-form pagina-modulo">
        <div className="pagina-modulo-testata">
          <h1>Completa il saldo</h1>
          {dati && stato !== 'completato' && <p>{dati.artista} · prenotazione {dati.pnr}</p>}
        </div>

        {stato === 'caricamento' && <p className="testo-intro" aria-live="polite">Carico la prenotazione…</p>}

        {stato === 'non-trovato' && (
          <div className="stato-vuoto">
            <h3>Prenotazione non trovata</h3>
            <p>Controlla il link ricevuto via email: deve essere aperto per intero.</p>
          </div>
        )}

        {stato === 'errore' && (
          <div className="stato-vuoto" role="alert">
            <h3>Non riesco a caricare la prenotazione</h3>
            <p>Potrebbe essere un problema temporaneo di connessione.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setTentativo((n) => n + 1)}>Riprova</button>
          </div>
        )}

        {stato === 'chiedi-email' && (
          <form className="pannello-chiaro superficie-chiara" onSubmit={(e) => { e.preventDefault(); confermaEmail(); }}>
            <p className="checkout-nota">Per sicurezza, conferma l'indirizzo email con cui hai prenotato.</p>
            <CampoTesto
              id="saldo-email" etichetta="Email" type="email" autoComplete="email" inputMode="email" required
              value={emailDigitata} onChange={(e) => setEmailDigitata(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!emailDigitata.trim()}>Continua</button>
          </form>
        )}

        {dati && (stato === 'completato' || stato === 'pronto' || stato === 'invio') && (
          <div className="pannello-chiaro superficie-chiara">
            {stato === 'completato' ? (
              <div className="esito">
                <span className="esito-icona" aria-hidden="true"><Icona nome="spunta" dimensione={40} strokeWidth={2.4} /></span>
                <h1>Saldo completato</h1>
                <p>La prenotazione <b>{dati.pnr}</b> per <b>{dati.artista}</b> è saldata per intero. A presto!</p>
              </div>
            ) : (
              <>
                <div className="blocco">
                  <p><b>{dati.artista}</b>{dati.dataEvento ? ` · ${formattaDataCard(dati.dataEvento)}` : ''}</p>
                  <p className="checkout-nota">Acconto già versato: {formattaEuro(dati.accontoVersato)} su un totale di {formattaEuro(dati.totaleReale)}.</p>
                </div>
                <div className="blocco">
                  <p className="checkout-nota">Da saldare</p>
                  <p className="importo-grande">{formattaEuro(daSaldare)}</p>
                </div>

                <div className="campo">
                  <label className="campo-etichetta" htmlFor="saldo-coupon">Codice sconto (facoltativo)</label>
                  <div className="coupon-riga">
                    <input
                      id="saldo-coupon" className="campo-input" type="text" autoComplete="off"
                      value={couponCodice}
                      onChange={(e) => { setCouponCodice(e.target.value.toUpperCase()); setCouponVerificato(null); setCouponErrore(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), verificaCoupon())}
                      disabled={!!couponVerificato}
                      aria-invalid={couponErrore ? true : undefined}
                      aria-describedby={couponErrore ? 'saldo-coupon-errore' : undefined}
                    />
                    <button type="button" className="btn btn-secondary" onClick={verificaCoupon} disabled={!couponCodice.trim() || verificandoCoupon || !!couponVerificato}>
                      {verificandoCoupon ? 'Verifico…' : couponVerificato ? <><Icona nome="spunta" dimensione={16} /> Applicato</> : 'Applica'}
                    </button>
                  </div>
                  {couponErrore && <p className="campo-errore" id="saldo-coupon-errore" role="alert">{couponErrore}</p>}
                  {couponVerificato && <p className="campo-aiuto">Sconto applicato: −{formattaEuro(couponVerificato.sconto)}.</p>}
                </div>

                {messaggioErrore && <p className="campo-errore" role="alert">{messaggioErrore}</p>}

                <button type="button" className="btn btn-primary btn-lg btn-block" disabled={invio} onClick={salda}>
                  {invio ? 'Invio…' : `Salda ora · ${formattaEuro(daSaldare)}`}
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </Layout>
  );
}
