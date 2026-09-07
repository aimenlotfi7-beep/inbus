import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { bundleApi, type BundlePubblicoDettaglio, type EventoDelBundle, formattaDataOraIt } from '../api/bundle';
import { eventiApi } from '../api/eventi';
import type { Evento, OpzionePartenza } from '../api/types';
import { clienteAuthApi } from '../api/clienteAuth';
import { clienteLoggato } from '../features/clienteSessione';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { SelettoreFermata } from '../features/checkout/SelettoreFermata';
import { useSeoTags } from '../features/useSeoTags';
import { Layout } from '../Layout';

type Passo = 'eventi' | 'configura' | 'dati';
interface SceltaEvento { servizioId?: string; fermataId?: string }

/** Pagina pubblica di un bundle: stesso layout a due colonne di
 *  EventoPage (classi .evento-pagina-*), stessi componenti per
 *  tragitto/fermata. A destra i passi: eventi (solo libero) →
 *  passeggeri e fermate → dati → carrello. Il prezzo di ogni evento
 *  esiste solo dopo la scelta della fermata (in INBUS il prezzo sta
 *  sulla fermata): il riepilogo a sinistra si compone man mano. */
export function BundlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const carrello = useCarrello();
  const [bundle, setBundle] = useState<BundlePubblicoDettaglio | null>(null);
  const [stato, setStato] = useState<'caricamento' | 'pronto' | 'non-trovato'>('caricamento');
  const [passo, setPasso] = useState<Passo>('eventi');
  const [selezionati, setSelezionati] = useState<string[]>([]);
  const [passeggeri, setPasseggeri] = useState(1);
  const [eventiCompleti, setEventiCompleti] = useState<Record<string, Evento>>({});
  const [opzioni, setOpzioni] = useState<Record<string, OpzionePartenza[]>>({}); // chiave: eventoId|servizioId
  const [scelte, setScelte] = useState<Record<string, SceltaEvento>>({});
  const [cliente, setCliente] = useState({ email: '', nome: '', cognome: '', telefono: '' });
  const [partecipanti, setPartecipanti] = useState<{ nome: string; cognome: string }[]>([]);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!slug) return;
    bundleApi.dettaglioPubblico(slug).then((b) => {
      setBundle(b); setStato('pronto');
      setPasseggeri(b.minPosti);
      if (b.tipo === 'FISSO') { setSelezionati(b.eventi.filter((e) => e.vendibile).map((e) => e.id)); setPasso('configura'); }
    }).catch(() => setStato('non-trovato'));
  }, [slug]);

  useEffect(() => {
    if (!clienteLoggato()) return;
    clienteAuthApi.me().then((d) => setCliente({ email: d.email, nome: d.nome ?? '', cognome: d.cognome ?? '', telefono: d.telefono ?? '' })).catch(() => {});
  }, []);

  useEffect(() => {
    setPartecipanti((prev) => {
      const n = Math.max(0, passeggeri - 1);
      return prev.length === n ? prev : prev.length < n ? [...prev, ...Array(n - prev.length).fill(null).map(() => ({ nome: '', cognome: '' }))] : prev.slice(0, n);
    });
  }, [passeggeri]);

  // Dettaglio completo (servizi) e opzioni di partenza per ogni evento scelto.
  useEffect(() => {
    if (!bundle) return;
    for (const id of selezionati) {
      const ev = bundle.eventi.find((e) => e.id === id);
      if (!ev || eventiCompleti[id]) continue;
      eventiApi.getBySlug(ev.slug).then((completo) => setEventiCompleti((p) => ({ ...p, [id]: completo }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, selezionati]);

  function chiaveOpzioni(eventoId: string, servizioId?: string) { return `${eventoId}|${servizioId ?? ''}`; }
  useEffect(() => {
    for (const id of selezionati) {
      const completo = eventiCompleti[id]; if (!completo) continue;
      const multi = completo.servizi.length > 0;
      const servizioId = scelte[id]?.servizioId;
      if (multi && !servizioId) continue;
      const k = chiaveOpzioni(id, servizioId);
      if (opzioni[k]) continue;
      eventiApi.opzioniPartenza(id, servizioId).then((o) => setOpzioni((p) => ({ ...p, [k]: o }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selezionati, eventiCompleti, scelte]);

  useSeoTags({
    title: bundle ? `${bundle.nome} — OnWay` : 'Bundle — OnWay',
    description: bundle?.descrizione ?? 'Più eventi insieme con uno sconto dedicato.',
    image: bundle?.copertinaUrl ?? undefined,
    url: window.location.href,
  });

  const minEv = bundle?.minEventi ?? 1, maxEv = bundle?.maxEventi ?? Infinity;
  const selezioneValida = bundle?.tipo === 'FISSO' || (selezionati.length >= minEv && selezionati.length <= maxEv);

  function opzioneScelta(eventoId: string): OpzionePartenza | undefined {
    const sc = scelte[eventoId]; if (!sc?.fermataId) return undefined;
    return opzioni[chiaveOpzioni(eventoId, sc.servizioId)]?.find((o) => o.fermataId === sc.fermataId);
  }
  const righeRiepilogo = selezionati.map((id) => ({ evento: bundle!.eventi.find((e) => e.id === id)!, opzione: opzioneScelta(id) }));
  const tutteScelte = righeRiepilogo.length > 0 && righeRiepilogo.every((r) => r.opzione && r.opzione.postiDisponibili >= passeggeri);
  const totaleOriginale = righeRiepilogo.reduce((s, r) => s + (r.opzione?.prezzoEffettivo ?? 0) * passeggeri, 0);
  const sconto = bundle ? Math.round(totaleOriginale * Number(bundle.scontoPercentuale)) / 100 : 0;

  function toggleEvento(id: string) {
    setSelezionati((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  function vaiAlCarrello() {
    setErrore('');
    if (!bundle) return;
    if (!cliente.email.includes('@') || !cliente.nome.trim() || !cliente.cognome.trim()) { setErrore('Compila email, nome e cognome.'); return; }
    if (partecipanti.some((p) => !p.nome.trim() || !p.cognome.trim())) { setErrore('Inserisci nome e cognome di ogni passeggero.'); return; }
    if (!tutteScelte) { setErrore('Scegli la fermata per ogni evento.'); return; }
    carrello.impostaBundle(
      { id: bundle.id, nome: bundle.nome, scontoPercentuale: Number(bundle.scontoPercentuale), ammetteOfferte: bundle.ammetteOfferte, ammetteCredito: bundle.ammetteCredito, ammettePromoter: bundle.ammettePromoter, ammetteAcconto: bundle.ammetteAcconto },
      righeRiepilogo.map(({ evento, opzione }) => ({
        eventoId: evento.id, eventoArtista: evento.artista, eventoData: evento.data,
        tragittoId: opzione!.tragittoId, fermataId: opzione!.fermataId, fermataCitta: opzione!.fermataCitta, fermataOrario: opzione!.fermataOrario,
        prezzoStimato: opzione!.prezzoEffettivo, passeggeri, cliente, partecipanti,
      })),
    );
    navigate('/carrello');
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '32px auto 80px', padding: '0 20px' }}>
        {stato === 'caricamento' && <p>Carico...</p>}
        {stato === 'non-trovato' && <div className="checkout-summary">Questo bundle non è (più) disponibile. Vedi <Link to="/bundle">tutti i bundle</Link>.</div>}

        {stato === 'pronto' && bundle && (
          <div className="evento-pagina-corpo">
            {/* SINISTRA — copertina, info, riepilogo */}
            <div className="evento-pagina-info">
              <div className={`evento-pagina-hero${bundle.copertinaUrl ? '' : ' senza-foto'}`} style={bundle.copertinaUrl ? { backgroundImage: `url(${bundle.copertinaUrl})` } : undefined}>
                <span className="tag">Bundle</span>
              </div>
              <h1>{bundle.nome}</h1>
              <p className="meta-riga">{bundle.tipo === 'FISSO' ? `${bundle.eventi.length} eventi inclusi` : `Scegli ${bundle.maxEventi ? `da ${minEv} a ${bundle.maxEventi}` : `almeno ${minEv}`} eventi tra ${bundle.eventi.length}`}</p>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, marginTop: 14 }}>−{Number(bundle.scontoPercentuale)}% <span style={{ fontSize: 13, opacity: .7 }}>sul totale dei posti</span></p>
              {bundle.descrizione && <p style={{ marginTop: 14, whiteSpace: 'pre-line' }}>{bundle.descrizione}</p>}
              {bundle.stato === 'PROGRAMMATO' && bundle.inizioVendita && <p className="checkout-summary" style={{ marginTop: 14 }}>Disponibile dal {formattaDataOraIt(bundle.inizioVendita)}</p>}
              {bundle.stato === 'VENDITA_TERMINATA' && <p className="checkout-summary" style={{ marginTop: 14 }}>Vendita terminata</p>}

              {righeRiepilogo.length > 0 && (
                <div className="checkout-summary" style={{ marginTop: 18 }}>
                  <b>Il tuo bundle</b>
                  {righeRiepilogo.map(({ evento, opzione }) => (
                    <div key={evento.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6, fontSize: 13.5 }}>
                      <span>{evento.artista}{opzione ? ` · ${opzione.fermataCitta}` : ''}</span>
                      <span>{opzione ? `€${(opzione.prezzoEffettivo * passeggeri).toFixed(2)}` : '—'}</span>
                    </div>
                  ))}
                  {tutteScelte && (
                    <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8, fontSize: 13.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Totale originale</span><span>€{totaleOriginale.toFixed(2)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sconto bundle</span><span>− €{sconto.toFixed(2)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 4 }}><span>Totale</span><span>€{(totaleOriginale - sconto).toFixed(2)}</span></div>
                      <p style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>Per {passeggeri} {passeggeri === 1 ? 'passeggero' : 'passeggeri'}. Eventuali credito e codici si applicano al carrello.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DESTRA — i passi */}
            <div className="evento-pagina-checkout aperta-mobile">
              <div className="checkout-form">
                {!bundle.acquistabile && (
                  <div className="checkout-summary">
                    {bundle.stato === 'PROGRAMMATO' ? `Questo bundle sarà acquistabile dal ${bundle.inizioVendita ? formattaDataOraIt(bundle.inizioVendita) : '…'}.`
                      : bundle.stato === 'VENDITA_TERMINATA' ? 'La vendita di questo bundle è terminata.'
                      : 'Al momento uno o più eventi del bundle non sono disponibili: il bundle non è acquistabile.'}
                    <p style={{ marginTop: 8, fontSize: 13 }}>Gli eventi restano acquistabili singolarmente dalle loro pagine.</p>
                  </div>
                )}

                {bundle.acquistabile && passo === 'eventi' && bundle.tipo === 'LIBERO' && (
                  <>
                    <h3>Scegli {bundle.maxEventi ? `da ${minEv} a ${bundle.maxEventi}` : `almeno ${minEv}`} eventi</h3>
                    {bundle.eventi.map((e) => <RigaEvento key={e.id} evento={e} selezionabile={e.vendibile} selezionato={selezionati.includes(e.id)} onToggle={() => toggleEvento(e.id)} />)}
                    <p style={{ marginTop: 10, fontSize: 13 }}>Eventi selezionati: <b>{selezionati.length}</b></p>
                    <button type="button" className="btn-primary" disabled={!selezioneValida} onClick={() => setPasso('configura')} style={{ marginTop: 10 }}>Continua</button>
                  </>
                )}

                {bundle.acquistabile && passo === 'configura' && (
                  <>
                    {bundle.tipo === 'FISSO' && <><h3>Il bundle include</h3>{bundle.eventi.map((e) => <RigaEvento key={e.id} evento={e} selezionabile={false} selezionato onToggle={() => {}} />)}</>}
                    <h3 style={{ marginTop: 16 }}>Quanti passeggeri?</h3>
                    <p style={{ fontSize: 13, opacity: .8 }}>Lo stesso numero per tutti gli eventi (da {bundle.minPosti} a {bundle.maxPosti}).</p>
                    <input type="number" min={bundle.minPosti} max={bundle.maxPosti} value={passeggeri} onChange={(e) => setPasseggeri(Math.min(bundle.maxPosti, Math.max(bundle.minPosti, Number(e.target.value) || bundle.minPosti)))} style={{ width: 100 }} />
                    <h3 style={{ marginTop: 16 }}>Partenza per ogni evento</h3>
                    {selezionati.map((id) => {
                      const ev = bundle.eventi.find((e) => e.id === id)!;
                      const completo = eventiCompleti[id];
                      const sc = scelte[id] ?? {};
                      const multi = !!completo && completo.servizi.length > 0;
                      const lista = opzioni[chiaveOpzioni(id, sc.servizioId)];
                      return (
                        <div key={id} style={{ marginTop: 12 }}>
                          <p style={{ fontWeight: 600 }}>{ev.artista} <span style={{ opacity: .7, fontWeight: 400 }}>· {new Date(ev.data).toLocaleDateString('it-IT')}</span></p>
                          {!completo && <p style={{ fontSize: 13 }}>Carico...</p>}
                          {multi && (
                            <select value={sc.servizioId ?? ''} onChange={(e) => setScelte((p) => ({ ...p, [id]: { servizioId: e.target.value || undefined } }))} style={{ marginBottom: 6 }}>
                              <option value="">— Scegli il servizio —</option>
                              {completo!.servizi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            </select>
                          )}
                          {completo && (!multi || sc.servizioId) && (lista
                            ? <SelettoreFermata
                                opzioni={lista.filter((o) => o.postiDisponibili >= passeggeri)}
                                valore={sc.fermataId ?? ''}
                                onSeleziona={(fermataId) => setScelte((p) => ({ ...p, [id]: { ...p[id], fermataId } }))}
                                testoOpzione={(o) => `${o.fermataCitta} (${o.fermataOrario || 'orario da definire'}) — €${o.prezzoEffettivo.toFixed(2)}`}
                              />
                            : <p style={{ fontSize: 13 }}>Carico le partenze...</p>)}
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      {bundle.tipo === 'LIBERO' && <button type="button" className="btn-ghost" onClick={() => setPasso('eventi')}>Indietro</button>}
                      <button type="button" className="btn-primary" disabled={!tutteScelte} onClick={() => setPasso('dati')}>Continua</button>
                    </div>
                  </>
                )}

                {bundle.acquistabile && passo === 'dati' && (
                  <>
                    <h3>I tuoi dati</h3>
                    <div className="form-grid">
                      <label>Email <input type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} /></label>
                      <label>Telefono <input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} /></label>
                      <label>Nome <input value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} /></label>
                      <label>Cognome <input value={cliente.cognome} onChange={(e) => setCliente({ ...cliente, cognome: e.target.value })} /></label>
                    </div>
                    {partecipanti.length > 0 && <h3 style={{ marginTop: 14 }}>Altri passeggeri</h3>}
                    {partecipanti.map((p, i) => (
                      <div key={i} className="form-grid" style={{ marginTop: 6 }}>
                        <label>Nome <input value={p.nome} onChange={(e) => setPartecipanti((prev) => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} /></label>
                        <label>Cognome <input value={p.cognome} onChange={(e) => setPartecipanti((prev) => prev.map((x, j) => j === i ? { ...x, cognome: e.target.value } : x))} /></label>
                      </div>
                    ))}
                    {errore && <p className="errore" style={{ marginTop: 8 }}>{errore}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <button type="button" className="btn-ghost" onClick={() => setPasso('configura')}>Indietro</button>
                      <button type="button" className="btn-primary" onClick={vaiAlCarrello}>Vai al carrello</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function RigaEvento({ evento, selezionabile, selezionato, onToggle }: { evento: EventoDelBundle; selezionabile: boolean; selezionato: boolean; onToggle: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: selezionabile || selezionato ? 1 : .5, cursor: selezionabile ? 'pointer' : 'default' }}>
      <input type="checkbox" checked={selezionato} disabled={!selezionabile} onChange={onToggle} style={{ width: 'auto' }} />
      {evento.immagineUrl && <img src={evento.immagineUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />}
      <span style={{ flex: 1 }}>
        <b>{evento.artista}</b><br />
        <span style={{ fontSize: 12.5, opacity: .75 }}>{evento.luogo}, {evento.citta} · {new Date(evento.data).toLocaleDateString('it-IT')}</span>
        {!evento.vendibile && <span style={{ fontSize: 12, marginLeft: 6 }}>(non disponibile)</span>}
      </span>
    </label>
  );
}
