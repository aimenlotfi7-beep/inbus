import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import '../styles/account.css';
import { prenotazioniApi } from '../api/prenotazioni';
import { utentiApi, type PreferenzePrivacy } from '../api/utenti';
import { eventiApi } from '../api/eventi';
import { chatApi, type ConversazioneConMessaggi } from '../api/chat';
import type { Prenotazione, Evento } from '../api/types';
import { HomePage } from './HomePage';
import { CookieBanner, LinkPreferenzeCookie } from '../features/CookieBanner';
import { clienteLoggato, logoutCliente } from '../features/clienteSessione';
import { clienteAuthApi } from '../api/clienteAuth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type Sezione = 'eventi' | 'profilo' | 'viaggi' | 'privacy' | 'chat';

export function AccountPage() {
  const [email, setEmail] = useState('');
  const [caricandoSessione, setCaricandoSessione] = useState(true);
  const navigate = useNavigate();
  // La sezione attiva vive nell'indirizzo (?sezione=profilo), non solo
  // nello stato del componente: così se l'utente ricarica la pagina (o
  // usa avanti/indietro del browser) resta dove si trovava, invece di
  // tornare sempre alla prima sezione.
  const [searchParams, setSearchParams] = useSearchParams();
  const sezioniValide: Sezione[] = ['eventi', 'profilo', 'viaggi', 'privacy', 'chat'];
  const sezioneUrl = searchParams.get('sezione') as Sezione | null;
  const sezione: Sezione = sezioneUrl && sezioniValide.includes(sezioneUrl) ? sezioneUrl : 'eventi';
  function setSezione(nuova: Sezione) {
    setSearchParams(nuova === 'eventi' ? {} : { sezione: nuova });
  }
  const [menuAperto, setMenuAperto] = useState(false);

  // Niente più email digitata a mano: se non c'è un accesso vero
  // (token valido), si va dritti alla pagina di accesso — tornando qui
  // dopo, grazie al parametro "dopo".
  useEffect(() => {
    if (!clienteLoggato()) {
      navigate('/accedi?dopo=' + encodeURIComponent('/account' + (sezioneUrl ? `?sezione=${sezioneUrl}` : '')));
      return;
    }
    clienteAuthApi.me()
      .then((dati) => setEmail(dati.email))
      .catch(() => { logoutCliente(); navigate('/accedi?dopo=' + encodeURIComponent('/account')); })
      .finally(() => setCaricandoSessione(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function esci() {
    logoutCliente();
    navigate('/accedi');
  }

  const vociMenu: { id: Sezione; label: string }[] = [
    { id: 'eventi', label: 'Eventi' },
    { id: 'profilo', label: 'Il mio profilo' },
    { id: 'viaggi', label: 'I miei viaggi' },
    { id: 'privacy', label: 'Preferenze Privacy' },
    { id: 'chat', label: 'Chat' },
  ];

  if (caricandoSessione) return null; // evita un lampo della pagina prima del reindirizzamento

  return (
    <>
      <header>
        <Link className="logo" to="/">IN<span>BUS</span></Link>
        <div className="header-right">
          <div className={`my-inbus-wrap${menuAperto ? ' open' : ''}`}>
            <button className="my-inbus-btn" onClick={() => setMenuAperto(!menuAperto)}>My INBUS <span className="caret">▾</span></button>
            <div className={`my-inbus-dropdown${menuAperto ? '' : ' hidden'}`}>
              <div className="dropdown-chi">Accesso come<b>{email}</b></div>
              {vociMenu.map((v) => (
                <button key={v.id} className="acc-nav-btn" onClick={() => { setSezione(v.id); setMenuAperto(false); }}>{v.label}</button>
              ))}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={esci}>Esci</button>
        </div>
      </header>

      <div id="accountShell">
        {sezione !== 'eventi' && (
          <div className="account-content">
            {sezione === 'profilo' && <SezioneProfilo email={email} />}
            {sezione === 'viaggi' && <SezioneViaggi email={email} />}
            {sezione === 'privacy' && <SezionePrivacy email={email} />}
            {sezione === 'chat' && <SezioneChat email={email} />}
          </div>
        )}
        {sezione === 'eventi' && (
          <section className="acc-sezione-sito">
            <HomePage />
          </section>
        )}
      </div>
      <CookieBanner />
    </>
  );
}

function SezioneProfilo({ email }: { email: string }) {
  const [credito, setCredito] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/credito?email=${encodeURIComponent(email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setCredito(d ? d.disponibile : 0))
      .catch(() => setCredito(0));
  }, [email]);

  return (
    <section className="acc-sezione">
      <h1>Il mio profilo</h1>

      {credito !== null && credito > 0 && (
        <div className="panel-box" style={{ background: 'rgba(72,214,140,.1)', borderColor: 'var(--green)' }}>
          <h2>Il tuo credito fedeltà</h2>
          <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 26, color: 'var(--green)', margin: '4px 0' }}>
            €{credito.toFixed(2)}
          </p>
          <p style={{ color: 'var(--mist)', fontSize: 13 }}>
            Maturato dai tuoi viaggi passati — spendibile su qualsiasi prenotazione futura, non scade mai. Potrai
            usarlo direttamente al momento del pagamento.
          </p>
        </div>
      )}

      <div className="panel-box">
        <h2>I miei dati</h2>
        <p style={{ color: 'var(--mist)', fontSize: 13.5 }}>
          Sei collegato con l'indirizzo <b style={{ color: 'var(--paper)' }}>{email}</b>. I tuoi dati (nome,
          telefono, indirizzo...) vengono salvati automaticamente ogni volta che completi una prenotazione.
        </p>
      </div>
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
        descrizione="Desidero ricevere email su novità, nuovi eventi e promozioni da INBUS."
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

function SezioneViaggi({ email }: { email: string }) {
  const [tab, setTab] = useState<'prossimi' | 'passati'>('prossimi');
  const [viaggi, setViaggi] = useState<Prenotazione[] | null>(null);
  const [eventiPerId, setEventiPerId] = useState<Record<string, Evento>>({});

  useEffect(() => {
    prenotazioniApi.listByEmail(email).then(async (lista) => {
      setViaggi(lista);
      const idUnici = [...new Set(lista.map((p) => p.eventoId))];
      const eventi = await Promise.all(idUnici.map((id) => eventiApi.getById(id).catch(() => null)));
      const mappa: Record<string, Evento> = {};
      eventi.forEach((ev) => { if (ev) mappa[ev.id] = ev; });
      setEventiPerId(mappa);
    });
  }, [email]);

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
          <div className="viaggio-card" key={p.id}>
            <div className="viaggio-main">
              <span className="tag">{ev?.genere}</span>
              <h3>{ev?.artista ?? 'Evento'}</h3>
              <p>{ev ? `${ev.luogo}, ${ev.citta}` : ''}</p>
              <p>{p.passeggeri} passegger{p.passeggeri > 1 ? 'i' : 'o'} · <span className="pnr-tag">PNR {p.pnr}</span></p>
              <div className="viaggio-riepilogo">
                <div className="riepilogo-riga">
                  <span className="riepilogo-label">📍 Fermata</span>
                  <span>{p.fermataCitta}{p.fermataOrario ? ` · ore ${p.fermataOrario}` : ''}</span>
                </div>
              </div>
            </div>
            <div className="viaggio-right">
              <span className={`badge ${p.stato === 'CONFERMATA' ? 'pagato' : 'scaduto'}`}>{p.stato === 'CONFERMATA' ? 'Confermata' : 'Cancellata'}</span>
              <span className="totale">€{Number(p.totale).toFixed(2)}</span>
              {p.stato === 'CONFERMATA' && (
                <div className="viaggio-azioni">
                  <button className="btn-mini" onClick={() => richiediRimborso(p.pnr)}>Richiedi rimborso</button>
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
      <h1>Chat con lo staff INBUS</h1>
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
              <div className="meta">{m.autore === 'CLIENTE' ? 'Tu' : 'Staff INBUS'} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
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
                    <div className="meta">{m.autore === 'CLIENTE' ? 'Tu' : 'Staff INBUS'} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
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
