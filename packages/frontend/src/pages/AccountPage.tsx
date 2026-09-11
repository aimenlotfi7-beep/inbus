import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import '../styles/account.css';
import { AccountShell } from '../features/AccountShell';
import { prenotazioniApi } from '../api/prenotazioni';
import { utentiApi, type PreferenzePrivacy } from '../api/utenti';
import { eventiApi } from '../api/eventi';
import { chatApi, type ConversazioneConMessaggi } from '../api/chat';
import type { Prenotazione, Evento } from '../api/types';
import { CookieBanner, LinkPreferenzeCookie } from '../features/CookieBanner';
import { clienteLoggato, logoutCliente } from '../features/clienteSessione';
import { clienteAuthApi, type DatiCliente } from '../api/clienteAuth';
import { ErroreApi } from '../api/client';
import { listaAttesaApi, type MiaIscrizione } from '../api/listaAttesa';
import { DettaglioViaggioModale } from '../features/DettaglioViaggioModale';
import { calcolaStatoPrenotazione } from '../features/statoPrenotazione';
import { formattaEuro } from '../shared/formato';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type Sezione = 'dashboard' | 'profilo' | 'viaggi' | 'lista-attesa' | 'credito' | 'invita' | 'privacy' | 'chat';

interface MovimentoCredito {
  id: string;
  importo: string;
  motivo: string;
  creatoIl: string;
}

export function AccountPage() {
  const [email, setEmail] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [caricandoSessione, setCaricandoSessione] = useState(true);
  const navigate = useNavigate();
  // La sezione attiva vive nell'indirizzo (?sezione=profilo), non solo
  // nello stato del componente: così se l'utente ricarica la pagina (o
  // usa avanti/indietro del browser) resta dove si trovava, invece di
  // tornare sempre alla prima sezione.
  const [searchParams, setSearchParams] = useSearchParams();
  const sezioniValide: Sezione[] = ['dashboard', 'profilo', 'viaggi', 'lista-attesa', 'credito', 'invita', 'privacy', 'chat'];
  const sezioneUrl = searchParams.get('sezione') as Sezione | null;
  const sezione: Sezione = sezioneUrl && sezioniValide.includes(sezioneUrl) ? sezioneUrl : 'dashboard';
  function setSezione(nuova: Sezione) {
    setSearchParams(nuova === 'dashboard' ? {} : { sezione: nuova });
  }
  // Quale prenotazione mostrare nella "travel card" — condiviso tra
  // dashboard e l'elenco viaggi, così un click apre la stessa cosa da
  // qualsiasi punto ci si trovi.
  const [pnrAperto, setPnrAperto] = useState<string | null>(null);

  // Prima Dashboard e Viaggi lo scaricavano OGNUNA per conto proprio
  // (stessa lista di prenotazioni, stesso giro "un evento per volta" a
  // recuperare i dettagli) — ogni volta che si passava dall'una
  // all'altra, si rifaceva tutto da capo. Un solo posto, condiviso da
  // entrambe via props.
  const [viaggi, setViaggi] = useState<Prenotazione[] | null>(null);
  const [eventiPerId, setEventiPerId] = useState<Record<string, Evento>>({});
  useEffect(() => {
    if (!email) return;
    prenotazioniApi.listByEmail(email).then(async (lista) => {
      setViaggi(lista);
      const idUnici = [...new Set(lista.map((p) => p.eventoId))];
      const eventi = await Promise.all(idUnici.map((id) => eventiApi.getById(id).catch(() => null)));
      const mappa: Record<string, Evento> = {};
      eventi.forEach((ev) => { if (ev) mappa[ev.id] = ev; });
      setEventiPerId(mappa);
    });
  }, [email]);

  // Niente più email digitata a mano: se non c'è un accesso vero
  // (token valido), si va dritti alla pagina di accesso — tornando qui
  // dopo, grazie al parametro "dopo".
  useEffect(() => {
    if (!clienteLoggato()) {
      navigate('/accedi?dopo=' + encodeURIComponent('/account' + (sezioneUrl ? `?sezione=${sezioneUrl}` : '')));
      return;
    }
    clienteAuthApi.me()
      .then((dati) => { setEmail(dati.email); setNomeCliente([dati.nome, dati.cognome].filter(Boolean).join(' ')); })
      .catch(() => { logoutCliente(); navigate('/accedi?dopo=' + encodeURIComponent('/account')); })
      .finally(() => setCaricandoSessione(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function esci() {
    logoutCliente();
    navigate('/accedi');
  }

  const vociMenu: { id: Sezione; label: string }[] = [
    { id: 'dashboard', label: 'Il mio centro' },
    { id: 'viaggi', label: 'I miei viaggi' },
    { id: 'lista-attesa', label: 'Lista d\'attesa' },
    { id: 'credito', label: 'Credito fedeltà' },
    { id: 'invita', label: 'Invita un amico' },
    { id: 'chat', label: 'Messaggi' },
    { id: 'profilo', label: 'Il mio profilo' },
    { id: 'privacy', label: 'Preferenze Privacy' },
  ];

  if (caricandoSessione) return null; // evita un lampo della pagina prima del reindirizzamento

  return (
    <>
      <AccountShell
        etichettaTipo="il mio account" nomeUtente={nomeCliente || email} onLogout={esci}
        voci={vociMenu} voceAttiva={sezione} onCambiaVoce={(v) => setSezione(v as Sezione)}
      >
        <div className="account-content">
          {sezione === 'dashboard' && <SezioneDashboard email={email} viaggi={viaggi} eventiPerId={eventiPerId} onNavigare={setSezione} onAprireViaggio={setPnrAperto} />}
          {sezione === 'profilo' && <SezioneProfilo email={email} />}
          {sezione === 'viaggi' && <SezioneViaggi email={email} viaggi={viaggi} eventiPerId={eventiPerId} onAprireViaggio={setPnrAperto} />}
          {sezione === 'lista-attesa' && <SezioneListaAttesa email={email} />}
          {sezione === 'credito' && <SezioneCredito email={email} />}
          {sezione === 'invita' && <SezioneInvitaAmico />}
          {sezione === 'privacy' && <SezionePrivacy email={email} />}
          {sezione === 'chat' && <SezioneChat email={email} />}
        </div>
      </AccountShell>

      {pnrAperto && (
        <DettaglioViaggioModale
          pnr={pnrAperto}
          email={email}
          onClose={() => setPnrAperto(null)}
          onVaiAllaChat={() => { setPnrAperto(null); setSezione('chat'); }}
        />
      )}
      <CookieBanner />
    </>
  );
}

function SezioneProfilo({ email }: { email: string }) {
  const navigate = useNavigate();
  const [dati, setDati] = useState<DatiCliente | null>(null);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [citta, setCitta] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [messaggio, setMessaggio] = useState('');
  const [erroreSalva, setErroreSalva] = useState('');

  const [zonaEliminaAperta, setZonaEliminaAperta] = useState(false);
  const [passwordElimina, setPasswordElimina] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [erroreElimina, setErroreElimina] = useState('');

  useEffect(() => {
    clienteAuthApi.me().then((d) => {
      setDati(d);
      setNome(d.nome ?? ''); setCognome(d.cognome ?? ''); setTelefono(d.telefono ?? ''); setCitta(d.citta ?? '');
      setDataNascita(d.dataNascita ? d.dataNascita.slice(0, 10) : '');
    });
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErroreSalva(''); setMessaggio(''); setSalvando(true);
    try {
      await clienteAuthApi.aggiornaProfilo({ nome, cognome, telefono: telefono || undefined, citta: citta || undefined, dataNascita });
      setMessaggio('Dati salvati.');
      setTimeout(() => setMessaggio(''), 3000);
    } catch (err) {
      setErroreSalva(err instanceof ErroreApi ? err.message : 'Errore di rete — riprova.');
    } finally {
      setSalvando(false);
    }
  }

  async function eliminaAccount(e: React.FormEvent) {
    e.preventDefault();
    setErroreElimina(''); setEliminando(true);
    try {
      await clienteAuthApi.eliminaAccount(passwordElimina);
      logoutCliente();
      navigate('/');
    } catch (err) {
      setErroreElimina(err instanceof ErroreApi ? err.message : 'Errore di rete — riprova.');
      setEliminando(false);
    }
  }

  if (!dati) return <section className="acc-sezione"><h1>Il mio profilo</h1><p style={{ color: 'var(--mist)' }}>Carico...</p></section>;

  return (
    <section className="acc-sezione">
      <h1>Il mio profilo</h1>

      <form onSubmit={salva} className="panel-box">
        <h2>I miei dati</h2>
        <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 14 }}>
          Sei collegato con l'indirizzo <b style={{ color: 'var(--paper)' }}>{email}</b> — non modificabile da qui.
        </p>

        <div className="due-colonne-auth">
          <div>
            <label className="field-label">Nome</label>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Cognome</label>
            <input type="text" value={cognome} onChange={(e) => setCognome(e.target.value)} required />
          </div>
        </div>
        <div className="due-colonne-auth">
          <div>
            <label className="field-label">Telefono</label>
            <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Città</label>
            <input type="text" value={citta} onChange={(e) => setCitta(e.target.value)} />
          </div>
        </div>
        <label className="field-label">Data di nascita</label>
        <input type="date" value={dataNascita} onChange={(e) => setDataNascita(e.target.value)} required style={{ maxWidth: 200 }} />

        {erroreSalva && <p className="errore">{erroreSalva}</p>}
        {messaggio && <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 8 }}>{messaggio}</p>}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 14, width: 'auto' }} disabled={salvando}>
          {salvando ? 'Salvo...' : 'Salva le modifiche'}
        </button>
      </form>

      <div className="panel-box" style={{ marginTop: 22, borderColor: '#c0392b' }}>
        <h2 style={{ color: '#e74c3c' }}>Elimina il mio account</h2>
        <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 14 }}>
          I tuoi dati personali (nome, telefono, città) vengono rimossi e non potrai più accedere. Le prenotazioni
          già fatte restano nello storico per motivi contabili, ma non saranno più collegate a un account attivo.
          <b style={{ color: 'var(--paper)' }}> Questa azione non si può annullare.</b>
        </p>

        {!zonaEliminaAperta ? (
          <button type="button" className="btn btn-ghost" style={{ borderColor: '#c0392b', color: '#e74c3c' }} onClick={() => setZonaEliminaAperta(true)}>
            Elimina il mio account
          </button>
        ) : (
          <form onSubmit={eliminaAccount}>
            <label className="field-label">Conferma la tua password per procedere</label>
            <input type="password" value={passwordElimina} onChange={(e) => setPasswordElimina(e.target.value)} required autoFocus />
            {erroreElimina && <p className="errore">{erroreElimina}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="submit" className="btn" style={{ width: 'auto', background: '#c0392b', color: '#fff' }} disabled={eliminando}>
                {eliminando ? 'Elimino...' : 'Conferma eliminazione'}
              </button>
              <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => { setZonaEliminaAperta(false); setPasswordElimina(''); setErroreElimina(''); }}>
                Annulla
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/** Il credito fedeltà, in una sua sezione dedicata — diviso tra quanto
 *  maturato in totale (guadagnato dai viaggi) e quanto già usato, non
 *  solo il saldo attuale come prima. */
function SezioneCredito({ email }: { email: string }) {
  const [disponibile, setDisponibile] = useState<number | null>(null);
  const [movimenti, setMovimenti] = useState<MovimentoCredito[] | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/credito?email=${encodeURIComponent(email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDisponibile(d ? d.disponibile : 0))
      .catch(() => setDisponibile(0));
    fetch(`${API_URL}/api/credito/movimenti?email=${encodeURIComponent(email)}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setMovimenti)
      .catch(() => setMovimenti([]));
  }, [email]);

  const maturati = movimenti?.filter((m) => Number(m.importo) > 0) ?? [];
  const utilizzati = movimenti?.filter((m) => Number(m.importo) < 0) ?? [];
  const totaleMaturato = maturati.reduce((s, m) => s + Number(m.importo), 0);
  const totaleUtilizzato = utilizzati.reduce((s, m) => s + Math.abs(Number(m.importo)), 0);

  return (
    <section className="acc-sezione">
      <h1>Credito fedeltà</h1>

      <div className="panel-box" style={{ background: 'rgba(72,214,140,.1)', borderColor: 'var(--green)' }}>
        <h2>Disponibile ora</h2>
        <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 30, color: 'var(--green)', margin: '4px 0' }}>
          {formattaEuro(disponibile ?? 0)}
        </p>
        <p style={{ color: 'var(--mist)', fontSize: 13 }}>
          Maturato dai tuoi viaggi — spendibile su qualsiasi prenotazione futura, non scade mai.
        </p>
      </div>

      <div className="stats-row" style={{ margin: '18px 0' }}>
        <div className="stat-box"><b style={{ color: 'var(--green)' }}>+{formattaEuro(totaleMaturato)}</b><span>Credito maturato (totale)</span></div>
        <div className="stat-box"><b>-{formattaEuro(totaleUtilizzato)}</b><span>Credito utilizzato (totale)</span></div>
      </div>

      {movimenti === null && <p style={{ color: 'var(--mist)' }}>Carico...</p>}

      {maturati.length > 0 && (
        <>
          <p className="section-label" style={{ marginTop: 18 }}>Maturato</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {maturati.map((m) => (
              <div key={m.id} className="viaggio-card" style={{ padding: '10px 14px' }}>
                <div className="viaggio-main">
                  <p style={{ margin: 0, fontSize: 13.5 }}>{m.motivo}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--mist)' }}>{new Date(m.creatoIl).toLocaleDateString('it-IT')}</p>
                </div>
                <b style={{ color: 'var(--green)' }}>+{formattaEuro(m.importo)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {utilizzati.length > 0 && (
        <>
          <p className="section-label" style={{ marginTop: 18 }}>Utilizzato</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {utilizzati.map((m) => (
              <div key={m.id} className="viaggio-card" style={{ padding: '10px 14px' }}>
                <div className="viaggio-main">
                  <p style={{ margin: 0, fontSize: 13.5 }}>{m.motivo}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--mist)' }}>{new Date(m.creatoIl).toLocaleDateString('it-IT')}</p>
                </div>
                <b>-{formattaEuro(Math.abs(Number(m.importo)))}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {movimenti?.length === 0 && <p className="testo-intro">Nessun movimento ancora — matura dopo il tuo primo viaggio pagato per intero.</p>}
    </section>
  );
}

function SezioneInvitaAmico() {
  const [dati, setDati] = useState<{ codice: string; invitati: { nome: string; completato: boolean }[] } | null>(null);
  const [copiato, setCopiato] = useState(false);

  useEffect(() => {
    clienteAuthApi.meReferral().then(setDati).catch(() => {});
  }, []);

  const link = dati ? `${window.location.origin}/registrati?ref=${dati.codice}` : '';

  function copia() {
    navigator.clipboard.writeText(link).then(() => {
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2200);
    });
  }

  const inSospeso = dati?.invitati.filter((i) => !i.completato) ?? [];
  const completati = dati?.invitati.filter((i) => i.completato) ?? [];

  return (
    <section className="acc-sezione">
      <h1>Invita un amico</h1>
      <p className="testo-intro" style={{ marginBottom: 18 }}>
        Condividi il tuo link — quando un amico si registra e completa la sua prima prenotazione, un bonus finisce sul credito fedeltà di entrambi.
      </p>

      {!dati && <p style={{ color: 'var(--mist)' }}>Carico...</p>}

      {dati && (
        <>
          <div className="panel-box">
            <h2>Il tuo link</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <input type="text" readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()} style={{ flex: '1 1 260px', fontSize: 13 }} />
              <button type="button" className="btn btn-primary" onClick={copia} style={{ flexShrink: 0 }}>{copiato ? '✓ Copiato' : 'Copia link'}</button>
            </div>
            <p style={{ color: 'var(--mist)', fontSize: 12.5, marginTop: 10 }}>
              Oppure condividi solo il codice: <b style={{ letterSpacing: 1 }}>{dati.codice}</b>
            </p>
          </div>

          <div className="stats-row" style={{ margin: '18px 0' }}>
            <div className="stat-box"><b>{inSospeso.length}</b><span>Inviti in sospeso</span></div>
            <div className="stat-box"><b style={{ color: 'var(--green)' }}>{completati.length}</b><span>Inviti completati</span></div>
          </div>

          {inSospeso.length > 0 && (
            <>
              <p className="section-label" style={{ marginTop: 18 }}>In sospeso</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {inSospeso.map((i, idx) => (
                  <div key={idx} className="viaggio-card" style={{ padding: '10px 14px' }}>
                    <div className="viaggio-main"><p style={{ margin: 0, fontSize: 13.5 }}>{i.nome}</p></div>
                    <span style={{ fontSize: 12, color: 'var(--mist)' }}>Registrato, non ha ancora prenotato</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {completati.length > 0 && (
            <>
              <p className="section-label" style={{ marginTop: 18 }}>Completati</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {completati.map((i, idx) => (
                  <div key={idx} className="viaggio-card" style={{ padding: '10px 14px' }}>
                    <div className="viaggio-main"><p style={{ margin: 0, fontSize: 13.5 }}>{i.nome}</p></div>
                    <b style={{ color: 'var(--green)' }}>✓ Bonus ricevuto</b>
                  </div>
                ))}
              </div>
            </>
          )}

          {dati.invitati.length === 0 && <p className="testo-intro">Nessun invito ancora — condividi il tuo link per iniziare.</p>}
        </>
      )}
    </section>
  );
}

/** Un blocco di consenso in stile "ACCONSENTO / NON ACCONSENTO" — lo
 *  stesso pattern usato da Vivaticket e altre piattaforme di
 *  biglietteria: due pulsanti mutuamente esclusivi, nessuno dei due
 *  preselezionato di default finché il cliente non ha scelto davvero
 *  (mai dare per scontato un consenso). */
function BloccoConsenso({ titolo, descrizione, valore, onScegli, salvando }: {
  titolo: string; descrizione: string; valore: boolean | null; onScegli: (v: boolean) => void; salvando: boolean;
}) {
  return (
    <div className="panel-box">
      <h2>{titolo}</h2>
      <p style={{ color: 'var(--mist)', fontSize: 13.5, marginBottom: 10 }}>{descrizione}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          disabled={salvando}
          onClick={() => onScegli(true)}
          className={`btn ${valore === true ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 13 }}
        >
          {valore === true ? '✓ ' : ''}Acconsento
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => onScegli(false)}
          className={`btn ${valore === false ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 13 }}
        >
          {valore === false ? '✓ ' : ''}Non acconsento
        </button>
      </div>
      {valore === null && <p style={{ fontSize: 11.5, color: 'var(--mist)', marginTop: 8 }}>Non hai ancora scelto.</p>}
    </div>
  );
}

function SezionePrivacy({ email }: { email: string }) {
  const [preferenze, setPreferenze] = useState<PreferenzePrivacy | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    utentiApi.preferenzePrivacy(email).then(setPreferenze);
  }, [email]);

  async function aggiorna(campo: keyof PreferenzePrivacy, valore: boolean) {
    setSalvando(true);
    try {
      const nuove = await utentiApi.aggiornaPreferenzePrivacy(email, { [campo]: valore });
      setPreferenze(nuove);
    } catch {
      alert('Salvataggio non riuscito, riprova.');
    } finally {
      setSalvando(false);
    }
  }

  if (!preferenze) return <section className="acc-sezione"><h1>Preferenze Privacy</h1><p>Carico...</p></section>;

  return (
    <section className="acc-sezione">
      <h1>Preferenze Privacy</h1>
      <p style={{ color: 'var(--mist)', fontSize: 13.5, marginBottom: 18 }}>
        Rivedi o cambia in qualsiasi momento come usiamo i tuoi dati. Leggi anche la nostra{' '}
        <Link to="/pagina/privacy" style={{ color: 'var(--paper)', textDecoration: 'underline' }}>informativa completa sulla privacy</Link>.
      </p>

      <BloccoConsenso
        titolo="Informativa sulla privacy"
        descrizione="Confermo di aver letto l'informativa sul trattamento dei dati personali."
        valore={preferenze.presaVisioneInformativa}
        onScegli={(v) => aggiorna('presaVisioneInformativa', v)}
        salvando={salvando}
      />
      <BloccoConsenso
        titolo="Comunicazioni di marketing"
        descrizione="Desidero ricevere email su novità, nuovi eventi e promozioni da OnWay."
        valore={preferenze.consensoMarketing}
        onScegli={(v) => aggiorna('consensoMarketing', v)}
        salvando={salvando}
      />
      <BloccoConsenso
        titolo="Profilazione"
        descrizione="Acconsento all'uso dei miei dati (es. eventi visti o prenotati) per ricevere proposte più in linea con i miei gusti."
        valore={preferenze.consensoProfilazione}
        onScegli={(v) => aggiorna('consensoProfilazione', v)}
        salvando={salvando}
      />

      <div className="panel-box">
        <h2>Cookie</h2>
        <p style={{ color: 'var(--mist)', fontSize: 13.5, marginBottom: 10 }}>
          Puoi rivedere o cambiare in qualsiasi momento quali cookie hai accettato su questo dispositivo.
        </p>
        <LinkPreferenzeCookie />
      </div>
    </section>
  );
}

/** Il "centro di controllo" — prima cosa che il cliente vede entrando
 *  nella sua area: se ha un viaggio futuro, è la prima cosa in
 *  assoluto che vede, non deve andarselo a cercare. */
function SezioneDashboard({ email, viaggi, eventiPerId, onNavigare, onAprireViaggio }: {
  email: string;
  viaggi: Prenotazione[] | null;
  eventiPerId: Record<string, Evento>;
  onNavigare: (s: Sezione) => void;
  onAprireViaggio: (pnr: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [messaggiNonLetti, setMessaggiNonLetti] = useState(0);
  const [inListaAttesa, setInListaAttesa] = useState(0);

  useEffect(() => {
    clienteAuthApi.me().then((d) => setNome(d.nome ?? ''));
    chatApi.storicoCliente(email).then((conv) => {
      const attiva = conv.find((c) => c.stato !== 'CHIUSA');
      setMessaggiNonLetti(attiva?.messaggi.filter((m) => m.autore === 'ADMIN').length ?? 0);
    });
    listaAttesaApi.mieIscrizioni(email).then((l) => setInListaAttesa(l.length)).catch(() => {});
  }, [email]);

  // Il "prossimo evento" ora si ricava dai dati già arrivati dal padre
  // (viaggi + eventiPerId, condivisi con la sezione Viaggi) invece di
  // un giro proprio a recuperare di nuovo gli stessi dettagli evento.
  const oggi = new Date().toISOString().slice(0, 10);
  const confermati = viaggi?.filter((p) => p.stato === 'CONFERMATA') ?? [];
  const futuri = confermati
    .map((p) => ({ p, ev: eventiPerId[p.eventoId] }))
    .filter((c): c is { p: Prenotazione; ev: Evento } => !!c.ev && c.ev.data >= oggi)
    .sort((a, b) => a.ev.data.localeCompare(b.ev.data));
  const eventoProssimo = futuri[0]?.ev ?? null;

  const prenotazioneProssima = eventoProssimo ? viaggi?.find((p) => p.eventoId === eventoProssimo.id && p.stato === 'CONFERMATA') : null;

  const giorniAlViaggio = eventoProssimo ? Math.ceil((new Date(eventoProssimo.data).getTime() - Date.now()) / (24 * 3600 * 1000)) : null;

  return (
    <section className="acc-sezione">
      <h1>Ciao{nome ? `, ${nome}` : ''}!</h1>

      {viaggi === null && <p style={{ color: 'var(--mist)' }}>Carico...</p>}

      {viaggi !== null && eventoProssimo && prenotazioneProssima && (
        <div className="panel-box" style={{ background: 'linear-gradient(135deg, rgba(255,212,0,.14), rgba(255,212,0,.04))', borderColor: 'var(--pink)' }}>
          {giorniAlViaggio === 0 ? (
            <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--pink)', margin: '0 0 6px' }}>Il tuo viaggio è oggi!</p>
          ) : giorniAlViaggio === 1 ? (
            <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--pink)', margin: '0 0 6px' }}>Domani si parte!</p>
          ) : (
            <p style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 1, color: 'var(--mist)', margin: '0 0 6px' }}>Il tuo prossimo viaggio</p>
          )}
          <h2 style={{ margin: '0 0 4px' }}>{eventoProssimo.artista}</h2>
          <p style={{ color: 'var(--mist)', fontSize: 13.5, margin: '0 0 14px' }}>
            {prenotazioneProssima.fermataCitta}
            {prenotazioneProssima.fermataOrario && ` · ore ${prenotazioneProssima.fermataOrario}`}
            {' → '}{eventoProssimo.citta}
            {giorniAlViaggio !== null && giorniAlViaggio > 1 && ` · tra ${giorniAlViaggio} giorni`}
          </p>

          {/* Entro il giorno prima, un promemoria pratico invece della
              solita mini-timeline sullo stato del pagamento — quello
              non serve più a ridosso della partenza, quello che serve
              è sapere cosa fare. */}
          {giorniAlViaggio !== null && giorniAlViaggio <= 1 && giorniAlViaggio >= 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 13 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Ricordati:</p>
              <span>• Arrivare in anticipo rispetto all'orario di partenza</span>
              <span>• Avere un documento d'identità con te</span>
              <span>• Avere la prenotazione a portata di mano (basta questa pagina)</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 13 }}>
              <span>✓ Prenotazione confermata</span>
              {prenotazioneProssima.tipoPagamento === 'COMPLETO' || prenotazioneProssima.saldoPagato ? (
                <span>✓ Pagamento completato</span>
              ) : (
                <>
                  <span>✓ Acconto ricevuto</span>
                  <span style={{ color: calcolaStatoPrenotazione(prenotazioneProssima).chiave === 'acconto_scaduto' ? 'var(--pink)' : 'var(--amber, #e0a95b)' }}>
                    {calcolaStatoPrenotazione(prenotazioneProssima).chiave === 'acconto_scaduto' ? '⚠ Termine per il saldo superato' : '⚠ Saldo da versare'}
                    {prenotazioneProssima.scadenzaSaldo ? ` ${calcolaStatoPrenotazione(prenotazioneProssima).chiave === 'acconto_scaduto' ? 'il' : 'entro il'} ${new Date(prenotazioneProssima.scadenzaSaldo).toLocaleDateString('it-IT')}` : ''}
                  </span>
                </>
              )}
            </div>
          )}

          {giorniAlViaggio === 0 && prenotazioneProssima.fermataIndirizzo ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <a
                className="btn btn-primary"
                style={{ textDecoration: 'none', textAlign: 'center' }}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(prenotazioneProssima.fermataIndirizzo)}`}
                target="_blank" rel="noreferrer"
              >
                🗺️ Apri mappa
              </a>
              <button className="btn btn-ghost" onClick={() => onNavigare('chat')}>💬 Chat</button>
              <a className="btn btn-ghost" href="/faq">🛟 Assistenza</a>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => onAprireViaggio(prenotazioneProssima.pnr)}>Apri il viaggio</button>
          )}
        </div>
      )}

      {viaggi !== null && !eventoProssimo && (
        <div className="panel-box">
          <p style={{ margin: '0 0 12px' }}>Non hai ancora un viaggio in programma.</p>
          <Link className="btn btn-primary" to="/">Scopri gli eventi</Link>
        </div>
      )}

      <div className="acc-dashboard-grid">
        <button className="acc-dashboard-tile" onClick={() => onNavigare('viaggi')}>
          <span>Le mie prenotazioni</span>
        </button>
        <button className="acc-dashboard-tile" onClick={() => onNavigare('lista-attesa')}>
          <span>Lista d'attesa{inListaAttesa > 0 ? ` (${inListaAttesa})` : ''}</span>
        </button>
        <button className="acc-dashboard-tile" onClick={() => onNavigare('chat')}>
          <span>Messaggi{messaggiNonLetti > 0 ? ` (${messaggiNonLetti})` : ''}</span>
        </button>
        <button className="acc-dashboard-tile" onClick={() => onNavigare('profilo')}>
          <span>Il mio profilo</span>
        </button>
        <a className="acc-dashboard-tile" href="/faq">
          <span>Assistenza</span>
        </a>
      </div>
    </section>
  );
}

function SezioneListaAttesa({ email }: { email: string }) {
  const [iscrizioni, setIscrizioni] = useState<MiaIscrizione[] | null>(null);

  useEffect(() => { listaAttesaApi.mieIscrizioni(email).then(setIscrizioni); }, [email]);

  return (
    <section className="acc-sezione">
      <h1>Lista d'attesa</h1>
      {iscrizioni === null && <p style={{ color: 'var(--mist)' }}>Carico...</p>}
      {iscrizioni?.length === 0 && <div className="empty-box">Non sei in lista d'attesa per nessun evento al momento.</div>}
      {iscrizioni?.map((i) => (
        <div className="viaggio-card" key={i.id}>
          <div className="viaggio-main">
            <h3>{i.evento?.artista ?? 'Evento'}</h3>
            <p>{i.evento ? `${i.evento.luogo}, ${i.evento.citta} · ${new Date(i.evento.data).toLocaleDateString('it-IT')}` : ''}</p>
            <p>{i.passeggeri} passegger{i.passeggeri > 1 ? 'i' : 'o'}</p>
          </div>
          <div className="viaggio-right">
            <span className="badge attenzione">Sei in lista d'attesa</span>
            <span style={{ fontSize: 13, color: 'var(--mist)' }}>Posizione #{i.posizione}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

function SezioneViaggi({ email, viaggi, eventiPerId, onAprireViaggio }: {
  email: string;
  viaggi: Prenotazione[] | null;
  eventiPerId: Record<string, Evento>;
  onAprireViaggio: (pnr: string) => void;
}) {
  const [tab, setTab] = useState<'prossimi' | 'passati'>('prossimi');

  async function richiediRimborso(pnr: string) {
    const motivo = prompt('Vuoi aggiungere una nota per l\'amministrazione? (facoltativo, puoi lasciare vuoto)') ?? '';
    try {
      await fetch(`${API_URL}/api/richieste-rimborso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pnr, email, motivo: motivo || undefined }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).errore ?? 'Richiesta non riuscita.');
      });
      alert('Richiesta di rimborso inviata — verrà valutata al più presto.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Richiesta non riuscita, riprova.');
    }
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const viaggiFiltrati = (viaggi ?? []).filter((p) => {
    const ev = eventiPerId[p.eventoId];
    if (!ev) return tab === 'prossimi';
    return tab === 'passati' ? ev.data < oggi : ev.data >= oggi;
  });

  return (
    <section className="acc-sezione">
      <h1>I miei viaggi</h1>
      <div className="mini-tabs-acc">
        <button className={`mini-tab-acc${tab === 'prossimi' ? ' active' : ''}`} onClick={() => setTab('prossimi')}>Prossimi viaggi</button>
        <button className={`mini-tab-acc${tab === 'passati' ? ' active' : ''}`} onClick={() => setTab('passati')}>Viaggi passati</button>
      </div>

      {viaggi === null && <p style={{ color: 'var(--mist)' }}>Carico...</p>}
      {viaggi !== null && !viaggiFiltrati.length && (
        <div className="empty-box">{tab === 'passati' ? 'Non hai ancora viaggi passati.' : 'Non risultano prenotazioni future con questa email.'}</div>
      )}

      {viaggiFiltrati.map((p) => {
        const ev = eventiPerId[p.eventoId];
        return (
          <div className="viaggio-card" key={p.id} onClick={() => onAprireViaggio(p.pnr)} style={{ cursor: 'pointer' }}>
            <div className="viaggio-main">
              <span className="tag">{ev?.genere}</span>
              <h3>{ev?.artista ?? 'Evento'}</h3>
              <p>{ev ? `${ev.luogo}, ${ev.citta}` : ''}</p>
              <p>{p.passeggeri} passegger{p.passeggeri > 1 ? 'i' : 'o'} · <span className="pnr-tag">PNR {p.pnr}</span></p>
              <div className="viaggio-riepilogo">
                <div className="riepilogo-riga">
                  <span className="riepilogo-label">Fermata</span>
                  <span>{p.fermataCitta}{p.fermataOrario ? ` · ore ${p.fermataOrario}` : ''}</span>
                </div>
              </div>
            </div>
            <div className="viaggio-right">
              <span className={`badge ${calcolaStatoPrenotazione(p).classe}`}>{calcolaStatoPrenotazione(p).etichetta}</span>
              <span className="totale">{formattaEuro(p.totale)}</span>
              {p.stato === 'CONFERMATA' && (
                <div className="viaggio-azioni">
                  <button className="btn-mini" onClick={(e) => { e.stopPropagation(); richiediRimborso(p.pnr); }}>Richiedi rimborso</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SezioneChat({ email }: { email: string }) {
  const [conversazioni, setConversazioni] = useState<ConversazioneConMessaggi[] | null>(null);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoScelto, setEventoScelto] = useState('');
  const [testo, setTesto] = useState('');
  const [nome, setNome] = useState('');

  function ricarica() { chatApi.storicoCliente(email).then(setConversazioni); }
  useEffect(ricarica, [email]);
  useEffect(() => { eventiApi.list().then(setEventi); }, []);

  // Aggiornamento automatico — così se lo staff risponde non serve
  // ricaricare la pagina per vederlo.
  useEffect(() => {
    const id = setInterval(ricarica, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // La conversazione attiva è la più recente che non sia chiusa — se
  // l'ultima è stata chiusa dallo staff, il prossimo messaggio ne apre
  // una nuova (per questo serve scegliere di nuovo l'evento).
  const attiva = conversazioni?.find((c) => c.stato !== 'CHIUSA') ?? null;
  const chiuse = conversazioni?.filter((c) => c.stato === 'CHIUSA') ?? [];

  async function invia() {
    if (!testo.trim()) return;
    const eventoId = attiva?.eventoId ?? eventoScelto;
    if (!eventoId) { alert("Scegli l'evento su cui hai una domanda."); return; }
    await chatApi.inviaCliente({ eventoId, nome: nome || email, email, testo });
    setTesto('');
    ricarica();
  }

  return (
    <section className="acc-sezione">
      <h1>Chat con lo staff OnWay</h1>
      <div className="acc-chat-box">
        {!attiva && (
          <div id="accChatEventoScelta">
            <select value={eventoScelto} onChange={(e) => setEventoScelto(e.target.value)}>
              <option value="">Scegli l'evento...</option>
              {eventi.map((ev) => <option key={ev.id} value={ev.id}>{ev.artista} — {ev.citta}</option>)}
            </select>
            <input placeholder="Il tuo nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        )}
        <div id="accChatMessages">
          {conversazioni === null && <p style={{ color: 'var(--mist)', padding: 16 }}>Carico...</p>}
          {conversazioni?.length === 0 && <p style={{ color: 'var(--mist)', padding: 16 }}>Nessun messaggio ancora. Scrivi la tua prima domanda qui sotto.</p>}
          {attiva?.messaggi.map((m) => (
            <div className={`chat-bubble-mini ${m.autore.toLowerCase()}`} key={m.id}>
              {m.testo}
              <div className="meta">{m.autore === 'CLIENTE' ? 'Tu' : 'Staff OnWay'} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
            </div>
          ))}
        </div>
        <div className="acc-chat-input-row">
          <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi un messaggio..." onKeyDown={(e) => e.key === 'Enter' && invia()} />
          <button className="btn btn-primary" onClick={invia}>Invia</button>
        </div>
      </div>

      {chiuse.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="section-label">Conversazioni precedenti</p>
          {chiuse.map((c) => (
            <details key={c.id} style={{ background: 'var(--dusk)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                {new Date(c.creataIl).toLocaleDateString('it-IT')} — {c.messaggi.length} messaggi
              </summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.messaggi.map((m) => (
                  <div key={m.id} className={`chat-bubble-mini ${m.autore.toLowerCase()}`}>
                    {m.testo}
                    <div className="meta">{m.autore === 'CLIENTE' ? 'Tu' : 'Staff OnWay'} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
