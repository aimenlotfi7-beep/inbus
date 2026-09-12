import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/tourleader.css';
import { LogoOnWay } from '../features/LogoOnWay';
import { fornitoriApi, type CampoExtraConfig } from '../api/fornitori';
import { geocodifica } from '../admin/shared/geo';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';
import { useSeoTags } from '../features/useSeoTags';

/** Autoregistrazione pubblica di un fornitore (agenzia/noleggio bus) —
 *  nasce sempre IN_ATTESA lato server, un admin la approva da
 *  Fornitori prima che possa ricevere richieste di preventivo. I campi
 *  extra (in fondo, se configurati) sono facoltativi e definiti
 *  altrove — testo semplice, etichetta+valore. */
export function FornitoreRegistrazionePage() {
  useSeoTags({
    title: 'Diventa fornitore — OnWay',
    description: 'Agenzie e noleggi bus: registrati come fornitore OnWay e ricevi le richieste di preventivo per i viaggi vicino a te.',
    url: `${window.location.origin}/fornitore/registrati`,
  });
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
    const email = form.email.trim();
    if (!form.nome.trim()) { setErrore('Inserisci la ragione sociale.'); return; }
    if (!email.includes('@')) { setErrore('Inserisci un indirizzo email valido.'); return; }
    if (!form.indirizzo.trim()) { setErrore('Inserisci l\'indirizzo — serve per calcolare la distanza dagli eventi.'); return; }
    setInviando(true);
    try {
      // Geocodifica qui nel browser (stessa funzione già usata in
      // admin) — se non si trova, si registra comunque: un admin potrà
      // sistemare l'indirizzo a mano in approvazione, non blocca
      // l'invio per un indirizzo scritto in modo un po' insolito.
      const { coordinate, regione } = await geocodifica(form.indirizzo);
      const campiExtra = campiExtraConfig
        .map((c) => ({ etichetta: c.etichetta, valore: (valoriExtra[c.id] ?? '').trim() }))
        .filter((c) => c.valore);
      await fornitoriApi.registrazionePubblica({
        ...form,
        email,
        lat: coordinate?.lat,
        lng: coordinate?.lng,
        // Senza la regione il fornitore finiva nel gruppo "Senza regione"
        // del gestionale anche con l'indirizzo trovato.
        regione: regione ?? undefined,
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
    // .pagina-tourleader è lo scope di tourleader.css (vedi quel file)
    <div className="pagina-tourleader">
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
              <label>Ragione sociale <input type="text" autoComplete="organization" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
              <label>Partita IVA <input type="text" value={form.partitaIva} onChange={(e) => setForm({ ...form, partitaIva: e.target.value })} /></label>
              <label>Nome referente <input type="text" autoComplete="name" value={form.referente} onChange={(e) => setForm({ ...form, referente: e.target.value })} /></label>
              <label>Telefono <input type="tel" inputMode="tel" autoComplete="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
              <label>Email <input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label className="full">Indirizzo <input type="text" autoComplete="street-address" placeholder="Via, città, provincia" value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} required /></label>
              {campiExtraConfig.map((c) => (
                <label key={c.id} className="full">{c.etichetta} <input type="text" value={valoriExtra[c.id] ?? ''} onChange={(e) => setValoriExtra({ ...valoriExtra, [c.id]: e.target.value })} /></label>
              ))}
            </div>
            <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)', lineHeight: 1.5, margin: '10px 0 0' }}>
              I dati inseriti servono a valutare la registrazione e, se approvata, a inviarti le richieste di preventivo.
              Leggi l'<Link to="/pagina/privacy" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>informativa privacy</Link>.
            </p>
            <p className="errore">{errore}</p>
            <button type="button" className="btn-primary" disabled={inviando} onClick={invia}>{inviando ? 'Invio…' : 'Registrati'}</button>
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
    </div>
  );
}
