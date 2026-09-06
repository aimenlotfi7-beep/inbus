import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import '../styles/tourleader.css';
import { LogoOnWay } from '../features/LogoOnWay';
import { preventiviApi, type DatiPubbliciPreventivo } from '../api/preventivi';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';

/** Pagina pubblica raggiunta dal link nella mail di richiesta
 *  preventivo — nessun accesso richiesto, il token stesso è la
 *  chiave. Mostra solo il tragitto per cui questo fornitore è stato
 *  interpellato (non l'intero evento) — vedi conversazione. Una volta
 *  inviata la risposta è definitiva: non si può più modificare da
 *  qui. */
export function FornitorePreventivoPage() {
  const { token } = useParams<{ token: string }>();
  const [dati, setDati] = useState<DatiPubbliciPreventivo | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [erroreCaricamento, setErroreCaricamento] = useState('');

  const [prezzo, setPrezzo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!token) return;
    preventiviApi.getPubblico(token)
      .then(setDati)
      .catch((e) => setErroreCaricamento(e instanceof ErroreApi ? e.message : 'Impossibile contattare il server.'))
      .finally(() => setCaricando(false));
  }, [token]);

  function fileABase64(f: File): Promise<string> {
    return new Promise((risolvi, rifiuta) => {
      const lettore = new FileReader();
      lettore.onload = () => risolvi((lettore.result as string).split(',')[1]);
      lettore.onerror = () => rifiuta(new Error('Lettura file fallita'));
      lettore.readAsDataURL(f);
    });
  }

  async function invia() {
    if (!token) return;
    setErrore('');
    const valorePrezzo = Number(prezzo.replace(',', '.'));
    if (!valorePrezzo || valorePrezzo <= 0) { setErrore('Inserisci un prezzo valido.'); return; }
    setInviando(true);
    try {
      const fileContenuto = file ? await fileABase64(file) : undefined;
      await preventiviApi.rispondiPubblico(token, { prezzo: valorePrezzo, fileNome: file?.name, fileContenuto });
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
        <h1>Richiesta preventivo</h1>

        {caricando && <p className="sub">Caricamento...</p>}
        {erroreCaricamento && <p className="errore">{erroreCaricamento}</p>}

        {dati && (
          <div className="evento-context">
            <p><b>{dati.tragitto.nome}</b>{dati.evento && <> — {dati.evento.artista}, {dati.evento.luogo} ({dati.evento.citta}), {new Date(dati.evento.data).toLocaleDateString('it-IT')}</>}</p>
            {dati.tragitto.arrivoCitta && <p>Arrivo: {dati.tragitto.arrivoCitta}{dati.tragitto.arrivoOrario ? ` alle ${dati.tragitto.arrivoOrario}` : ''}</p>}
            {dati.fermate.length > 0 && (
              <>
                <p style={{ marginTop: 10, marginBottom: 4 }}><b>Fermate</b></p>
                {dati.fermate.map((f, i) => (
                  <p key={i} style={{ margin: '2px 0', fontSize: 13.5 }}>{f.citta}{f.indirizzo ? ` — ${f.indirizzo}` : ''}{f.orario ? ` · ore ${f.orario}` : ''}</p>
                ))}
              </>
            )}
          </div>
        )}

        {dati && !dati.giaRisposto && !inviato && (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-grid">
              <label>Prezzo (€) <input type="text" inputMode="decimal" placeholder="es. 850" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} required /></label>
              <label className="full">Allega il tuo preventivo (facoltativo) <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            </div>
            <p className="errore">{errore}</p>
            <button type="button" className="btn-primary" disabled={inviando} onClick={invia}>{inviando ? 'Invio...' : 'Invia preventivo'}</button>
            <p className="sub" style={{ marginTop: 12, fontSize: 12.5 }}>Attenzione: una volta inviata, la risposta non potrà più essere modificata da qui — per correzioni, contatta direttamente chi ti ha scritto.</p>
          </form>
        )}

        {dati?.giaRisposto && !inviato && (
          <div className="success-box">
            <h2>Preventivo già inviato</h2>
            <p>Hai già risposto a questa richiesta con un prezzo di €{dati.risposta?.prezzo}. Per modificarlo, contatta direttamente chi ti ha scritto.</p>
          </div>
        )}

        {inviato && (
          <div className="success-box">
            <h2>Preventivo inviato</h2>
            <p>Grazie! Il tuo preventivo è stato ricevuto — riceverai un riscontro appena verrà valutato.</p>
          </div>
        )}
      </main>
      <CookieBanner />
    </>
  );
}
