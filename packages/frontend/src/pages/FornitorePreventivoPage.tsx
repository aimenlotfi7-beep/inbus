import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import '../styles/tourleader.css';
import { LogoOnWay } from '../features/LogoOnWay';
import { preventiviApi, type DatiPubbliciPreventivo } from '../api/preventivi';
import { ErroreApi } from '../api/client';
import { formattaData, formattaEuro } from '../shared/formato';
import { CookieBanner } from '../features/CookieBanner';
import { useSeoTags } from '../features/useSeoTags';

/** Pagina pubblica raggiunta dal link nella mail al fornitore — nessun
 *  accesso richiesto, il token stesso è la chiave. Due tipi di richiesta
 *  (settembre 2026): una QUOTAZIONE indicativa per il tragitto, che non
 *  impegna, oppure il PREVENTIVO per un bus preciso (le sue fermate). Il
 *  fornitore indica prezzo e posti del bus. Una volta inviata la risposta è
 *  definitiva: non si può più modificare da qui. Se la richiesta nasce da un
 *  cambio di percorso, lo dice in evidenza (stesso viola del gestionale). */
export function FornitorePreventivoPage() {
  const { token } = useParams<{ token: string }>();
  const [dati, setDati] = useState<DatiPubbliciPreventivo | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [erroreCaricamento, setErroreCaricamento] = useState('');

  const [prezzo, setPrezzo] = useState('');
  const [posti, setPosti] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState('');

  const perBus = dati?.scopo === 'BUS';
  const titolo = perBus ? 'Preventivo per un bus' : dati?.perCambioPercorso ? 'Nuova quotazione: percorso cambiato' : 'Richiesta di quotazione';

  // Il link contiene il token personale: non finisce in og:url/canonical.
  useSeoTags({
    title: `${dati ? titolo : 'Richiesta al fornitore'} — OnWay`,
    description: 'Rispondi alla richiesta OnWay per il viaggio indicato.',
    url: `${window.location.origin}/fornitore/preventivo`,
  });

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
    const valorePosti = Number(posti);
    if (!Number.isInteger(valorePosti) || valorePosti < 1 || valorePosti > 200) { setErrore('Inserisci quanti posti ha il bus (un numero da 1 a 200).'); return; }
    setInviando(true);
    try {
      const fileContenuto = file ? await fileABase64(file) : undefined;
      await preventiviApi.rispondiPubblico(token, { prezzo: valorePrezzo, postiBus: valorePosti, fileNome: file?.name, fileContenuto });
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
        <h1>{dati ? titolo : 'Richiesta al fornitore'}</h1>

        {caricando && <p className="sub" role="status">Carico la richiesta…</p>}
        {erroreCaricamento && <p className="errore">{erroreCaricamento}</p>}

        {dati && !perBus && !dati.giaRisposto && !inviato && !dati.giaAssegnato && (
          <p className="sub">Ci serve un prezzo indicativo per un bus su questo percorso, per preparare i prezzi del viaggio: non è un impegno. Quando le prenotazioni lo richiederanno Le chiederemo il preventivo vero per ogni bus, e chi ci ha dato la quotazione avrà la precedenza.</p>
        )}

        {dati?.perCambioPercorso && !dati.giaRisposto && !inviato && (
          <div style={{ border: '1px solid #7c3aed', background: '#f5f0ff', color: '#3b1f7a', borderRadius: 10, padding: '12px 14px', margin: '0 0 14px' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Il percorso è cambiato</p>
            <p style={{ margin: '4px 0 0' }}>Dopo la quotazione precedente alcune fermate sono state tolte o aggiunte: quelle qui sotto sono le fermate aggiornate. Le chiediamo un nuovo prezzo su questo percorso.</p>
          </div>
        )}

        {dati && (
          <div className="evento-context">
            <p><b>{perBus && dati.bus?.nome ? `${dati.bus.nome} · ` : ''}{dati.tragitto.nome}</b>{dati.evento && <> — {dati.evento.artista}, {dati.evento.luogo} ({dati.evento.citta}), {formattaData(dati.evento.data)}</>}</p>
            {dati.tragitto.arrivoCitta && <p>Arrivo: {dati.tragitto.arrivoCitta}{dati.tragitto.arrivoOrario ? ` alle ${dati.tragitto.arrivoOrario}` : ''}</p>}
            {perBus && dati.bus?.postiRiferimento && <p>Posti di riferimento: circa {dati.bus.postiRiferimento}</p>}
            {dati.fermate.length > 0 && (
              <>
                <p style={{ marginTop: 10, marginBottom: 4 }}><b>{perBus ? 'Fermate del bus' : 'Fermate'}</b></p>
                {dati.fermate.map((f, i) => (
                  <p key={i} style={{ margin: '2px 0', fontSize: 'var(--testo-base)' }}>{f.citta}{f.indirizzo ? ` — ${f.indirizzo}` : ''}{f.orario ? ` · ore ${f.orario}` : ''}</p>
                ))}
              </>
            )}
          </div>
        )}

        {dati?.giaAssegnato && !dati.giaRisposto && (
          <div className="success-box">
            <h2>Richiesta non più aperta</h2>
            <p>{dati.motivoChiusura ?? 'Non si possono più inviare offerte per questa richiesta.'} Grazie per la disponibilità.</p>
          </div>
        )}

        {dati?.scaduto && !dati.giaRisposto && !dati.giaAssegnato && (
          <div className="success-box">
            <h2>Link scaduto</h2>
            <p>Questa richiesta non è più aperta. Se vuole ancora inviare un'offerta, contatti direttamente chi le ha scritto.</p>
          </div>
        )}

        {dati && !dati.giaRisposto && !dati.scaduto && !dati.giaAssegnato && !inviato && (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-grid">
              <label>Prezzo (€) <input type="text" inputMode="decimal" placeholder="es. 850" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} required /></label>
              <label>Posti del bus <input type="text" inputMode="numeric" placeholder="es. 54" value={posti} onChange={(e) => setPosti(e.target.value.replace(/\D/g, ''))} required /></label>
              <label className="full">Allega {perBus ? 'il tuo preventivo' : 'la tua quotazione'} (facoltativo) <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            </div>
            <p className="errore">{errore}</p>
            <button type="button" className="btn-primary" disabled={inviando} onClick={invia}>{inviando ? 'Invio…' : perBus ? 'Invia preventivo' : 'Invia quotazione'}</button>
            <p className="sub" style={{ marginTop: 12, fontSize: 'var(--testo-md)' }}>Attenzione: una volta inviata, la risposta non potrà più essere modificata da qui — per correzioni, contatta direttamente chi ti ha scritto.</p>
          </form>
        )}

        {dati?.giaRisposto && !inviato && (
          <div className="success-box">
            <h2>{perBus ? 'Preventivo già inviato' : 'Quotazione già inviata'}</h2>
            <p>Hai già risposto a questa richiesta con un prezzo di {formattaEuro(dati.risposta?.prezzo)}{dati.risposta?.postiBus ? ` per un bus da ${dati.risposta.postiBus} posti` : ''}. Per modificarlo, contatta direttamente chi ti ha scritto.</p>
          </div>
        )}

        {inviato && (
          <div className="success-box">
            <h2>{perBus ? 'Preventivo inviato' : 'Quotazione inviata'}</h2>
            <p>Grazie! {perBus ? 'Il tuo preventivo è stato ricevuto: riceverai un riscontro appena verrà valutato.' : 'La tua quotazione è stata ricevuta: ti ricontatteremo quando serviranno i bus.'}</p>
          </div>
        )}
      </main>
      <CookieBanner />
    </div>
  );
}
