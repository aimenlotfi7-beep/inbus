import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/tourleader.css';
import { LogoOnWay } from '../features/LogoOnWay';
import { fornitoriApi, type CampoExtraConfig } from '../api/fornitori';
import { geocodifica } from '../admin/shared/geo';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';

/** Autoregistrazione pubblica di un fornitore (agenzia/noleggio bus) —
 *  nasce sempre IN_ATTESA lato server, un admin la approva da
 *  Fornitori prima che possa ricevere richieste di preventivo. I campi
 *  extra (in fondo, se configurati) sono facoltativi e definiti
 *  altrove — testo semplice, etichetta+valore. */
export function FornitoreRegistrazionePage() {
  const [campiExtraConfig, setCampiExtraConfig] = useState<CampoExtraConfig[]>([]);
  const [form, setForm] = useState({
    nome: '', partitaIva: '', referente: '', telefono: '', email: '', indirizzo: '',
  });
  const [valoriExtra, setValoriExtra] = useState<Record<string, string>>({});
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    fornitoriApi.campiExtraConfig().then(setCampiExtraConfig).catch(() => {});
  }, []);

  async function invia() {
    setErrore('');
    if (!form.nome.trim()) { setErrore('Inserisci la ragione sociale.'); return; }
    if (!form.email.includes('@')) { setErrore('Inserisci un indirizzo email valido.'); return; }
    if (!form.indirizzo.trim()) { setErrore('Inserisci l\'indirizzo — serve per calcolare la distanza dagli eventi.'); return; }
    setInviando(true);
    try {
      // Geocodifica qui nel browser (stessa funzione già usata in
      // admin) — se non si trova, si registra comunque: un admin potrà
      // sistemare l'indirizzo a mano in approvazione, non blocca
      // l'invio per un indirizzo scritto in modo un po' insolito.
      const { coordinate } = await geocodifica(form.indirizzo);
      const campiExtra = campiExtraConfig
        .map((c) => ({ etichetta: c.etichetta, valore: (valoriExtra[c.id] ?? '').trim() }))
        .filter((c) => c.valore);
      await fornitoriApi.registrazionePubblica({
        ...form,
        lat: coordinate?.lat,
        lng: coordinate?.lng,
        campiExtra: campiExtra.length ? campiExtra : undefined,
      });
      setInviato(true);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Impossibile contattare il server, riprova.');
    } finally {
      setInviando(false);
    }
  }

  return (
    <>
      <header>
        <div className="logo"><LogoOnWay come="testo" /></div>
        <Link className="back-link" to="/">← Torna al sito</Link>
      </header>

      <main>
        <h1>Diventa fornitore</h1>
        <p className="sub">Registrati come agenzia/noleggio bus — riceverai richieste di preventivo per i viaggi organizzati vicino a te. Un membro del nostro staff esaminerà la registrazione prima di attivarla.</p>

        {!inviato && (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-grid">
              <label>Ragione sociale <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
              <label>Partita IVA <input type="text" value={form.partitaIva} onChange={(e) => setForm({ ...form, partitaIva: e.target.value })} /></label>
              <label>Nome referente <input type="text" value={form.referente} onChange={(e) => setForm({ ...form, referente: e.target.value })} /></label>
              <label>Telefono <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
              <label>Email <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label className="full">Indirizzo <input type="text" placeholder="Via, città, provincia" value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} required /></label>
              {campiExtraConfig.map((c) => (
                <label key={c.id} className="full">{c.etichetta} <input type="text" value={valoriExtra[c.id] ?? ''} onChange={(e) => setValoriExtra({ ...valoriExtra, [c.id]: e.target.value })} /></label>
              ))}
            </div>
            <p className="errore">{errore}</p>
            <button type="button" className="btn-primary" disabled={inviando} onClick={invia}>{inviando ? 'Invio...' : 'Registrati'}</button>
          </form>
        )}

        {inviato && (
          <div className="success-box">
            <h2>Registrazione ricevuta</h2>
            <p>Grazie! Un membro del nostro staff esaminerà i tuoi dati e attiverà l'account — riceverai le richieste di preventivo via email una volta approvato.</p>
          </div>
        )}
      </main>
      <CookieBanner />
    </>
  );
}
