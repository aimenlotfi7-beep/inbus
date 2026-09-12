import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCarrello, type ArticoloCarrello } from '../features/carrello/CarrelloContext';
import { tracciaAcquisto, leggiCookieMeta } from '../features/metaPixel';
import { tracciaAcquistoGA4, tracciaAcquistoGoogleAds } from '../features/googleAnalytics';
import { clienteAuthApi, type DatiCliente } from '../api/clienteAuth';
import { prenotazioniApi } from '../api/prenotazioni';
import { clienteLoggato } from '../features/clienteSessione';
import { ErroreApi } from '../api/client';
import { useSeoTags } from '../features/useSeoTags';
import { Stepper } from '../features/checkout/Stepper';
import { ACCONTO_PREDEFINITO_EUR } from '../features/checkout/CheckoutForm';
import { formattaDataCard, inizialiDi } from '../features/eventi/EventoCard';
import { Icona } from '../features/Icone';
import { formattaData, formattaEuro, plurale } from '../shared/formato';
import { MESSAGGIO_CONNESSIONE, testoErrore } from '../shared/errori';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
/** Giorni prima della partenza entro cui va saldato il resto — stesso
 *  default del server (GIORNI_SCADENZA_SALDO). Solo per mostrare la
 *  data: la scadenza vera la scrive il server sulla prenotazione. */
const GIORNI_SCADENZA_SALDO = 15;

/** La scadenza del saldo più vicina tra gli articoli, se è nel futuro. */
function scadenzaSaldo(articoli: ArticoloCarrello[]): Date | null {
  const tempi = articoli
    .map((a) => new Date(a.eventoData).getTime() - GIORNI_SCADENZA_SALDO * 24 * 3600 * 1000)
    .filter((t) => Number.isFinite(t));
  if (!tempi.length) return null;
  const prima = Math.min(...tempi);
  return prima > Date.now() ? new Date(prima) : null;
}

interface Esito { righe: { pnr: string; artista: string }[]; email: string; ospite: boolean; passeggeri: number; }

/** Il carrello: il terzo passo della prenotazione ("Riepilogo"), un solo
 *  passo — articoli, totali, codice sconto, come pagare, blocco legale e
 *  il pulsante finale con l'importo dentro. Da ospite l'identità viene
 *  dal primo articolo (raccolta nel passo "I tuoi dati"). */
export function CarrelloPage() {
  useSeoTags({
    title: 'Il tuo carrello — OnWay',
    description: 'Controlla i dati e conferma la prenotazione del tuo bus.',
    url: `${window.location.origin}/carrello`,
  });
  const { articoli, rimuovi, svuota, totaleStimato, bundle, scontoBundleStimato } = useCarrello();
  const prefisso = useId();
  const [cliente, setCliente] = useState<DatiCliente | null>(null);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState('');
  const [datiMancanti, setDatiMancanti] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);

  const [tipoPagamento, setTipoPagamento] = useState<'COMPLETO' | 'ACCONTO'>('COMPLETO');
  const [usaCredito, setUsaCredito] = useState(false);
  const [couponCodice, setCouponCodice] = useState('');
  const [couponVerificato, setCouponVerificato] = useState<{ sconto: number } | null>(null);
  const [verificandoCoupon, setVerificandoCoupon] = useState(false);
  const [couponErrore, setCouponErrore] = useState('');

  const loggato = clienteLoggato();
  useEffect(() => {
    if (clienteLoggato()) clienteAuthApi.me().then(setCliente).catch(() => {});
  }, []);

  const creditoDisponibile = cliente ? Number(cliente.creditoDisponibile) : 0;
  const totaleDopoBundle = totaleStimato - scontoBundleStimato;
  // Coupon e credito valgono solo pagando tutto ora. Prima il coupon,
  // poi il credito sul resto, mai sotto zero (il server ricalcola).
  const scontoCoupon = tipoPagamento === 'COMPLETO' ? (couponVerificato?.sconto ?? 0) : 0;
  const dopoCoupon = Math.max(0, totaleDopoBundle - scontoCoupon);
  const creditoApplicato = tipoPagamento === 'COMPLETO' && usaCredito ? Math.min(creditoDisponibile, dopoCoupon) : 0;
  const totaleFinale = Math.max(0, dopoCoupon - creditoApplicato);
  const accontoTotale = articoli.reduce((s, a) => s + (a.accontoEur ?? ACCONTO_PREDEFINITO_EUR) * a.passeggeri, 0);
  const ammetteAcconto = !bundle || bundle.ammetteAcconto;
  const scadenza = scadenzaSaldo(articoli);
  const importoImpegno = tipoPagamento === 'COMPLETO' ? totaleFinale : accontoTotale;
  const ceSconti = !!bundle || scontoCoupon > 0 || creditoApplicato > 0;
  const passeggeriTotali = articoli.reduce((s, a) => s + a.passeggeri, 0);
  const linkPrimoEvento = articoli[0]?.eventoSlug ? `/eventi/${articoli[0].eventoSlug}` : '/#eventi';

  async function verificaCoupon() {
    if (!couponCodice.trim() || articoli.length === 0) return;
    setVerificandoCoupon(true);
    setCouponErrore('');
    setCouponVerificato(null);
    try {
      const r = await fetch(`${API_URL}/api/coupon/valida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Anteprima: la verifica vera, riga per riga, la fa il server alla conferma.
        body: JSON.stringify({ codice: couponCodice.trim(), importo: totaleDopoBundle, eventoId: articoli[0]?.eventoId, ...(cliente?.email && { emailCliente: cliente.email }) }),
      });
      const dati = await r.json();
      if (!r.ok) throw new Error(dati.errore ?? 'Codice non valido.');
      setCouponVerificato(dati);
    } catch (e) {
      setCouponErrore(e instanceof TypeError ? MESSAGGIO_CONNESSIONE : e instanceof Error ? e.message : 'Codice non valido.');
    } finally {
      setVerificandoCoupon(false);
    }
  }

  async function confermaPrenotazione() {
    setErrore('');
    setDatiMancanti(false);
    if (!loggato && !articoli[0]?.cliente.dataNascita) { setDatiMancanti(true); return; }
    setInviando(true);
    // Un solo eventId per l'intero ordine: la Conversions API manda UN
    // evento Purchase con il totale, non uno per riga.
    const metaEventId = crypto.randomUUID();
    const { fbp, fbc } = leggiCookieMeta();
    const righe = articoli.map((a) => {
      // Un bundle ha una provenienza sola; altrimenti vale quella di ogni articolo.
      const provenienza = bundle ?? a;
      return {
        eventoId: a.eventoId,
        tragittoId: a.tragittoId,
        fermataId: a.fermataId,
        passeggeri: a.passeggeri,
        tipoPagamento,
        metodoPagamento: 'DA_CONCORDARE' as const, // nessun pagamento online reale ancora: non registrare "Carta"
        cliente: a.cliente,
        partecipanti: a.partecipanti,
        offertaId: a.offertaId,
        ...(usaCredito && tipoPagamento === 'COMPLETO' && { usaCredito: true }),
        ...(couponCodice.trim() && tipoPagamento === 'COMPLETO' && { couponCodice: couponCodice.trim() }),
        ...(provenienza.promoterCodice && { promoterCodice: provenienza.promoterCodice }),
        ...(provenienza.utmSource && { utmSource: provenienza.utmSource }),
        ...(provenienza.utmMedium && { utmMedium: provenienza.utmMedium }),
        ...(provenienza.utmCampaign && { utmCampaign: provenienza.utmCampaign }),
        ...(provenienza.utmContent && { utmContent: provenienza.utmContent }),
        metaEventId,
        ...(fbp && { metaFbp: fbp }),
        ...(fbc && { metaFbc: fbc }),
      };
    });
    try {
      const risultato = loggato
        ? await prenotazioniApi.creaOrdine(righe, bundle?.id)
        : await prenotazioniApi.creaOrdineOspite({
            email: articoli[0].cliente.email,
            nome: articoli[0].cliente.nome,
            cognome: articoli[0].cliente.cognome,
            telefono: articoli[0].cliente.telefono || undefined,
            citta: articoli[0].cliente.citta,
            dataNascita: articoli[0].cliente.dataNascita!,
            articoli: righe,
            bundleId: bundle?.id,
          });
      setEsito({
        righe: risultato.prenotazioni.map((p) => ({ pnr: p.pnr, artista: articoli.find((a) => a.eventoId === p.eventoId)?.eventoArtista ?? 'Prenotazione' })),
        email: loggato ? (cliente?.email ?? articoli[0].cliente.email) : articoli[0].cliente.email,
        ospite: !loggato,
        passeggeri: passeggeriTotali,
      });
      tracciaAcquisto(totaleDopoBundle, metaEventId);
      tracciaAcquistoGA4(totaleDopoBundle, metaEventId, bundle?.nome);
      tracciaAcquistoGoogleAds(totaleDopoBundle, metaEventId);
      svuota();
      window.scrollTo(0, 0);
    } catch (e) {
      // L'email inserita da ospite appartiene già a un account con
      // password: non si può procedere a nome di qualcun altro.
      if (e instanceof ErroreApi && e.status === 409) {
        setErrore(`${e.message} Accedi con quella email, oppure torna all'evento e cambia l'indirizzo nel passo «I tuoi dati».`);
      } else {
        setErrore(testoErrore(e));
      }
    } finally {
      setInviando(false);
    }
  }

  if (esito) {
    return (
      <main className="container-form carrello">
        <div className="pannello-chiaro superficie-chiara">
          <div className="esito">
            <span className="esito-icona" aria-hidden="true"><Icona nome="spunta" dimensione={40} strokeWidth={2.4} /></span>
            <h1>Prenotazione confermata</h1>
            <p>Hai prenotato {plurale(esito.passeggeri, 'posto', 'posti')}.</p>
            <ul className="esito-codici">
              {esito.righe.map((r) => <li key={r.pnr}>{r.artista} · codice <b>{r.pnr}</b></li>)}
            </ul>
            <p>Ti abbiamo mandato la conferma a <b>{esito.email}</b>. Il biglietto con il numero del bus arriva via email prima della partenza.</p>
            {esito.ospite && <p>Nella stessa email trovi il link per impostare la password e vedere i tuoi viaggi.</p>}
            <div className="esito-azioni">
              {loggato ? (
                <>
                  <Link className="btn btn-primary" to="/account">Vai ai miei viaggi</Link>
                  <Link className="btn btn-secondary" to="/#eventi">Torna agli eventi</Link>
                </>
              ) : (
                <Link className="btn btn-primary" to="/#eventi">Torna agli eventi</Link>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-form carrello">
      <div className="carrello-testata">
        <Stepper voci={['Fermata e posti', 'I tuoi dati', 'Riepilogo']} attivo={2} />
        <h1>Riepilogo</h1>
        <p>Controlla i dati e conferma la prenotazione.</p>
      </div>

      <div className="pannello-chiaro superficie-chiara">
        {articoli.length === 0 ? (
          <div className="stato-vuoto">
            <h2>Il carrello è vuoto</h2>
            <p>Scegli un evento e la tua fermata di partenza: il riepilogo compare qui.</p>
            <Link className="btn btn-primary" to="/#eventi">Scopri gli eventi</Link>
          </div>
        ) : (
          <>
            <ul className="articoli">
              {articoli.map((a) => <Articolo key={a.id} articolo={a} onRimuovi={() => rimuovi(a.id)} />)}
            </ul>

            {bundle && (
              <p className="totali-nota">
                <b>Bundle {bundle.nome}</b>: si acquista tutto insieme, togliendo un evento lo sconto non si applica più.
                {bundle.promoterCodice && <> Codice promoter applicato: <b>{bundle.promoterCodice}</b>.</>}
              </p>
            )}

            <div className="totali" aria-live="polite">
              {ceSconti && <p className="totali-riga"><span>Subtotale</span><span>{formattaEuro(totaleStimato)}</span></p>}
              {bundle && <p className="totali-riga sconto"><span>Sconto bundle (−{bundle.scontoPercentuale}%)</span><span>− {formattaEuro(scontoBundleStimato)}</span></p>}
              {scontoCoupon > 0 && <p className="totali-riga sconto"><span>Coupon {couponCodice}</span><span>− {formattaEuro(scontoCoupon)}</span></p>}
              {creditoApplicato > 0 && <p className="totali-riga sconto"><span>Credito</span><span>− {formattaEuro(creditoApplicato)}</span></p>}
              <p className="totali-riga totale"><span>Totale</span><span>{formattaEuro(tipoPagamento === 'COMPLETO' ? totaleFinale : totaleDopoBundle)}</span></p>
              {tipoPagamento === 'ACCONTO' && (
                <>
                  <p className="totali-riga acconto"><span>Acconto da versare ora</span><span>{formattaEuro(accontoTotale)}</span></p>
                  <p className="totali-nota">{scadenza ? `Saldo entro il ${formattaData(scadenza)}.` : 'Il resto da saldare più avanti, prima della partenza.'}</p>
                </>
              )}
              <p className="totali-nota">Prezzi stimati: il totale definitivo lo ricalcola il server alla conferma.</p>
            </div>

            {creditoDisponibile > 0 && (!bundle || bundle.ammetteCredito) && (
              <label className="scelta-check">
                <input type="checkbox" checked={usaCredito} onChange={(e) => setUsaCredito(e.target.checked)} disabled={tipoPagamento !== 'COMPLETO'} />
                Usa il tuo credito ({formattaEuro(creditoDisponibile)} disponibili)
              </label>
            )}

            {(!bundle || bundle.ammetteOfferte) && (
              <div className="campo">
                <label className="campo-etichetta" htmlFor={`${prefisso}-coupon`}>Codice sconto (facoltativo)</label>
                <div className="coupon-riga">
                  <input
                    id={`${prefisso}-coupon`} className="campo-input" type="text" autoComplete="off"
                    value={couponCodice}
                    onChange={(e) => { setCouponCodice(e.target.value.toUpperCase()); setCouponVerificato(null); setCouponErrore(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), verificaCoupon())}
                    disabled={tipoPagamento !== 'COMPLETO' || !!couponVerificato}
                    aria-invalid={couponErrore ? true : undefined}
                    aria-describedby={couponErrore ? `${prefisso}-coupon-errore` : `${prefisso}-coupon-aiuto`}
                  />
                  <button type="button" className="btn btn-secondary" onClick={verificaCoupon} disabled={tipoPagamento !== 'COMPLETO' || !couponCodice.trim() || verificandoCoupon || !!couponVerificato}>
                    {verificandoCoupon ? 'Verifico…' : couponVerificato ? <><Icona nome="spunta" dimensione={16} /> Applicato</> : 'Applica'}
                  </button>
                </div>
                {couponErrore && <p className="campo-errore" id={`${prefisso}-coupon-errore`} role="alert">{couponErrore}</p>}
                <p className="campo-aiuto" id={`${prefisso}-coupon-aiuto`}>Codice e credito valgono solo pagando tutto ora. Con l'acconto li puoi usare quando saldi il resto.</p>
              </div>
            )}

            <fieldset className="opzioni-radio">
              <legend>Come vuoi pagare?</legend>
              <label className={`opzione-radio${tipoPagamento === 'COMPLETO' ? ' selezionata' : ''}`}>
                <input type="radio" name={`${prefisso}-pagamento`} value="COMPLETO" checked={tipoPagamento === 'COMPLETO'} onChange={() => setTipoPagamento('COMPLETO')} />
                <b>Tutto ora — {formattaEuro(totaleFinale)}</b>
              </label>
              {ammetteAcconto && (
                <label className={`opzione-radio${tipoPagamento === 'ACCONTO' ? ' selezionata' : ''}`}>
                  <input type="radio" name={`${prefisso}-pagamento`} value="ACCONTO" checked={tipoPagamento === 'ACCONTO'} onChange={() => setTipoPagamento('ACCONTO')} />
                  <b>Solo l'acconto — {formattaEuro(accontoTotale)} ora</b>
                  <span>Il resto prima della partenza{scadenza ? `, entro il ${formattaData(scadenza)}` : ''}</span>
                </label>
              )}
            </fieldset>
            {/* Nessun sistema di pagamento collegato: niente campi carta,
                l'ordine si registra come "Da concordare". */}
            <p className="checkout-nota">Non paghi ora online: dopo la conferma ti contattiamo per il pagamento.</p>

            {errore && <p className="campo-errore" role="alert">{errore}</p>}
            {datiMancanti && (
              <p className="campo-errore" role="alert">
                Manca la data di nascita: <Link to={linkPrimoEvento}>torna all'evento</Link> e completa il passo «I tuoi dati».
              </p>
            )}

            <div className="blocco-legale">
              <p>Confermando ti impegni a pagare <b>{formattaEuro(importoImpegno)}</b> secondo le modalità che ti comunicheremo via email.</p>
              <p>Per i viaggi con data fissa non vale il diritto di recesso di 14 giorni: leggi la <Link to="/pagina/termini">politica di cancellazione</Link>.</p>
            </div>
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={inviando} onClick={confermaPrenotazione}>
              {inviando ? 'Invio…' : `Conferma la prenotazione · ${formattaEuro(importoImpegno)}`}
            </button>
            <p className="riga-fiducia">
              <Icona nome="lucchetto" dimensione={16} />
              <span>I tuoi dati sono trattati in modo riservato, secondo la nostra <Link to="/pagina/privacy">informativa privacy</Link>.</span>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

/** Un articolo del carrello. Se manca qualche campo (carrello salvato
 *  prima dei nuovi dati) mostra quello che c'è. */
function Articolo({ articolo: a, onRimuovi }: { articolo: ArticoloCarrello; onRimuovi: () => void }) {
  const linkEvento = a.eventoSlug ? `/eventi/${a.eventoSlug}` : null;
  const nomi = [`${a.cliente.nome} ${a.cliente.cognome}`.trim(), ...a.partecipanti.map((p) => `${p.nome} ${p.cognome}`.trim())].filter(Boolean);
  const fermata = [
    `${a.fermataCitta}${a.fermataIndirizzo ? `, ${a.fermataIndirizzo}` : ''}`,
    a.fermataOrario ? `andata ${a.fermataOrario}` : null,
    a.orarioRitorno ? `ritorno ${a.orarioRitorno}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <li className="articolo">
      <div className="articolo-media">
        {a.eventoImmagine
          ? <img src={a.eventoImmagine} alt="" width={72} height={90} loading="lazy" decoding="async" />
          : <div className="card-segnaposto" aria-hidden="true">{inizialiDi(a.eventoArtista)}</div>}
      </div>
      <div className="articolo-testo">
        <p className="articolo-titolo">{linkEvento ? <Link to={linkEvento}>{a.eventoArtista}</Link> : a.eventoArtista}</p>
        <p className="articolo-riga">{formattaDataCard(a.eventoData)}{a.eventoCitta ? ` · ${a.eventoCitta}` : ''}</p>
        <p className="articolo-riga">{fermata}</p>
        <p className="articolo-riga">{plurale(a.passeggeri, 'passeggero', 'passeggeri')}: {nomi.join(', ')}</p>
      </div>
      <p className="articolo-prezzo">{formattaEuro(a.prezzoStimato * a.passeggeri)}</p>
      <div className="articolo-azioni">
        {linkEvento && <Link className="btn btn-tertiary" to={linkEvento}>Modifica</Link>}
        <button type="button" className="btn btn-tertiary pericolo" onClick={onRimuovi}>Rimuovi</button>
      </div>
    </li>
  );
}
