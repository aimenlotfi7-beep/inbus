import { useEffect, useRef, useState } from 'react';
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
import { clienteAuthApi, ErroreClienteAuth, type DatiCliente } from '../api/clienteAuth';
import { ErroreApi } from '../api/client';
import { listaAttesaApi, type MiaIscrizione } from '../api/listaAttesa';
import { DettaglioViaggioModale } from '../features/DettaglioViaggioModale';
import { ModaleRimborso } from '../features/ModaleRimborso';
import { calcolaStatoPrenotazione } from '../features/statoPrenotazione';
import { formattaEuro, formattaData, plurale } from '../shared/formato';
import { Icona } from '../features/Icone';
import { CampoTesto } from '../features/checkout/CampoTesto';
import { CampoPassword } from '../features/CampoPassword';
import { useSeoTags } from '../features/useSeoTags';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type Sezione = 'dashboard' | 'profilo' | 'viaggi' | 'lista-attesa' | 'credito' | 'invita' | 'privacy' | 'chat';

interface MovimentoCredito {
  id: string;
  importo: string;
  motivo: string;
  creatoIl: string;
}

/** "sab 17 ott": la data di un viaggio si legge a colpo d'occhio, senza
 *  l'anno che qui non serve mai (i viaggi sono sempre a pochi mesi). */
const formatoDataBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
function dataBreve(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : formatoDataBreve.format(d);
}

/** Giorni interi che mancano a una data (0 = oggi). */
function giorniAllaData(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

export function AccountPage() {
  const [email, setEmail] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [nomeProprio, setNomeProprio] = useState('');
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
  // panoramica ed elenco viaggi, così un click apre la stessa cosa da
  // qualsiasi punto ci si trovi.
  const [pnrAperto, setPnrAperto] = useState<string | null>(null);

  useSeoTags({
    title: 'Il mio account — OnWay',
    description: 'I tuoi viaggi, il tuo credito e i tuoi dati OnWay in un posto solo.',
    url: `${window.location.origin}/account`,
  });

  // Prima Panoramica e Viaggi lo scaricavano OGNUNA per conto proprio
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
      .then((dati) => {
        setEmail(dati.email);
        setNomeProprio(dati.nome ?? '');
        setNomeCliente([dati.nome, dati.cognome].filter(Boolean).join(' '));
      })
      .catch(() => { logoutCliente(); navigate('/accedi?dopo=' + encodeURIComponent('/account')); })
      .finally(() => setCaricandoSessione(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function esci() {
    logoutCliente();
    navigate('/accedi');
  }

  const vociMenu: { id: Sezione; label: string }[] = [
    { id: 'dashboard', label: 'Panoramica' },
    { id: 'viaggi', label: 'I miei viaggi' },
    { id: 'lista-attesa', label: 'Lista d\'attesa' },
    { id: 'credito', label: 'Credito' },
    { id: 'invita', label: 'Invita un amico' },
    { id: 'chat', label: 'Messaggi' },
    { id: 'profilo', label: 'Profilo' },
    { id: 'privacy', label: 'Privacy' },
  ];

  if (caricandoSessione) return null; // evita un lampo della pagina prima del reindirizzamento

  return (
    <>
      <AccountShell
        etichettaTipo="il mio account" nomeUtente={nomeCliente || email} onLogout={esci} esciInSezione
        voci={vociMenu} voceAttiva={sezione} onCambiaVoce={(v) => setSezione(v as Sezione)}
      >
        <div className="account-content">
          {sezione === 'dashboard' && <SezionePanoramica nome={nomeProprio} email={email} viaggi={viaggi} eventiPerId={eventiPerId} onNavigare={setSezione} onAprireViaggio={setPnrAperto} />}
          {sezione === 'profilo' && <SezioneProfilo email={email} onEsci={esci} />}
          {sezione === 'viaggi' && <SezioneViaggi email={email} viaggi={viaggi} eventiPerId={eventiPerId} onAprireViaggio={setPnrAperto} />}
          {sezione === 'lista-attesa' && <SezioneListaAttesa email={email} />}
          {sezione === 'credito' && <SezioneCredito email={email} />}
          {sezione === 'invita' && <SezioneInvitaAmico />}
          {sezione === 'privacy' && <SezionePrivacy email={email} />}
          {sezione === 'chat' && <SezioneChat email={email} nome={nomeCliente} />}
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

/* ============================================================
   PANORAMICA
   ============================================================ */

/** La prima cosa che si vede entrando: se c'è un viaggio in programma è
 *  anche la prima cosa in assoluto, senza doverla cercare. */
function SezionePanoramica({ nome, email, viaggi, eventiPerId, onNavigare, onAprireViaggio }: {
  nome: string;
  email: string;
  viaggi: Prenotazione[] | null;
  eventiPerId: Record<string, Evento>;
  onNavigare: (s: Sezione) => void;
  onAprireViaggio: (pnr: string) => void;
}) {
  const [messaggiNonLetti, setMessaggiNonLetti] = useState(0);
  const [inListaAttesa, setInListaAttesa] = useState(0);

  useEffect(() => {
    if (!email) return;
    chatApi.storicoCliente(email).then((conv) => {
      const attiva = conv.find((c) => c.stato !== 'CHIUSA');
      setMessaggiNonLetti(attiva?.messaggi.filter((m) => m.autore === 'ADMIN').length ?? 0);
    }).catch(() => {});
    listaAttesaApi.mieIscrizioni(email).then((l) => setInListaAttesa(l.length)).catch(() => {});
  }, [email]);

  // Il prossimo viaggio si ricava dai dati già arrivati dal padre
  // (viaggi + eventiPerId, condivisi con la sezione Viaggi) invece di
  // un giro proprio a recuperare di nuovo gli stessi dettagli evento.
  const oggi = new Date().toISOString().slice(0, 10);
  const futuri = (viaggi ?? [])
    .filter((p) => p.stato === 'CONFERMATA')
    .map((p) => ({ p, ev: eventiPerId[p.eventoId] }))
    .filter((c): c is { p: Prenotazione; ev: Evento } => !!c.ev && c.ev.data >= oggi)
    .sort((a, b) => a.ev.data.localeCompare(b.ev.data));
  const prossimo = futuri[0] ?? null;

  return (
    <section className="acc-sezione">
      <h1>Ciao{nome ? `, ${nome}` : ''}</h1>

      {viaggi === null && <p className="acc-caricamento">Carico…</p>}

      {viaggi !== null && prossimo && <CardProssimoViaggio dati={prossimo} onApri={() => onAprireViaggio(prossimo.p.pnr)} onScrivi={() => onNavigare('chat')} />}

      {viaggi !== null && !prossimo && (
        <div className="stato-vuoto">
          <h3>Non hai viaggi in programma</h3>
          <p>Scegli un evento, prenota il tuo posto sul bus e lo ritrovi qui con tutti i dettagli.</p>
          <Link className="btn btn-primary" to="/">Scopri gli eventi</Link>
        </div>
      )}

      <div className="acc-tessere">
        <button type="button" className="acc-tessera" onClick={() => onNavigare('viaggi')}>
          <Icona nome="bus" dimensione={22} /><span>I miei viaggi</span>
        </button>
        <button type="button" className="acc-tessera" onClick={() => onNavigare('lista-attesa')}>
          <Icona nome="orologio" dimensione={22} /><span>Lista d'attesa{inListaAttesa > 0 ? ` (${inListaAttesa})` : ''}</span>
        </button>
        <button type="button" className="acc-tessera" onClick={() => onNavigare('chat')}>
          <Icona nome="messaggio" dimensione={22} /><span>Messaggi{messaggiNonLetti > 0 ? ` (${messaggiNonLetti})` : ''}</span>
        </button>
        <button type="button" className="acc-tessera" onClick={() => onNavigare('profilo')}>
          <Icona nome="utenti" dimensione={22} /><span>Profilo</span>
        </button>
        <Link className="acc-tessera" to="/faq">
          <Icona nome="info" dimensione={22} /><span>Aiuto</span>
        </Link>
      </div>
    </section>
  );
}

function CardProssimoViaggio({ dati, onApri, onScrivi }: {
  dati: { p: Prenotazione; ev: Evento };
  onApri: () => void;
  onScrivi: () => void;
}) {
  const { p, ev } = dati;
  const giorni = giorniAllaData(ev.data);
  const copertina = ev.immagini[0]?.url;
  const kicker = giorni <= 0 ? 'Oggi si parte!' : giorni === 1 ? 'Domani si parte!' : 'Il tuo prossimo viaggio';
  const stato = calcolaStatoPrenotazione(p);
  const pagamentoCompleto = p.tipoPagamento === 'COMPLETO' || p.saldoPagato;

  return (
    <article className="prossimo-viaggio">
      {copertina && (
        <div className="prossimo-viaggio-media">
          <img src={copertina} alt="" width={240} height={300} loading="lazy" decoding="async" />
        </div>
      )}
      <div className="prossimo-viaggio-corpo">
        <p className="prossimo-viaggio-kicker">{kicker}</p>
        <h2>{ev.artista}</h2>
        <p className="acc-riga">
          {dataBreve(ev.data)} · {p.fermataCitta}{p.fermataOrario ? ` ${p.fermataOrario}` : ''} → {ev.citta}
        </p>
        {giorni > 1 && <span className="chip-conto">tra {plurale(giorni, 'giorno', 'giorni')}</span>}

        {/* Il giorno prima e il giorno stesso lo stato del pagamento conta
            meno: serve sapere cosa fare prima di partire. */}
        {giorni <= 1 ? (
          <>
            <p className="prossimo-viaggio-promemoria">Ricordati:</p>
            <ul className="viaggio-timeline">
              <li>
                <Icona nome="orologio" dimensione={18} className="in-attesa" />
                <span>Arriva alla fermata in anticipo rispetto all'orario di partenza</span>
              </li>
              <li>
                <Icona nome="documento" dimensione={18} className="in-attesa" />
                <span>Porta con te un documento d'identità</span>
              </li>
              <li>
                <Icona nome="spunta" dimensione={18} strokeWidth={2.4} className="fatto" />
                <span>Tieni a portata di mano la prenotazione: basta questa pagina</span>
              </li>
            </ul>
          </>
        ) : (
        <ul className="viaggio-timeline">
          <li>
            <Icona nome="spunta" dimensione={18} strokeWidth={2.4} className="fatto" />
            <span>Prenotazione confermata</span>
          </li>
          <li>
            {pagamentoCompleto ? (
              <>
                <Icona nome="spunta" dimensione={18} strokeWidth={2.4} className="fatto" />
                <span>Pagamento completato</span>
              </>
            ) : (
              <>
                <Icona nome="info" dimensione={18} className={stato.chiave === 'acconto_scaduto' ? 'scaduto' : 'in-attesa'} />
                <span>
                  {stato.chiave === 'acconto_scaduto' ? 'Termine per il saldo superato' : 'Saldo da versare'}
                  {p.scadenzaSaldo ? ` ${stato.chiave === 'acconto_scaduto' ? 'il' : 'entro il'} ${formattaData(p.scadenzaSaldo)}` : ''}
                </span>
              </>
            )}
          </li>
          <li>
            <Icona nome="bus" dimensione={18} className="in-attesa" />
            <span>Bus e biglietto il giorno prima della partenza</span>
          </li>
        </ul>
        )}

        {/* Il giorno della partenza: prima di tutto come arrivare alla
            fermata, poi chat e assistenza a portata di pollice. */}
        {giorni <= 0 && p.fermataIndirizzo ? (
          <div className="prossimo-viaggio-azioni">
            <a
              className="btn btn-primary"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.fermataIndirizzo}, ${p.fermataCitta}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icona nome="pin" dimensione={18} />Apri la mappa della fermata
            </a>
            <button type="button" className="btn btn-secondary" onClick={onScrivi}>
              <Icona nome="messaggio" dimensione={18} />Scrivi allo staff
            </button>
            <Link className="btn btn-secondary" to="/faq">
              <Icona nome="info" dimensione={18} />Assistenza
            </Link>
            <button type="button" className="btn btn-tertiary" onClick={onApri}>Apri il viaggio</button>
          </div>
        ) : (
          <div className="prossimo-viaggio-azioni">
            <button type="button" className="btn btn-primary" onClick={onApri}>Apri il viaggio</button>
            <button type="button" className="btn btn-secondary" onClick={onScrivi}>Scrivi allo staff</button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ============================================================
   I MIEI VIAGGI
   ============================================================ */

function SezioneViaggi({ email, viaggi, eventiPerId, onAprireViaggio }: {
  email: string;
  viaggi: Prenotazione[] | null;
  eventiPerId: Record<string, Evento>;
  onAprireViaggio: (pnr: string) => void;
}) {
  const [tab, setTab] = useState<'prossimi' | 'passati'>('prossimi');
  const [rimborsoPnr, setRimborsoPnr] = useState<string | null>(null);
  const [esito, setEsito] = useState('');

  const oggi = new Date().toISOString().slice(0, 10);
  const viaggiFiltrati = (viaggi ?? []).filter((p) => {
    const ev = eventiPerId[p.eventoId];
    if (!ev) return tab === 'prossimi';
    return tab === 'passati' ? ev.data < oggi : ev.data >= oggi;
  });

  return (
    <section className="acc-sezione">
      <h1>I miei viaggi</h1>

      <div className="mini-tabs-acc" role="tablist" aria-label="Quali viaggi mostrare">
        <button type="button" role="tab" aria-selected={tab === 'prossimi'} className={`mini-tab-acc${tab === 'prossimi' ? ' active' : ''}`} onClick={() => setTab('prossimi')}>Prossimi</button>
        <button type="button" role="tab" aria-selected={tab === 'passati'} className={`mini-tab-acc${tab === 'passati' ? ' active' : ''}`} onClick={() => setTab('passati')}>Passati</button>
      </div>

      {esito && <p className="avviso avviso-ok acc-avviso" role="status">{esito}</p>}

      {viaggi === null && <p className="acc-caricamento">Carico…</p>}

      {viaggi !== null && !viaggiFiltrati.length && (
        <div className="stato-vuoto">
          <h3>{tab === 'passati' ? 'Nessun viaggio passato' : 'Nessun viaggio in programma'}</h3>
          <p>
            {tab === 'passati'
              ? 'Qui finiscono i viaggi già fatti, con il loro riepilogo.'
              : 'Quando prenoti un posto sul bus, il viaggio compare qui con fermata, orario e stato del pagamento.'}
          </p>
          {tab === 'prossimi' && <Link className="btn btn-primary" to="/">Scopri gli eventi</Link>}
        </div>
      )}

      {viaggiFiltrati.map((p) => {
        const ev = eventiPerId[p.eventoId];
        const stato = calcolaStatoPrenotazione(p);
        const copertina = ev?.immagini[0]?.url;
        return (
          <article className="viaggio-card" key={p.id}>
            <div className="viaggio-media">
              {copertina && <img src={copertina} alt="" width={96} height={120} loading="lazy" decoding="async" />}
            </div>

            <div className="viaggio-main">
              <h3>{ev?.artista ?? 'Evento'}</h3>
              <p className="acc-riga">{ev ? `${dataBreve(ev.data)} · ${ev.citta}` : 'Dettagli dell\'evento non disponibili'}</p>
              <p className="acc-riga">
                <Icona nome="pin" dimensione={14} />
                {p.fermataCitta}{p.fermataOrario ? ` · ore ${p.fermataOrario}` : ''}
              </p>
              <p className="acc-riga">
                {plurale(p.passeggeri, 'passeggero', 'passeggeri')} · <span className="pnr-tag">PNR {p.pnr}</span>
              </p>
            </div>

            <div className="viaggio-right">
              <span className={`badge ${stato.classe}`}>{stato.etichetta}</span>
              <span className="totale">{formattaEuro(p.totale)}</span>
              <div className="viaggio-azioni">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAprireViaggio(p.pnr)}>Dettagli</button>
                {p.stato === 'CONFERMATA' && (
                  <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setRimborsoPnr(p.pnr)}>Richiedi rimborso</button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {rimborsoPnr && (
        <ModaleRimborso
          pnr={rimborsoPnr}
          email={email}
          onChiudi={() => setRimborsoPnr(null)}
          onInviata={() => setEsito('Richiesta di rimborso inviata: ti rispondiamo via email appena è stata valutata.')}
        />
      )}
    </section>
  );
}

/* ============================================================
   LISTA D'ATTESA
   ============================================================ */

function SezioneListaAttesa({ email }: { email: string }) {
  const [iscrizioni, setIscrizioni] = useState<MiaIscrizione[] | null>(null);

  useEffect(() => { listaAttesaApi.mieIscrizioni(email).then(setIscrizioni).catch(() => setIscrizioni([])); }, [email]);

  return (
    <section className="acc-sezione">
      <h1>Lista d'attesa</h1>

      {iscrizioni === null && <p className="acc-caricamento">Carico…</p>}

      {iscrizioni?.length === 0 && (
        <div className="stato-vuoto">
          <h3>Non sei in lista d'attesa</h3>
          <p>Quando un evento è esaurito puoi metterti in lista: ti avvisiamo appena si libera un posto.</p>
          <Link className="btn btn-primary" to="/">Guarda gli eventi</Link>
        </div>
      )}

      {iscrizioni?.map((i) => (
        <div className="pannello" key={i.id}>
          <h2>{i.evento?.artista ?? 'Evento'}</h2>
          {i.evento && <p className="acc-riga">{i.evento.luogo}, {i.evento.citta} · {formattaData(i.evento.data)}</p>}
          <p className="acc-riga">{plurale(i.passeggeri, 'passeggero', 'passeggeri')}</p>
          <div className="riga-elenco">
            <span className="badge attenzione">In lista d'attesa</span>
            <span className="acc-riga">Posizione {i.posizione}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ============================================================
   CREDITO
   ============================================================ */

/** Il credito, diviso tra quanto maturato in totale (guadagnato dai
 *  viaggi) e quanto già usato, non solo il saldo attuale. */
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
      <h1>Credito</h1>

      <div className="pannello pannello-credito">
        <h2>Disponibile ora</h2>
        <p className="numero-grande">{formattaEuro(disponibile ?? 0)}</p>
        <p className="acc-riga">Maturato dai tuoi viaggi: lo spendi su qualsiasi prenotazione futura e non scade.</p>
      </div>

      <div className="acc-due-colonne">
        <div className="pannello">
          <h2>Maturato in totale</h2>
          <p className="numero-grande">{formattaEuro(totaleMaturato)}</p>
        </div>
        <div className="pannello">
          <h2>Già utilizzato</h2>
          <p className="numero-grande">{formattaEuro(totaleUtilizzato)}</p>
        </div>
      </div>

      {movimenti === null && <p className="acc-caricamento">Carico…</p>}

      {movimenti?.length === 0 && (
        <div className="stato-vuoto">
          <h3>Nessun movimento</h3>
          <p>Il credito matura dopo il tuo primo viaggio pagato per intero.</p>
        </div>
      )}

      {maturati.length > 0 && (
        <div className="pannello">
          <h2>Maturato</h2>
          {maturati.map((m) => (
            <div className="riga-elenco" key={m.id}>
              <span>{m.motivo}<span className="quando">{formattaData(m.creatoIl)}</span></span>
              <b className="importo-piu">+{formattaEuro(m.importo)}</b>
            </div>
          ))}
        </div>
      )}

      {utilizzati.length > 0 && (
        <div className="pannello">
          <h2>Utilizzato</h2>
          {utilizzati.map((m) => (
            <div className="riga-elenco" key={m.id}>
              <span>{m.motivo}<span className="quando">{formattaData(m.creatoIl)}</span></span>
              <b>−{formattaEuro(Math.abs(Number(m.importo)))}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   INVITA UN AMICO
   ============================================================ */

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
    }).catch(() => {});
  }

  const inSospeso = dati?.invitati.filter((i) => !i.completato) ?? [];
  const completati = dati?.invitati.filter((i) => i.completato) ?? [];

  return (
    <section className="acc-sezione">
      <h1>Invita un amico</h1>
      <p className="testo-intro">
        Condividi il tuo link: quando un amico si registra e completa la sua prima prenotazione, un bonus finisce sul
        credito di tutti e due.
      </p>

      {!dati && <p className="acc-caricamento">Carico…</p>}

      {dati && (
        <>
          <div className="pannello">
            <h2>Il tuo link</h2>
            <div className="invito-riga">
              <input
                type="text" readOnly value={link} aria-label="Il tuo link di invito"
                className="campo-input" onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button type="button" className="btn btn-primary" onClick={copia}>
                {copiato ? <><Icona nome="spunta" dimensione={16} strokeWidth={2.4} />Copiato</> : 'Copia il link'}
              </button>
            </div>
            <p className="acc-riga">Oppure condividi solo il codice: <b className="codice-invito">{dati.codice}</b></p>
          </div>

          <div className="acc-due-colonne">
            <div className="pannello">
              <h2>Inviti in sospeso</h2>
              <p className="numero-grande">{inSospeso.length}</p>
            </div>
            <div className="pannello">
              <h2>Inviti completati</h2>
              <p className="numero-grande">{completati.length}</p>
            </div>
          </div>

          {inSospeso.length > 0 && (
            <div className="pannello">
              <h2>In sospeso</h2>
              {inSospeso.map((i, idx) => (
                <div className="riga-elenco" key={idx}>
                  <span>{i.nome}</span>
                  <span className="quando">Registrato, non ha ancora prenotato</span>
                </div>
              ))}
            </div>
          )}

          {completati.length > 0 && (
            <div className="pannello">
              <h2>Completati</h2>
              {completati.map((i, idx) => (
                <div className="riga-elenco" key={idx}>
                  <span>{i.nome}</span>
                  <b className="importo-piu"><Icona nome="spunta" dimensione={16} strokeWidth={2.4} />Bonus ricevuto</b>
                </div>
              ))}
            </div>
          )}

          {dati.invitati.length === 0 && (
            <div className="stato-vuoto">
              <h3>Nessun invito ancora</h3>
              <p>Condividi il link qui sopra per iniziare.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ============================================================
   MESSAGGI
   ============================================================ */

function SezioneChat({ email, nome }: { email: string; nome: string }) {
  const [conversazioni, setConversazioni] = useState<ConversazioneConMessaggi[] | null>(null);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [eventoScelto, setEventoScelto] = useState('');
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  function ricarica() { chatApi.storicoCliente(email).then(setConversazioni).catch(() => {}); }
  useEffect(ricarica, [email]);
  useEffect(() => { eventiApi.list().then(setEventi).catch(() => {}); }, []);

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
    if (!eventoId) { setErrore("Scegli prima l'evento su cui hai una domanda."); return; }
    setErrore('');
    setInvio(true);
    try {
      // Da loggato il nome lo sappiamo già: non lo chiediamo di nuovo.
      await chatApi.inviaCliente({ eventoId, nome: nome || email, email, testo });
      setTesto('');
      ricarica();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Messaggio non inviato: controlla la connessione e riprova.');
    } finally {
      setInvio(false);
    }
  }

  return (
    <section className="acc-sezione">
      <h1>Messaggi</h1>
      <p className="testo-intro">Scrivi allo staff OnWay: rispondiamo qui e ti avvisiamo via email.</p>

      <div className="acc-chat-box">
        {!attiva && (
          <div className="acc-chat-scelta">
            <div className="campo">
              <label className="campo-etichetta" htmlFor="acc-chat-evento">Su quale evento hai una domanda?</label>
              <select id="acc-chat-evento" className="campo-input" value={eventoScelto} onChange={(e) => setEventoScelto(e.target.value)}>
                <option value="">Scegli l'evento…</option>
                {eventi.map((ev) => <option key={ev.id} value={ev.id}>{ev.artista} — {ev.citta}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="acc-chat-messaggi">
          {conversazioni === null && <p className="acc-caricamento">Carico…</p>}
          {conversazioni?.length === 0 && <p className="acc-caricamento">Nessun messaggio ancora: scrivi la tua prima domanda qui sotto.</p>}
          {attiva?.messaggi.map((m) => (
            <div className={`chat-bubble-mini ${m.autore.toLowerCase()}`} key={m.id}>
              {m.testo}
              <div className="meta">{m.autore === 'CLIENTE' ? 'Tu' : 'Staff OnWay'} · {new Date(m.creatoIl).toLocaleString('it-IT')}</div>
            </div>
          ))}
        </div>

        <div className="acc-chat-input-row">
          <label className="sr-only" htmlFor="acc-chat-testo">Scrivi un messaggio</label>
          <input
            id="acc-chat-testo" className="campo-input" value={testo} placeholder="Scrivi un messaggio…"
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); invia(); } }}
          />
          <button type="button" className="btn btn-primary" onClick={invia} disabled={invio}>Invia</button>
        </div>
      </div>

      {errore && <p className="avviso avviso-errore acc-avviso" role="alert">{errore}</p>}

      {chiuse.length > 0 && (
        <div className="acc-chat-storico">
          <p className="section-label">Conversazioni precedenti</p>
          {chiuse.map((c) => (
            <details key={c.id} className="acc-dettagli">
              <summary>{formattaData(c.creataIl)} — {plurale(c.messaggi.length, 'messaggio', 'messaggi')}</summary>
              <div className="acc-chat-messaggi">
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

/* ============================================================
   PROFILO
   ============================================================ */

function SezioneProfilo({ email, onEsci }: { email: string; onEsci: () => void }) {
  const [dati, setDati] = useState<DatiCliente | null>(null);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [citta, setCitta] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [messaggio, setMessaggio] = useState('');
  const [erroreSalva, setErroreSalva] = useState('');
  const [eliminaAperta, setEliminaAperta] = useState(false);

  useEffect(() => {
    clienteAuthApi.me().then((d) => {
      setDati(d);
      setNome(d.nome ?? ''); setCognome(d.cognome ?? ''); setTelefono(d.telefono ?? ''); setCitta(d.citta ?? '');
      setDataNascita(d.dataNascita ? d.dataNascita.slice(0, 10) : '');
    }).catch(() => {});
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErroreSalva(''); setMessaggio(''); setSalvando(true);
    try {
      await clienteAuthApi.aggiornaProfilo({ nome, cognome, telefono: telefono || undefined, citta: citta || undefined, dataNascita });
      setMessaggio('Dati salvati.');
      setTimeout(() => setMessaggio(''), 4000);
    } catch (err) {
      // aggiornaProfilo lancia ErroreClienteAuth (con il messaggio del
      // server): prima si controllava ErroreApi e il messaggio vero non
      // arrivava mai.
      setErroreSalva(err instanceof ErroreClienteAuth ? err.message : 'Salvataggio non riuscito: controlla la connessione e riprova.');
    } finally {
      setSalvando(false);
    }
  }

  if (!dati) return <section className="acc-sezione"><h1>Profilo</h1><p className="acc-caricamento">Carico…</p></section>;

  return (
    <section className="acc-sezione">
      <h1>Profilo</h1>

      <form onSubmit={salva} className="pannello">
        <h2>I tuoi dati</h2>
        <p className="acc-riga">Sei collegato con <b>{email}</b>: l'indirizzo non si cambia da qui.</p>

        <div className="acc-due-colonne">
          <CampoTesto id="profilo-nome" etichetta="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          <CampoTesto id="profilo-cognome" etichetta="Cognome" required value={cognome} onChange={(e) => setCognome(e.target.value)} />
        </div>
        <div className="acc-due-colonne">
          <CampoTesto id="profilo-telefono" etichetta="Telefono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <CampoTesto id="profilo-citta" etichetta="Città" value={citta} onChange={(e) => setCitta(e.target.value)} />
        </div>
        <CampoTesto
          id="profilo-nascita" etichetta="Data di nascita" type="date" required className="campo-stretto"
          aiuto="Serve per organizzare i gruppi sul bus"
          value={dataNascita} onChange={(e) => setDataNascita(e.target.value)}
        />

        {erroreSalva && <p className="avviso avviso-errore" role="alert">{erroreSalva}</p>}
        {messaggio && <p className="avviso avviso-ok" role="status">{messaggio}</p>}

        <div className="acc-azioni">
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvataggio…' : 'Salva le modifiche'}
          </button>
        </div>
      </form>

      <div className="pannello pannello-pericolo">
        <h2>Elimina l'account</h2>
        <p className="acc-riga">
          I tuoi dati personali (nome, telefono, città) vengono rimossi e non potrai più accedere. Le prenotazioni
          già fatte restano nello storico per motivi contabili, ma non saranno più collegate a un account attivo.
          <b> Questa azione non si può annullare.</b>
        </p>
        <div className="acc-azioni">
          <button type="button" className="btn btn-danger" onClick={() => setEliminaAperta(true)}>Elimina l'account</button>
        </div>
      </div>

      {/* Su telefono la colonna del menu non c'è: "Esci" vive qui. */}
      <div className="account-esci-mobile">
        <button type="button" className="btn btn-ghost btn-block" onClick={onEsci}>Esci</button>
      </div>

      {eliminaAperta && <ModaleEliminaAccount onChiudi={() => setEliminaAperta(false)} />}
    </section>
  );
}

/** La conferma dell'eliminazione in un <dialog>: serve la password,
 *  perché è l'unica azione dell'account che non si può annullare. */
function ModaleEliminaAccount({ onChiudi }: { onChiudi: () => void }) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function elimina(e: React.FormEvent) {
    e.preventDefault();
    setErrore(''); setEliminando(true);
    try {
      await clienteAuthApi.eliminaAccount(password);
      logoutCliente();
      navigate('/');
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Eliminazione non riuscita: riprova.');
      setEliminando(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="modale-conferma" aria-labelledby="elimina-titolo" onClose={onChiudi}>
      <form onSubmit={elimina}>
        <h2 id="elimina-titolo">Elimina l'account</h2>
        <p>Conferma la tua password per procedere. Dopo questa operazione non potrai più accedere.</p>

        <CampoPassword
          id="elimina-password" etichetta="La tua password" autoComplete="current-password" required autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)}
        />

        {errore && <p className="avviso avviso-errore" role="alert">{errore}</p>}

        <div className="modale-conferma-azioni">
          <button type="submit" className="btn btn-danger" disabled={eliminando}>
            {eliminando ? 'Eliminazione…' : 'Elimina definitivamente'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>Annulla</button>
        </div>
      </form>
    </dialog>
  );
}

/* ============================================================
   PRIVACY
   ============================================================ */

/** Un blocco di consenso "Acconsento / Non acconsento": due pulsanti
 *  mutuamente esclusivi, nessuno preselezionato finché il cliente non
 *  ha scelto davvero (mai dare per scontato un consenso). */
function BloccoConsenso({ titolo, descrizione, valore, onScegli, salvando }: {
  titolo: string; descrizione: string; valore: boolean | null; onScegli: (v: boolean) => void; salvando: boolean;
}) {
  return (
    <div className="pannello">
      <h2>{titolo}</h2>
      <p className="acc-riga">{descrizione}</p>
      <div className="acc-azioni">
        <button
          type="button" disabled={salvando} aria-pressed={valore === true}
          onClick={() => onScegli(true)}
          className={`btn btn-sm ${valore === true ? 'btn-primary' : 'btn-secondary'}`}
        >
          Acconsento
        </button>
        <button
          type="button" disabled={salvando} aria-pressed={valore === false}
          onClick={() => onScegli(false)}
          className={`btn btn-sm ${valore === false ? 'btn-primary' : 'btn-secondary'}`}
        >
          Non acconsento
        </button>
      </div>
      {valore === null && <p className="acc-riga">Non hai ancora scelto.</p>}
    </div>
  );
}

function SezionePrivacy({ email }: { email: string }) {
  const [preferenze, setPreferenze] = useState<PreferenzePrivacy | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => { utentiApi.preferenzePrivacy(email).then(setPreferenze).catch(() => {}); }, [email]);

  async function aggiorna(campo: keyof PreferenzePrivacy, valore: boolean) {
    setSalvando(true);
    setErrore('');
    try {
      const nuove = await utentiApi.aggiornaPreferenzePrivacy(email, { [campo]: valore });
      setPreferenze(nuove);
    } catch {
      setErrore('Salvataggio non riuscito: controlla la connessione e riprova.');
    } finally {
      setSalvando(false);
    }
  }

  if (!preferenze) return <section className="acc-sezione"><h1>Privacy</h1><p className="acc-caricamento">Carico…</p></section>;

  return (
    <section className="acc-sezione">
      <h1>Privacy</h1>
      <p className="testo-intro">
        Rivedi o cambia in qualsiasi momento come usiamo i tuoi dati. Leggi anche la{' '}
        <Link to="/pagina/privacy">informativa completa sulla privacy</Link>.
      </p>

      {errore && <p className="avviso avviso-errore acc-avviso" role="alert">{errore}</p>}

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

      <div className="pannello">
        <h2>Cookie</h2>
        <p className="acc-riga">Puoi rivedere o cambiare in qualsiasi momento quali cookie hai accettato su questo dispositivo.</p>
        <div className="acc-azioni"><LinkPreferenzeCookie /></div>
      </div>
    </section>
  );
}
