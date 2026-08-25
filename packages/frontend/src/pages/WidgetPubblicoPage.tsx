import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { whiteLabelApi, type WhiteLabelPubblica } from '../api/whiteLabel';
import { clienteAuthApi } from '../api/clienteAuth';
import { salvaTokenCliente, clienteLoggato } from '../features/clienteSessione';
import { WhiteLabelPreview } from '../features/white-label/WhiteLabelPreview';
import { ErroreApi } from '../api/client';
import type { OpzionePartenza } from '../api/types';

type Vista = 'caricamento' | 'errore' | 'vetrina' | 'auth' | 'login' | 'registrati' | 'registrati-fatto' | 'prenotazione' | 'conferma';

/**
 * Pagina "Link diretto" della White Label — stessa esperienza del
 * widget incorporato vero (embed.js): mai un rimando al sito INBUS
 * durante l'acquisto, tutto resta qui. Se il cliente ha già una
 * sessione attiva sul sito (stesso dominio, stesso token in
 * localStorage — vantaggio che il widget su un sito esterno non ha),
 * salta dritto alla prenotazione senza dover accedere di nuovo.
 */
export function WidgetPubblicoPage() {
  const { publicWidgetId } = useParams<{ publicWidgetId: string }>();
  const [vista, setVista] = useState<Vista>('caricamento');
  const [erroreVista, setErroreVista] = useState('');
  const [dati, setDati] = useState<WhiteLabelPubblica | null>(null);
  const [opzioni, setOpzioni] = useState<OpzionePartenza[] | null>(null);
  const [pnr, setPnr] = useState('');

  useEffect(() => {
    if (!publicWidgetId) return;
    whiteLabelApi.getPubblica(publicWidgetId)
      .then((d) => { setDati(d); setVista('vetrina'); })
      .catch((e) => { setErroreVista(e instanceof ErroreApi ? e.message : 'Impossibile caricare questa pagina.'); setVista('errore'); });
  }, [publicWidgetId]);

  function apriPrenotazione() {
    setVista(clienteLoggato() ? 'prenotazione' : 'auth');
  }

  if (vista === 'caricamento') return <Sfondo colore="#14121f"><p style={{ color: '#a99fc2' }}>Carico...</p></Sfondo>;
  if (vista === 'errore') return <Sfondo colore="#14121f"><p style={{ color: '#a99fc2' }}>{erroreVista}</p></Sfondo>;
  if (!dati || !publicWidgetId) return null;

  return (
    <Sfondo colore={dati.tema.colori.sfondo}>
      {vista === 'vetrina' && (
        <WhiteLabelPreview tema={dati.tema} evento={dati.evento} larghezza={400} onCtaClick={dati.attiva ? apriPrenotazione : undefined} />
      )}
      {vista === 'auth' && <SceltaAuth tema={dati.tema} onLogin={() => setVista('login')} onRegistrati={() => setVista('registrati')} />}
      {vista === 'login' && (
        <FormLogin
          tema={dati.tema}
          onFatto={() => setVista(opzioni ? 'prenotazione' : 'prenotazione')}
        />
      )}
      {vista === 'registrati' && <FormRegistrati tema={dati.tema} onFatto={() => setVista('registrati-fatto')} />}
      {vista === 'registrati-fatto' && (
        <Riquadro tema={dati.tema}>
          <p>✓ Controlla la tua email per confermare l'account, poi accedi qui sotto per completare la prenotazione.</p>
          <PulsanteSecondario tema={dati.tema} onClick={() => setVista('login')}>Accedi ora</PulsanteSecondario>
        </Riquadro>
      )}
      {vista === 'prenotazione' && (
        <FormPrenotazione
          tema={dati.tema}
          publicWidgetId={publicWidgetId}
          eventoId={dati.evento.id}
          opzioni={opzioni}
          onOpzioniCaricate={setOpzioni}
          onFatto={(pnrVero) => { setPnr(pnrVero); setVista('conferma'); }}
          onErroreCaricamento={(msg) => { setErroreVista(msg); setVista('errore'); }}
        />
      )}
      {vista === 'conferma' && (
        <Riquadro tema={dati.tema}>
          <p style={{ fontWeight: 800, fontSize: dati.tema.tipografia.dimensioneTitoloPx, margin: '0 0 8px' }}>✓ Prenotazione confermata</p>
          <p style={{ color: dati.tema.colori.testoSecondario }}>Codice prenotazione: <b>{pnr}</b>. Riceverai una email di conferma con il tuo biglietto.</p>
        </Riquadro>
      )}
    </Sfondo>
  );
}

// ---- Piccoli componenti di supporto, stile coerente col tema della White Label ----

function Sfondo({ colore, children }: { colore: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colore, padding: 24 }}>
      {children}
    </div>
  );
}

function Riquadro({ tema, children }: { tema: WhiteLabelPubblica['tema']; children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%', maxWidth: 400, boxSizing: 'border-box', background: tema.colori.superficie,
      borderRadius: tema.stile.borderRadiusPx, border: `1px solid ${tema.colori.bordi}`, padding: tema.stile.spaziaturaPx,
      fontFamily: tema.tipografia.font, color: tema.colori.testoPrincipale,
    }}>
      {children}
    </div>
  );
}

function Campo({ tema, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { tema: WhiteLabelPubblica['tema'] }) {
  return (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: Math.min(tema.stile.borderRadiusPx, 8),
        border: `1px solid ${tema.colori.bordi}`, background: 'transparent', color: tema.colori.testoPrincipale,
        fontFamily: tema.tipografia.font, fontSize: tema.tipografia.dimensioneTestoPx, marginBottom: 8,
      }}
    />
  );
}

function PulsantePrincipale({ tema, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tema: WhiteLabelPubblica['tema'] }) {
  const s = tema.stile, c = tema.colori;
  return (
    <button
      {...props}
      style={{
        height: s.altezzaPulsantePx,
        borderRadius: s.stilePulsanti === 'arrotondato' ? 999 : s.borderRadiusPx,
        background: s.stilePulsanti === 'contorno' ? 'transparent' : c.cta,
        color: s.stilePulsanti === 'contorno' ? c.cta : c.testoCta,
        border: s.stilePulsanti === 'contorno' ? `1.5px solid ${c.cta}` : 'none',
        fontFamily: tema.tipografia.font, fontWeight: 700, fontSize: tema.tipografia.dimensioneTestoPx,
        width: '100%', cursor: 'pointer',
      }}
    />
  );
}
function PulsanteSecondario({ tema, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tema: WhiteLabelPubblica['tema'] }) {
  return (
    <button
      {...props}
      style={{
        height: tema.stile.altezzaPulsantePx, borderRadius: tema.stile.borderRadiusPx, background: 'transparent',
        color: tema.colori.testoSecondario, border: `1px solid ${tema.colori.bordi}`, fontFamily: tema.tipografia.font,
        fontWeight: 600, fontSize: tema.tipografia.dimensioneTestoPx, width: '100%', cursor: 'pointer', marginTop: 8,
      }}
    />
  );
}
function TestoErrore({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p style={{ color: '#e05c5c', fontSize: 12, margin: '0 0 8px' }}>{children}</p>;
}

function SceltaAuth({ tema, onLogin, onRegistrati }: { tema: WhiteLabelPubblica['tema']; onLogin: () => void; onRegistrati: () => void }) {
  return (
    <Riquadro tema={tema}>
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Accedi o registrati per continuare</p>
      <PulsantePrincipale tema={tema} onClick={onLogin}>Ho già un account</PulsantePrincipale>
      <PulsanteSecondario tema={tema} onClick={onRegistrati}>Creo un account nuovo</PulsanteSecondario>
    </Riquadro>
  );
}

function FormLogin({ tema, onFatto }: { tema: WhiteLabelPubblica['tema']; onFatto: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  async function invia() {
    setCaricamento(true);
    setErrore('');
    try {
      const { token } = await clienteAuthApi.login(email, password);
      salvaTokenCliente(token);
      onFatto();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Accesso non riuscito.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <Riquadro tema={tema}>
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Accedi</p>
      <Campo tema={tema} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo tema={tema} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <TestoErrore>{errore}</TestoErrore>
      <PulsantePrincipale tema={tema} onClick={invia} disabled={caricamento}>{caricamento ? 'Accesso...' : 'Accedi'}</PulsantePrincipale>
    </Riquadro>
  );
}

function FormRegistrati({ tema, onFatto }: { tema: WhiteLabelPubblica['tema']; onFatto: () => void }) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  async function invia() {
    setCaricamento(true);
    setErrore('');
    try {
      await clienteAuthApi.registrati({ nome, cognome, email, telefono, password });
      onFatto();
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Registrazione non riuscita.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <Riquadro tema={tema}>
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Crea un account</p>
      <Campo tema={tema} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo tema={tema} placeholder="Cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} />
      <Campo tema={tema} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo tema={tema} placeholder="Telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      <Campo tema={tema} type="password" placeholder="Password (almeno 8 caratteri)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <TestoErrore>{errore}</TestoErrore>
      <PulsantePrincipale tema={tema} onClick={invia} disabled={caricamento}>{caricamento ? 'Creazione...' : 'Crea account'}</PulsantePrincipale>
    </Riquadro>
  );
}

function FormPrenotazione({
  tema, publicWidgetId, eventoId, opzioni, onOpzioniCaricate, onFatto, onErroreCaricamento,
}: {
  tema: WhiteLabelPubblica['tema']; publicWidgetId: string; eventoId: string;
  opzioni: OpzionePartenza[] | null; onOpzioniCaricate: (o: OpzionePartenza[]) => void;
  onFatto: (pnr: string) => void; onErroreCaricamento: (msg: string) => void;
}) {
  const [fermataId, setFermataId] = useState('');
  const [passeggeri, setPasseggeri] = useState(1);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [errore, setErrore] = useState('');
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    if (opzioni) { if (!fermataId && opzioni[0]) setFermataId(opzioni[0].fermataId); return; }
    whiteLabelApi.opzioniPartenza(publicWidgetId)
      .then((o) => { onOpzioniCaricate(o); if (o[0]) setFermataId(o[0].fermataId); })
      .catch((e) => onErroreCaricamento(e instanceof ErroreApi ? e.message : 'Impossibile caricare le fermate.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opzioni]);

  if (!opzioni) return <Riquadro tema={tema}><p>Carico le fermate disponibili...</p></Riquadro>;

  const opzioneScelta = opzioni.find((o) => o.fermataId === fermataId);

  async function invia() {
    setCaricamento(true);
    setErrore('');
    try {
      const r = await whiteLabelApi.prenota(publicWidgetId, {
        eventoId,
        tragittoId: opzioneScelta?.tragittoId,
        fermataId,
        passeggeri,
        tipoPagamento: 'COMPLETO',
        metodoPagamento: 'DA_CONCORDARE',
        cliente: { nome, cognome, email, telefono },
        partecipanti: [],
      });
      onFatto(r.pnr);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Prenotazione non riuscita.');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <Riquadro tema={tema}>
      <p style={{ fontWeight: 700, margin: '0 0 12px' }}>Completa la prenotazione</p>
      <label style={{ fontSize: 12, color: tema.colori.testoSecondario }}>Fermata di partenza</label>
      <select
        value={fermataId} onChange={(e) => setFermataId(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${tema.colori.bordi}`, background: 'transparent', color: tema.colori.testoPrincipale, marginBottom: 8 }}
      >
        {opzioni.map((o) => <option key={o.fermataId} value={o.fermataId}>{o.fermataCitta} — €{o.prezzoEffettivo}</option>)}
      </select>
      <label style={{ fontSize: 12, color: tema.colori.testoSecondario }}>Passeggeri</label>
      <Campo tema={tema} type="number" min={1} max={20} value={passeggeri} onChange={(e) => setPasseggeri(Number(e.target.value) || 1)} />
      <Campo tema={tema} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo tema={tema} placeholder="Cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} />
      <Campo tema={tema} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo tema={tema} placeholder="Telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      <TestoErrore>{errore}</TestoErrore>
      <PulsantePrincipale tema={tema} onClick={invia} disabled={caricamento}>{caricamento ? 'Invio...' : 'Conferma prenotazione'}</PulsantePrincipale>
    </Riquadro>
  );
}
