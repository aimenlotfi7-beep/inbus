import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { tracciaAcquisto, leggiCookieMeta } from '../features/metaPixel';
import { tracciaAcquistoGA4, tracciaAcquistoGoogleAds } from '../features/googleAnalytics';
import { clienteAuthApi, type DatiCliente } from '../api/clienteAuth';
import { prenotazioniApi } from '../api/prenotazioni';
import { clienteLoggato } from '../features/clienteSessione';
import { ErroreApi } from '../api/client';
import { formattaEuro } from '../shared/formato';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** Il carrello — stessa identica veste grafica del checkout esistente
 *  (.checkout-form per etichette/campi, .checkout-summary per i box di
 *  riepilogo: niente stile nuovo inventato, niente ".ticket" che è
 *  pensato per un contesto diverso e qui stonava). Elenco articoli già
 *  compilati nella tab di prenotazione, e in fondo solo l'ultimo pezzo
 *  che prima stava nello step 3 del checkout: credito, coupon, metodo
 *  di pagamento.
 *
 *  Due passi (non più tutto insieme, come richiesto): 1) riepilogo con
 *  codici sconto e credito — il totale sta SEMPRE sotto gli articoli e
 *  si aggiorna subito quando si spunta il credito o si applica un
 *  coupon (prima non succedeva affatto: il coupon veniva solo salvato
 *  come testo, mai controllato finché non si completava l'ordine
 *  davvero); 2) solo dopo, la scelta del metodo di pagamento e i dati
 *  specifici (carta, o la conferma per Apple/Google Pay). */
export function CarrelloPage() {
  const { articoli, rimuovi, svuota, totaleStimato, bundle, scontoBundleStimato } = useCarrello();
  const [cliente, setCliente] = useState<DatiCliente | null>(null);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState<{ pnr: string }[] | null>(null);
  const [step, setStep] = useState<'riepilogo' | 'pagamento'>('riepilogo');

  const [tipoPagamento, setTipoPagamento] = useState<'COMPLETO' | 'ACCONTO'>('COMPLETO');
  const [usaCredito, setUsaCredito] = useState(false);
  const [couponCodice, setCouponCodice] = useState('');
  const [couponVerificato, setCouponVerificato] = useState<{ sconto: number } | null>(null);
  const [verificandoCoupon, setVerificandoCoupon] = useState(false);
  const [couponErrore, setCouponErrore] = useState('');

  useEffect(() => {
    if (clienteLoggato()) clienteAuthApi.me().then(setCliente).catch(() => {});
  }, []);

  const creditoDisponibile = cliente ? Number(cliente.creditoDisponibile) : 0;
  const totaleDopoBundle = totaleStimato - scontoBundleStimato;

  // Coupon e credito valgono solo pagando tutto subito (già così prima,
  // solo dichiarato in un testo — ora il totale lo rispetta DAVVERO
  // invece di restare fermo). L'ordine conta: prima il coupon, poi il
  // credito sul resto — mai sotto zero.
  const scontoCoupon = tipoPagamento === 'COMPLETO' ? (couponVerificato?.sconto ?? 0) : 0;
  const dopoCoupon = Math.max(0, totaleDopoBundle - scontoCoupon);
  const creditoApplicato = tipoPagamento === 'COMPLETO' && usaCredito ? Math.min(creditoDisponibile, dopoCoupon) : 0;
  const totaleFinale = Math.max(0, dopoCoupon - creditoApplicato);

  async function verificaCoupon() {
    if (!couponCodice.trim() || articoli.length === 0) return;
    setVerificandoCoupon(true);
    setCouponErrore('');
    setCouponVerificato(null);
    try {
      const r = await fetch(`${API_URL}/api/coupon/valida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Approssimazione dichiarata (vedi nota sotto il totale): un
        // carrello può avere eventi diversi, ma la verifica VERA,
        // riga per riga, avviene comunque lato server al momento di
        // completare l'ordine — questa è solo un'anteprima.
        body: JSON.stringify({ codice: couponCodice.trim(), importo: totaleDopoBundle, eventoId: articoli[0]?.eventoId, ...(cliente?.email && { emailCliente: cliente.email }) }),
      });
      const dati = await r.json();
      if (!r.ok) throw new Error(dati.errore ?? 'Coupon non valido.');
      setCouponVerificato(dati);
    } catch (e) {
      setCouponErrore(e instanceof Error ? e.message : 'Coupon non valido.');
    } finally {
      setVerificandoCoupon(false);
    }
  }

  async function completaAcquisto() {
    // Da ospite l'identità viene dal primo articolo (raccolta già nel
    // checkout, step "I tuoi dati") — non dall'account, che non c'è.
    if (!clienteLoggato() && (!articoli[0]?.cliente.dataNascita)) {
      setErrore('Mancano dei dati per completare l\'ordine — torna indietro e ricontrolla il passo "I tuoi dati".');
      return;
    }
    setInviando(true);
    setErrore('');
    // Un solo eventId per l'intero ordine (non uno per articolo) — la
    // Conversions API lato server lo prende dal primo articolo che lo
    // porta e manda UN evento Purchase con il totale, non uno per riga.
    const metaEventId = crypto.randomUUID();
    const { fbp, fbc } = leggiCookieMeta();
    const righe = articoli.map((a) => ({
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
      ...(bundle?.promoterCodice && { promoterCodice: bundle.promoterCodice }),
      ...(bundle?.utmSource && { utmSource: bundle.utmSource }),
      ...(bundle?.utmMedium && { utmMedium: bundle.utmMedium }),
      ...(bundle?.utmCampaign && { utmCampaign: bundle.utmCampaign }),
      ...(bundle?.utmContent && { utmContent: bundle.utmContent }),
      metaEventId,
      ...(fbp && { metaFbp: fbp }),
      ...(fbc && { metaFbc: fbc }),
    }));
    try {
      const risultato = clienteLoggato()
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
      setFatto(risultato.prenotazioni.map((p) => ({ pnr: p.pnr })));
      tracciaAcquisto(totaleStimato - scontoBundleStimato, metaEventId);
      tracciaAcquistoGA4(totaleStimato - scontoBundleStimato, metaEventId, bundle?.nome);
      tracciaAcquistoGoogleAds(totaleStimato - scontoBundleStimato, metaEventId);
      svuota();
    } catch (e) {
      // Caso specifico: l'email inserita da ospite appartiene già a un
      // account vero — non si può procedere "a nome" di qualcun altro
      // solo conoscendone l'email. Messaggio chiaro invece del generico,
      // con la strada giusta da seguire (accedere, non riprovare).
      if (e instanceof ErroreApi && e.status === 409) {
        setErrore(e.message + ' Torna al passo precedente per modificare l\'email, oppure accedi con quella email.');
      } else {
        setErrore(e instanceof Error ? e.message : 'Acquisto non riuscito. Riprova.');
      }
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
                    {a.passeggeri} {a.passeggeri === 1 ? 'passeggero' : 'passeggeri'}: {a.cliente.nome} {a.cliente.cognome}
                    {a.partecipanti.length > 0 && `, ${a.partecipanti.map((p) => `${p.nome} ${p.cognome}`).join(', ')}`}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <b>{formattaEuro(a.prezzoStimato * a.passeggeri)}</b>
                  {step === 'riepilogo' && (
                    <button type="button" className="search-cta-secondaria" style={{ width: 'auto', margin: 0, padding: '4px 10px', fontSize: 'var(--testo-xs)', color: '#c0392b' }} onClick={() => rimuovi(a.id)}>
                      Rimuovi
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Il totale sta SEMPRE qui, subito sotto gli articoli, in
                ENTRAMBI i passi — non più solo alla fine dopo aver
                scorso tutto. Si aggiorna DAVVERO quando si spunta il
                credito o si applica un coupon (prima il coupon veniva
                solo salvato come testo, senza che il totale mostrato
                cambiasse mai — solo una nota diceva "verrà ricalcolato
                dal server", ora lo fa già qui, in anteprima). */}
            <div className="checkout-summary" style={{ marginTop: 14 }}>
              {bundle && (
                <>
                  <b>Bundle: {bundle.nome}</b>
                  <p style={{ fontSize: 'var(--testo-sm)', opacity: .7, margin: '4px 0 10px' }}>Il bundle si acquista tutto insieme: togliendo o aggiungendo un evento, lo sconto non si applica più.</p>
                  {bundle.promoterCodice && <p style={{ fontSize: 'var(--testo-sm)', opacity: .7, margin: '0 0 8px' }}>Codice promoter applicato: <b>{bundle.promoterCodice}</b></p>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--testo-base)' }}><span>Subtotale</span><span>{formattaEuro(totaleStimato)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--testo-base)' }}><span>Sconto bundle (−{bundle.scontoPercentuale}%)</span><span>− {formattaEuro(scontoBundleStimato)}</span></div>
                </>
              )}
              {scontoCoupon > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--testo-base)', color: 'var(--verde, #2e7d32)' }}><span>Coupon "{couponCodice}"</span><span>− {formattaEuro(scontoCoupon)}</span></div>
              )}
              {creditoApplicato > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--testo-base)', color: 'var(--verde, #2e7d32)' }}><span>Credito fedeltà</span><span>− {formattaEuro(creditoApplicato)}</span></div>
              )}
              <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 'var(--testo-4xl)', margin: '10px 0 4px' }}>
                {tipoPagamento === 'ACCONTO' ? 'Totale stimato' : 'Totale'}: {formattaEuro(tipoPagamento === 'COMPLETO' ? totaleFinale : totaleDopoBundle)}
              </p>
              <p style={{ fontSize: 'var(--testo-xs)', opacity: .65 }}>
                {tipoPagamento === 'ACCONTO'
                  ? 'Con l\'acconto verserai solo una parte ora per ciascun articolo, non questo totale — coupon e credito non si applicano in questa modalità.'
                  : 'Il totale definitivo viene comunque verificato di nuovo dal server al momento di completare l\'ordine.'}
              </p>
            </div>

            {step === 'riepilogo' ? (
              <>
                {creditoDisponibile > 0 && (!bundle || bundle.ammetteCredito) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--testo-md)', margin: '14px 0 10px', cursor: tipoPagamento === 'COMPLETO' ? 'pointer' : 'default', opacity: tipoPagamento === 'COMPLETO' ? 1 : .5 }}>
                    <input type="checkbox" checked={usaCredito} onChange={(e) => setUsaCredito(e.target.checked)} style={{ width: 'auto' }} disabled={tipoPagamento !== 'COMPLETO'} />
                    Usa il tuo credito fedeltà ({formattaEuro(creditoDisponibile)} disponibili)
                  </label>
                )}

                {(!bundle || bundle.ammetteOfferte) && (<>
                <label className="field-label">Hai un codice coupon?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={couponCodice}
                    onChange={(e) => { setCouponCodice(e.target.value.toUpperCase()); setCouponVerificato(null); setCouponErrore(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), verificaCoupon())}
                    placeholder="Facoltativo"
                    style={{ textTransform: 'uppercase', flex: 1, opacity: tipoPagamento === 'COMPLETO' ? 1 : .5 }}
                    disabled={tipoPagamento !== 'COMPLETO' || !!couponVerificato}
                  />
                  <button type="button" className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={verificaCoupon} disabled={tipoPagamento !== 'COMPLETO' || !couponCodice.trim() || verificandoCoupon || !!couponVerificato}>
                    {verificandoCoupon ? '...' : couponVerificato ? '✓ Applicato' : 'Applica'}
                  </button>
                </div>
                {couponErrore && <p style={{ color: '#c0392b', fontSize: 'var(--testo-sm)', marginTop: 6 }}>{couponErrore}</p>}
                <p style={{ fontSize: 'var(--testo-sm)', opacity: .65, marginTop: 6 }}>
                  Coupon e credito si applicano solo pagando tutto subito — con l'acconto potrai usarli quando salderai il resto.
                </p>
                </>)}

                <p className="section-label" style={{ marginTop: 18 }}>Come vuoi pagare?</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <button type="button" className={`mini-tab${tipoPagamento === 'COMPLETO' ? ' active' : ''}`} onClick={() => setTipoPagamento('COMPLETO')}>Tutto subito</button>
                  {(!bundle || bundle.ammetteAcconto) && <button type="button" className={`mini-tab${tipoPagamento === 'ACCONTO' ? ' active' : ''}`} onClick={() => setTipoPagamento('ACCONTO')}>Solo acconto</button>}
                </div>
                {tipoPagamento === 'ACCONTO' && (
                  <p style={{ fontSize: 'var(--testo-sm)', opacity: .7, marginTop: 6 }}>
                    Verserai solo l'acconto per ciascun articolo ora, e salderai il resto entro la scadenza indicata via email.
                  </p>
                )}

                <button className="search-cta" style={{ marginTop: 16 }} onClick={() => setStep('pagamento')}>
                  Avanti →
                </button>
              </>
            ) : (
              <>
                <button type="button" className="search-cta-secondaria" style={{ marginTop: 14, marginBottom: 14 }} onClick={() => setStep('riepilogo')}>← Indietro</button>

                <p className="section-label">Pagamento</p>
                {/* Nessun sistema di pagamento collegato ancora: niente
                    campi carta finti (non venivano né controllati né
                    inviati, ma il browser poteva proporre di compilarli
                    con una carta vera). L'ordine si registra come "Da
                    concordare" finché non si collega un fornitore. */}
                <p style={{ fontSize: 'var(--testo-md)', opacity: .75 }}>
                  Il pagamento online non è ancora attivo: la prenotazione viene registrata e il pagamento si concorda a parte.
                </p>

                {errore && <p className="errore">{errore}</p>}

                <button className="search-cta" style={{ marginTop: 14, opacity: inviando ? .5 : 1 }} disabled={inviando} onClick={completaAcquisto}>
                  {inviando ? 'Invio...' : 'Completa l\'acquisto'}
                </button>
                {/* La nota sulla privacy sta PRIMA di essere già stato
                    scritto "fatto" — un segnale di fiducia funziona
                    prima della decisione, non dopo (era sotto il
                    pulsante, chi confermava in fretta non la vedeva
                    mai prima di cliccare). */}
                <p style={{ fontSize: 'var(--testo-xs)', opacity: .6, marginTop: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  🔒 I tuoi dati sono trattati in modo riservato, secondo la nostra informativa privacy.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
