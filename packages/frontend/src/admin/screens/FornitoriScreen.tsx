import { useEffect, useId, useRef, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { fornitoriApi, type Fornitore, type FornitoreInput, type StatoFornitore, type CampoExtraConfig, type CollegamentiFornitore } from '../../api/fornitori';
import { geocodifica } from '../shared/geo';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { MappaPunti } from '../shared/MappaPunti';
import { Modale } from '../shared/Modale';

const VUOTO: Partial<FornitoreInput> = { nome: '', partitaIva: '', referente: '', telefono: '', email: '', indirizzo: '', note: '', invioAutomatico: false };

const ETICHETTA_STATO: Record<StatoFornitore, string> = { IN_ATTESA: 'In attesa', APPROVATO: 'Approvato', DISATTIVATO: 'Disattivato' };
const CLASSE_STATO: Record<StatoFornitore, string> = { IN_ATTESA: 'badge-stato-arancio', APPROVATO: 'badge-stato-verde', DISATTIVATO: 'badge-stato-rosso' };
const SENZA_REGIONE = 'Senza regione';
const STILE_PULSANTE_ROSSO = { background: 'var(--pink)', color: '#fff' };
const STILE_ERRORE_CAMPO = { color: 'var(--pink)', fontSize: 'var(--testo-sm)' };

/** Il perché di un errore, da mettere dopo "… non riuscito: ". */
function motivo(e: unknown) {
  return e instanceof ErroreApi ? e.message : 'impossibile contattare il server.';
}

/** "2 partenze, 1 richiesta di preventivo e 3 bus" — solo le voci presenti. */
function descriviCollegamenti(c: CollegamentiFornitore) {
  const voci: string[] = [];
  if (c.partenze) voci.push(`${c.partenze} ${c.partenze === 1 ? 'partenza' : 'partenze'}`);
  if (c.richiestePreventivo) voci.push(`${c.richiestePreventivo} ${c.richiestePreventivo === 1 ? 'richiesta di preventivo' : 'richieste di preventivo'}`);
  if (c.bus) voci.push(`${c.bus} bus`);
  return voci.length > 1 ? `${voci.slice(0, -1).join(', ')} e ${voci[voci.length - 1]}` : (voci[0] ?? '');
}

/** I campi facoltativi lasciati vuoti partono come null, non come "":
 *  il server rifiuterebbe un'email vuota come "non valida". */
function vuotoComeNull(valore: string | null | undefined) {
  const pulito = valore?.trim() ?? '';
  return pulito || null;
}

/** L'email può andare a capo prima della "@" se la colonna è stretta,
 *  invece di allargare tutta la tabella. */
function emailSpezzabile(email: string) {
  const chiocciola = email.indexOf('@');
  return chiocciola > 0 ? <>{email.slice(0, chiocciola)}<wbr />{email.slice(chiocciola)}</> : email;
}

export function FornitoriScreen() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [caricato, setCaricato] = useState(false);
  const [inModifica, setInModifica] = useState<Fornitore | null>(null);
  const [form, setForm] = useState<Partial<FornitoreInput>>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [ricerca, setRicerca] = useState('');
  // Configurazione campi extra del form pubblico — gestita da qui
  // stesso invece di una schermata a parte, è un dettaglio piccolo che
  // riguarda solo i fornitori.
  const [campiExtraConfig, setCampiExtraConfig] = useState<CampoExtraConfig[]>([]);
  const [gestisciCampiExtraAperto, setGestisciCampiExtraAperto] = useState(false);
  const [nuovoCampoExtra, setNuovoCampoExtra] = useState('');
  const [vistaCartina, setVistaCartina] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroriCampi, setErroriCampi] = useState<{ nome?: string; email?: string }>({});
  // Avviso sotto l'indirizzo quando la ricerca sulla mappa non lo trova:
  // il salvataggio si ferma finché non lo si corregge o si sceglie
  // "Salva comunque" — prima si salvava in silenzio senza posizione, e
  // il fornitore spariva dalle richieste di preventivo senza che nessuno
  // se ne accorgesse.
  const [avvisoIndirizzo, setAvvisoIndirizzo] = useState<string | null>(null);
  // Azioni che chiedono conferma prima di partire.
  const [daDisattivare, setDaDisattivare] = useState<Fornitore | null>(null);
  const [daEliminare, setDaEliminare] = useState<{ fornitore: Fornitore; collegamenti: CollegamentiFornitore | null; errore: string } | null>(null);
  const [campoDaRimuovere, setCampoDaRimuovere] = useState<CampoExtraConfig | null>(null);
  const [azioneInCorso, setAzioneInCorso] = useState(false);
  const idForm = useId();
  const nomeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function ricarica() {
    fornitoriApi.list()
      .then(setFornitori)
      .catch((e) => notifica(`Caricamento dei fornitori non riuscito: ${motivo(e)}`))
      .finally(() => setCaricato(true));
  }
  function ricaricaCampiExtraConfig() {
    fornitoriApi.campiExtraConfig()
      .then(setCampiExtraConfig)
      .catch((e) => notifica(`Caricamento dei campi extra non riuscito: ${motivo(e)}`));
  }
  useEffect(() => { ricarica(); ricaricaCampiExtraConfig(); }, []);

  const fornitoriFiltrati = ricerca.trim()
    ? fornitori.filter((f) => `${f.nome} ${f.referente ?? ''} ${f.indirizzo ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : fornitori;

  // Un'unica tabella ordinata per regione (in ordine alfabetico) e,
  // dentro, per nome: la regione compare come titoletto. Chi non ha
  // ancora una regione nota (mai geocodificato, o indirizzo non
  // riconosciuto) finisce in un gruppo a parte, sempre in fondo.
  const regioneDi = (f: Fornitore) => f.regione ?? SENZA_REGIONE;
  const fornitoriOrdinati = [...fornitoriFiltrati].sort((a, b) => {
    const ra = regioneDi(a);
    const rb = regioneDi(b);
    if (ra !== rb) return ra === SENZA_REGIONE ? 1 : rb === SENZA_REGIONE ? -1 : ra.localeCompare(rb, 'it');
    return a.nome.localeCompare(b.nome, 'it');
  });

  const puntiCartina = fornitoriFiltrati.filter((f) => f.lat != null && f.lng != null).map((f) => ({
    id: f.id, etichetta: f.nome, sottotitolo: f.regione ?? undefined, citta: f.regione ?? '', indirizzo: f.indirizzo ?? '', lat: f.lat, lng: f.lng,
  }));

  const inAttesaCount = fornitori.filter((f) => f.stato === 'IN_ATTESA').length;

  function apriNuovo() { setInModifica(null); setForm(VUOTO); setErroriCampi({}); setAvvisoIndirizzo(null); setModaleAperta(true); }
  function apriModifica(f: Fornitore) { setInModifica(f); setForm(f); setErroriCampi({}); setAvvisoIndirizzo(null); setModaleAperta(true); }

  async function salva(senzaPosizione = false) {
    if (salvando) return;
    const nome = form.nome?.trim() ?? '';
    const email = vuotoComeNull(form.email);
    const errori: { nome?: string; email?: string } = {};
    if (!nome) errori.nome = 'Inserisci il nome del fornitore.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errori.email = 'Email non valida: controlla di averla scritta per intero.';
    setErroriCampi(errori);
    if (errori.nome) { nomeRef.current?.focus(); return; }
    if (errori.email) { emailRef.current?.focus(); return; }
    setSalvando(true);
    try {
      // La posizione serve alla cartina e alle richieste di preventivo
      // (le riceve solo chi ha una posizione nel raggio). Si cerca solo
      // se l'indirizzo è nuovo, cambiato o mai trovato prima: uno già
      // trovato e non toccato non va ricercato a ogni salvataggio.
      const indirizzo = vuotoComeNull(form.indirizzo);
      let { lat = null, lng = null, regione = null } = form;
      let posizioneTrovata = '';
      const daCercare = indirizzo !== null && (indirizzo !== vuotoComeNull(inModifica?.indirizzo) || lat == null || lng == null);
      if (!indirizzo || (daCercare && senzaPosizione)) {
        // Senza indirizzo, o indirizzo cambiato ma non trovato: la
        // posizione vecchia non vale più, meglio nessuna che una sbagliata.
        lat = null; lng = null; regione = null;
      } else if (daCercare) {
        const r = await geocodifica(indirizzo);
        if (!r.coordinate) {
          setAvvisoIndirizzo(r.erroreRete
            ? 'Non riesco a cercare l’indirizzo sulla mappa in questo momento: riprova tra poco.'
            : 'Indirizzo non trovato sulla mappa: controlla via, numero civico e città.');
          return;
        }
        lat = r.coordinate.lat; lng = r.coordinate.lng; regione = r.regione;
        posizioneTrovata = [r.comune, r.regione].filter(Boolean).join(', ');
      }
      const daSalvare = {
        ...form, nome, email, indirizzo, lat, lng, regione,
        partitaIva: vuotoComeNull(form.partitaIva),
        referente: vuotoComeNull(form.referente),
        telefono: vuotoComeNull(form.telefono),
        note: vuotoComeNull(form.note),
      };
      if (inModifica) await fornitoriApi.update(inModifica.id, daSalvare);
      else await fornitoriApi.create(daSalvare);
      setModaleAperta(false);
      if (lat == null) notifica('Fornitore salvato, ma senza posizione sulla mappa: non riceverà richieste di preventivo finché l’indirizzo non viene trovato.', 'info');
      else notifica(posizioneTrovata ? `Fornitore salvato. Posizione trovata: ${posizioneTrovata}.` : 'Fornitore salvato.', 'successo');
      ricarica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivo(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  async function cambiaStato(f: Fornitore, stato: StatoFornitore) {
    setAzioneInCorso(true);
    try {
      await fornitoriApi.cambiaStato(f.id, stato);
      setDaDisattivare(null);
      setDaEliminare(null);
      const fatto = stato === 'DISATTIVATO'
        ? `"${f.nome}" disattivato: non riceverà più richieste di preventivo.`
        : f.stato === 'IN_ATTESA' ? `"${f.nome}" approvato.` : `"${f.nome}" riattivato.`;
      notifica(fatto, 'successo');
      ricarica();
    } catch (e) {
      notifica(`Cambio di stato non riuscito: ${motivo(e)}`);
    } finally {
      setAzioneInCorso(false);
    }
  }

  // Prima di proporre "Elimina" controlla se il fornitore è usato da
  // qualche parte: in quel caso l'eliminazione cancellerebbe lo storico
  // (e il server la rifiuta), quindi si propone di disattivarlo.
  async function apriEliminazione(f: Fornitore) {
    setDaEliminare({ fornitore: f, collegamenti: null, errore: '' });
    try {
      const collegamenti = await fornitoriApi.collegamenti(f.id);
      setDaEliminare((d) => (d?.fornitore.id === f.id ? { ...d, collegamenti } : d));
    } catch (e) {
      setDaEliminare((d) => (d?.fornitore.id === f.id ? { ...d, errore: `Non riesco a controllare se il fornitore è in uso: ${motivo(e)}` } : d));
    }
  }
  async function elimina(f: Fornitore) {
    setAzioneInCorso(true);
    try {
      await fornitoriApi.remove(f.id);
      setDaEliminare(null);
      notifica(`"${f.nome}" eliminato.`, 'successo');
      ricarica();
    } catch (e) {
      notifica(`Eliminazione non riuscita: ${motivo(e)}`);
    } finally {
      setAzioneInCorso(false);
    }
  }

  function copiaLinkRegistrazione() {
    navigator.clipboard.writeText(`${window.location.origin}/fornitore/registrati`);
    notifica('Link copiato — condividilo con chi vuoi far registrare come fornitore.');
  }

  async function aggiungiCampoExtra() {
    const etichetta = nuovoCampoExtra.trim();
    if (!etichetta || azioneInCorso) return;
    setAzioneInCorso(true);
    try {
      await fornitoriApi.creaCampoExtraConfig({ etichetta, ordine: campiExtraConfig.length });
      setNuovoCampoExtra('');
      notifica(`Campo "${etichetta}" aggiunto al form di registrazione.`, 'successo');
      ricaricaCampiExtraConfig();
    } catch (e) {
      notifica(`Aggiunta del campo non riuscita: ${motivo(e)}`);
    } finally {
      setAzioneInCorso(false);
    }
  }
  async function rimuoviCampoExtra(c: CampoExtraConfig) {
    setAzioneInCorso(true);
    try {
      await fornitoriApi.eliminaCampoExtraConfig(c.id);
      setCampoDaRimuovere(null);
      notifica(`Campo "${c.etichetta}" tolto dal form di registrazione.`, 'successo');
      ricaricaCampiExtraConfig();
    } catch (e) {
      notifica(`Rimozione del campo non riuscita: ${motivo(e)}`);
    } finally {
      setAzioneInCorso(false);
    }
  }

  if (gestisciCampiExtraAperto) {
    return (
      <PaginaSezione titolo="Campi extra nel form pubblico" onIndietro={() => setGestisciCampiExtraAperto(false)}>
        <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)', marginBottom: 16 }}>Campi in più, oltre a ragione sociale/P.IVA/indirizzo/email/telefono/referente, che compaiono nel form di autoregistrazione — solo testo semplice, un'etichetta e basta.</p>
        {campiExtraConfig.length === 0 && (
          <p style={{ fontSize: 'var(--testo-md)', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>Nessun campo extra: il form di registrazione mostra solo i campi standard.</p>
        )}
        {campiExtraConfig.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{c.etichetta}</span>
            <button className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 'var(--testo-sm)' }} onClick={() => setCampoDaRimuovere(c)}>Rimuovi</button>
          </div>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); aggiungiCampoExtra(); }} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input aria-label="Nome del nuovo campo" placeholder="Nome del nuovo campo (es. Numero flotta)" value={nuovoCampoExtra} onChange={(e) => setNuovoCampoExtra(e.target.value)} style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary" disabled={!nuovoCampoExtra.trim() || azioneInCorso}>+ Aggiungi</button>
        </form>

        {campoDaRimuovere && (
          <Modale titolo="Rimuovere il campo?" onClose={() => setCampoDaRimuovere(null)}>
            <p style={{ marginBottom: 16 }}>
              Il campo <b>{campoDaRimuovere.etichetta}</b> non comparirà più nel form di registrazione. Quello che i fornitori hanno già compilato resta nelle loro schede.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setCampoDaRimuovere(null)}>Annulla</button>
              <button type="button" className="btn btn-primary" style={STILE_PULSANTE_ROSSO} disabled={azioneInCorso} onClick={() => rimuoviCampoExtra(campoDaRimuovere)}>Rimuovi</button>
            </div>
          </Modale>
        )}
      </PaginaSezione>
    );
  }

  if (modaleAperta) {
    const id = (campo: string) => `${idForm}-${campo}`;
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica fornitore' : 'Nuovo fornitore'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo">
          <label htmlFor={id('nome')}>Nome</label>
          <input
            id={id('nome')} ref={nomeRef} value={form.nome ?? ''}
            aria-invalid={!!erroriCampi.nome} aria-describedby={erroriCampi.nome ? id('nome-errore') : undefined}
            style={erroriCampi.nome ? { borderColor: 'var(--pink)' } : undefined}
            onChange={(e) => { setForm({ ...form, nome: e.target.value }); setErroriCampi((err) => ({ ...err, nome: undefined })); }}
          />
          {erroriCampi.nome && <span id={id('nome-errore')} style={STILE_ERRORE_CAMPO}>{erroriCampi.nome}</span>}
        </div>
        <div className="campo"><label htmlFor={id('piva')}>Partita IVA</label><input id={id('piva')} value={form.partitaIva ?? ''} onChange={(e) => setForm({ ...form, partitaIva: e.target.value })} /></div>
        <div className="campo"><label htmlFor={id('referente')}>Referente</label><input id={id('referente')} value={form.referente ?? ''} onChange={(e) => setForm({ ...form, referente: e.target.value })} /></div>
        <div className="campo"><label htmlFor={id('telefono')}>Telefono</label><input id={id('telefono')} type="tel" value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
        <div className="campo">
          <label htmlFor={id('email')}>Email</label>
          <input
            id={id('email')} ref={emailRef} type="email" value={form.email ?? ''}
            aria-invalid={!!erroriCampi.email} aria-describedby={erroriCampi.email ? id('email-errore') : undefined}
            style={erroriCampi.email ? { borderColor: 'var(--pink)' } : undefined}
            onChange={(e) => { setForm({ ...form, email: e.target.value }); setErroriCampi((err) => ({ ...err, email: undefined })); }}
          />
          {erroriCampi.email && <span id={id('email-errore')} style={STILE_ERRORE_CAMPO}>{erroriCampi.email}</span>}
        </div>
        <div className="campo">
          <label htmlFor={id('indirizzo')}>Indirizzo</label>
          <input
            id={id('indirizzo')} value={form.indirizzo ?? ''} placeholder="Via e numero civico, città — serve a trovarlo sulla mappa"
            onChange={(e) => { setForm({ ...form, indirizzo: e.target.value }); setAvvisoIndirizzo(null); }}
          />
        </div>
        {avvisoIndirizzo && (
          <div role="alert" style={{ background: 'var(--dusk)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px', fontSize: 'var(--testo-md)', margin: '-4px 0 14px' }}>
            <p style={{ margin: '0 0 8px' }}>{avvisoIndirizzo} Se salvi comunque, il fornitore non comparirà sulla cartina e non riceverà richieste di preventivo.</p>
            <button type="button" className="btn btn-ghost btn-piccolo" onClick={() => salva(true)} disabled={salvando}>Salva comunque</button>
          </div>
        )}
        <div className="campo"><label htmlFor={id('note')}>Note</label><input id={id('note')} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <label title="Se attivo, quando questo fornitore rientra nel raggio della PRIMA richiesta preventivo di un tragitto, la mail gli parte da sola." style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.invioAutomatico ?? false} onChange={(e) => setForm({ ...form, invioAutomatico: e.target.checked })} style={{ width: 'auto' }} />
          Invio automatico della richiesta preventivo (se nel raggio)
        </label>
        {inModifica?.campiExtra && inModifica.campiExtra.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 'var(--testo-xs)', color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Campi extra (dall'autoregistrazione)</p>
            {inModifica.campiExtra.map((c, i) => <p key={i} style={{ fontSize: 'var(--testo-md)', margin: '2px 0' }}>{c.etichetta}: {c.valore}</p>)}
          </div>
        )}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => salva()} disabled={salvando}>{salvando ? 'Salvo...' : 'Salva fornitore'}</button>
      </PaginaSezione>
    );
  }

  const collegamentiDaEliminare = daEliminare?.collegamenti;
  const eliminazioneBloccata = !!collegamentiDaEliminare
    && collegamentiDaEliminare.partenze + collegamentiDaEliminare.richiestePreventivo + collegamentiDaEliminare.bus > 0;

  return (
    <div>
      <PanelHead titolo="Fornitori" azione={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setVistaCartina((v) => !v)}>{vistaCartina ? 'Vedi elenco' : 'Vedi su cartina'}</button>
          <button className="btn btn-ghost" onClick={() => setGestisciCampiExtraAperto(true)}>Campi extra</button>
          <button className="btn btn-ghost" onClick={copiaLinkRegistrazione}>Link registrazione</button>
          <button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo fornitore</button>
        </div>
      } />
      {inAttesaCount > 0 && (
        <p style={{ background: 'var(--dusk)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 14px', fontSize: 'var(--testo-md)', marginBottom: 14 }}>
          <b style={{ color: 'var(--amber)' }}>{inAttesaCount}</b> fornitore/i in attesa di approvazione — controlla la colonna Stato qui sotto.
        </p>
      )}
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, referente o indirizzo..." />

      {vistaCartina ? (
        puntiCartina.length === 0
          ? <p className="testo-intro">Nessun fornitore con posizione nota da mostrare — la posizione si calcola quando salvi un indirizzo.</p>
          : <MappaPunti punti={puntiCartina} />
      ) : !caricato ? (
        <p className="testo-intro">Carico i fornitori…</p>
      ) : fornitoriOrdinati.length === 0 ? (
        <p className="testo-intro">
          {ricerca.trim() ? 'Nessun fornitore corrisponde alla ricerca.' : 'Nessun fornitore ancora: aggiungine uno con "+ Nuovo fornitore" oppure condividi il link di registrazione.'}
        </p>
      ) : (
        <TabellaGenerica
          righe={fornitoriOrdinati}
          gruppo={regioneDi}
          colonne={[
            { etichetta: 'Nome', render: (f) => <b>{f.nome}</b> },
            { etichetta: 'Referente', render: (f) => f.referente || '—' },
            // Con poco spazio Telefono ed Email diventano un'unica colonna
            // Contatti (vedi .table-scroll.adattiva in gestionale.css).
            { etichetta: 'Telefono', classe: 'solo-largo', render: (f) => f.telefono || '—' },
            { etichetta: 'Email', classe: 'solo-largo', render: (f) => (f.email ? emailSpezzabile(f.email) : '—') },
            {
              etichetta: 'Contatti',
              classe: 'solo-stretto',
              render: (f) => (f.telefono || f.email
                ? <>{f.telefono && <span style={{ display: 'block' }}>{f.telefono}</span>}{f.email && <span style={{ display: 'block' }}>{emailSpezzabile(f.email)}</span>}</>
                : '—'),
            },
            {
              etichetta: 'Indirizzo',
              render: (f) => (
                <>
                  {f.indirizzo || '—'}
                  {(f.lat == null || f.lng == null) && <span style={{ display: 'block', fontSize: 'var(--testo-xs)', color: 'var(--amber)' }}>Non trovato sulla mappa</span>}
                </>
              ),
            },
            {
              etichetta: 'Stato',
              render: (f) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`badge ${CLASSE_STATO[f.stato]}`} style={{ whiteSpace: 'nowrap' }}>{ETICHETTA_STATO[f.stato]}</span>
                  {f.stato === 'IN_ATTESA' && <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-xs)', padding: '2px 8px' }} disabled={azioneInCorso} onClick={() => cambiaStato(f, 'APPROVATO')}>Approva</button>}
                  {f.stato === 'APPROVATO' && <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-xs)', padding: '2px 8px', color: 'var(--pink)' }} onClick={() => setDaDisattivare(f)}>Disattiva</button>}
                  {f.stato === 'DISATTIVATO' && <button className="btn btn-ghost" style={{ fontSize: 'var(--testo-xs)', padding: '2px 8px' }} disabled={azioneInCorso} onClick={() => cambiaStato(f, 'APPROVATO')}>Riattiva</button>}
                </div>
              ),
            },
          ]}
          onModifica={apriModifica}
          onElimina={apriEliminazione}
        />
      )}

      {daDisattivare && (
        <Modale titolo="Disattivare il fornitore?" onClose={() => setDaDisattivare(null)}>
          <p style={{ marginBottom: 16 }}>
            <b>{daDisattivare.nome}</b> non riceverà più richieste di preventivo. I suoi dati e lo storico restano, e puoi riattivarlo quando vuoi.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setDaDisattivare(null)}>Annulla</button>
            <button type="button" className="btn btn-primary" style={STILE_PULSANTE_ROSSO} disabled={azioneInCorso} onClick={() => cambiaStato(daDisattivare, 'DISATTIVATO')}>Disattiva</button>
          </div>
        </Modale>
      )}

      {daEliminare && (
        <Modale titolo={eliminazioneBloccata ? 'Non si può eliminare' : 'Eliminare il fornitore?'} onClose={() => setDaEliminare(null)}>
          <p style={{ marginBottom: 16 }}>
            {daEliminare.errore
              ? daEliminare.errore
              : !collegamentiDaEliminare
                ? 'Controllo se il fornitore è usato in partenze o preventivi…'
                : eliminazioneBloccata
                  ? <>
                      <b>{daEliminare.fornitore.nome}</b> è collegato a {descriviCollegamenti(collegamentiDaEliminare)}: eliminandolo si perderebbe lo storico.{' '}
                      {daEliminare.fornitore.stato === 'DISATTIVATO'
                        ? 'È già disattivato, quindi non riceve più richieste di preventivo.'
                        : 'Puoi disattivarlo: non riceverà più richieste di preventivo, ma i dati restano.'}
                    </>
                  : <><b>{daEliminare.fornitore.nome}</b> verrà eliminato definitivamente. L'operazione non si può annullare.</>}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setDaEliminare(null)}>
              {eliminazioneBloccata && daEliminare.fornitore.stato === 'DISATTIVATO' ? 'Chiudi' : 'Annulla'}
            </button>
            {eliminazioneBloccata && daEliminare.fornitore.stato !== 'DISATTIVATO' && (
              <button type="button" className="btn btn-primary" style={STILE_PULSANTE_ROSSO} disabled={azioneInCorso} onClick={() => cambiaStato(daEliminare.fornitore, 'DISATTIVATO')}>Disattiva invece</button>
            )}
            {collegamentiDaEliminare && !eliminazioneBloccata && !daEliminare.errore && (
              <button type="button" className="btn btn-primary" style={STILE_PULSANTE_ROSSO} disabled={azioneInCorso} onClick={() => elimina(daEliminare.fornitore)}>Elimina</button>
            )}
          </div>
        </Modale>
      )}
    </div>
  );
}
