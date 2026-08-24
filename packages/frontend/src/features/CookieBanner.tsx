import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const CHIAVE_CONSENSO = 'inbus_consenso_cookie';

export interface ConsensoCookie {
  preferenze: boolean;
  statistiche: boolean;
  marketing: boolean;
}
const CATEGORIE: { chiave: keyof ConsensoCookie; nome: string; descrizione: string }[] = [
  { chiave: 'preferenze', nome: 'Preferenze', descrizione: 'Ricordano le tue scelte sul sito (es. filtri usati, città preferita) per non richiedertele ogni volta.' },
  { chiave: 'statistiche', nome: 'Statistiche', descrizione: 'Ci aiutano a capire come viene usato il sito, in forma aggregata — nessun dato che ti identifichi personalmente.' },
  { chiave: 'marketing', nome: 'Marketing', descrizione: 'Usati per mostrarti annunci più pertinenti, anche fuori da questo sito.' },
];

/** Legge la scelta salvata — null se non ha ancora scelto nulla. */
function leggiConsenso(): ConsensoCookie | null {
  const grezzo = localStorage.getItem(CHIAVE_CONSENSO);
  if (!grezzo) return null;
  try {
    return JSON.parse(grezzo);
  } catch {
    return null; // valore vecchio/rotto (es. dalla versione precedente a scelta unica) — richiedi di nuovo
  }
}

function salvaConsenso(valore: ConsensoCookie) {
  localStorage.setItem(CHIAVE_CONSENSO, JSON.stringify(valore));
  window.dispatchEvent(new Event('inbus-consenso-cookie-cambiato'));
}

/** Vero solo se l'utente ha dato il consenso per quella specifica
 *  categoria — usala prima di caricare qualunque script di terze parti.
 *  "Funzionale" non serve chiederlo: è sempre attivo, necessario al
 *  funzionamento stesso del sito. */
export function haConsensoPer(categoria: keyof ConsensoCookie): boolean {
  return leggiConsenso()?.[categoria] === true;
}

/**
 * Banner di consenso cookie con pannello a 4 categorie (Funzionale,
 * Preferenze, Statistiche, Marketing) — obbligatorio per legge in
 * UE/Italia se il sito usa cookie non strettamente necessari. Pronto
 * per quando aggiungerai un vero strumento di tracciamento: fallo
 * partire solo dopo aver controllato haConsensoPer() per la categoria
 * giusta.
 *
 * Due livelli: un primo banner semplice (Accetta tutti / Rifiuta tutti
 * / Personalizza), e — solo se si clicca "Personalizza" — un pannello
 * con un interruttore per categoria.
 */
export function CookieBanner() {
  const [visibile, setVisibile] = useState(false);
  const [personalizzaAperto, setPersonalizzaAperto] = useState(false);
  const [scelte, setScelte] = useState<ConsensoCookie>({ preferenze: false, statistiche: false, marketing: false });

  useEffect(() => {
    function aggiornaVisibilita() {
      const salvato = leggiConsenso();
      setVisibile(!salvato);
      if (salvato) setScelte(salvato);
    }
    aggiornaVisibilita();
    window.addEventListener('inbus-consenso-cookie-cambiato', aggiornaVisibilita);
    return () => window.removeEventListener('inbus-consenso-cookie-cambiato', aggiornaVisibilita);
  }, []);

  if (!visibile) return null;

  function accettaTutti() {
    salvaConsenso({ preferenze: true, statistiche: true, marketing: true });
    setVisibile(false);
  }
  function rifiutaTutti() {
    salvaConsenso({ preferenze: false, statistiche: false, marketing: false });
    setVisibile(false);
  }
  function salvaPersonalizzate() {
    salvaConsenso(scelte);
    setVisibile(false);
  }

  return (
    <div className="cookie-banner">
      {!personalizzaAperto ? (
        <>
          <p>
            Usiamo cookie tecnici necessari al funzionamento del sito. Con il tuo consenso potremmo usarne altri per
            preferenze, statistiche e marketing — leggi la <Link to="/pagina/cookie">informativa cookie</Link> per i dettagli.
          </p>
          <div className="cookie-banner-azioni">
            <button className="btn btn-ghost" onClick={rifiutaTutti}>Rifiuta tutti</button>
            <button className="btn btn-ghost" onClick={() => setPersonalizzaAperto(true)}>Personalizza</button>
            <button className="btn btn-primary" onClick={accettaTutti}>Accetta tutti</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ marginBottom: 10 }}>
            Scegli quali cookie accettare, categoria per categoria. "Funzionale" è sempre attivo — serve al sito
            stesso per funzionare, non è disattivabile.
          </p>
          <div className="cookie-categorie">
            <div className="cookie-categoria">
              <div className="cookie-categoria-testata">
                <b>Funzionale</b>
                <span className="cookie-categoria-sempre-attivo">Sempre attivo</span>
              </div>
              <p>Necessari al funzionamento base del sito (es. restare collegato al tuo account).</p>
            </div>
            {CATEGORIE.map((c) => (
              <div className="cookie-categoria" key={c.chiave}>
                <div className="cookie-categoria-testata">
                  <b>{c.nome}</b>
                  <label className="cookie-toggle">
                    <input
                      type="checkbox"
                      checked={scelte[c.chiave]}
                      onChange={(e) => setScelte((s) => ({ ...s, [c.chiave]: e.target.checked }))}
                    />
                    <span className="cookie-toggle-slider" />
                  </label>
                </div>
                <p>{c.descrizione}</p>
              </div>
            ))}
          </div>
          <div className="cookie-banner-azioni">
            <button className="btn btn-ghost" onClick={() => setPersonalizzaAperto(false)}>← Indietro</button>
            <button className="btn btn-primary" onClick={salvaPersonalizzate}>Salva preferenze</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Link "Preferenze cookie" per riaprire il pannello in qualsiasi
 *  momento (obbligatorio per legge, non basta chiederlo una volta sola
 *  all'inizio) — messo di solito nel footer del sito. */
export function LinkPreferenzeCookie() {
  return (
    <button
      type="button"
      className="link-preferenze-cookie"
      onClick={() => { localStorage.removeItem(CHIAVE_CONSENSO); window.dispatchEvent(new Event('inbus-consenso-cookie-cambiato')); }}
    >
      Preferenze cookie
    </button>
  );
}
