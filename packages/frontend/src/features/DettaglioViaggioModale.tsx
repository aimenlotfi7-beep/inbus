import { useEffect, useId, useState } from 'react';
import { prenotazioniApi, type DettaglioPrenotazione } from '../api/prenotazioni';
import { ticketApi, type Biglietto } from '../api/ticket';
import { calcolaStatoPrenotazione } from './statoPrenotazione';
import { PulsanteCondividi } from './PulsanteCondividi';
import { formattaEuro } from '../shared/formato';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** La "travel card" — tutto quello che serve sapere su UN viaggio in
 *  una sola schermata: percorso, partecipanti, stato del pagamento con
 *  una mini-timeline, e le azioni possibili da qui (saldare, chattare,
 *  chiedere assistenza). Sostituisce l'idea di dover andare a cercare
 *  le informazioni in posti diversi. */
export function DettaglioViaggioModale({ pnr, email, onClose, onVaiAllaChat }: {
  pnr: string;
  email: string;
  onClose: () => void;
  onVaiAllaChat: () => void;
}) {
  const [dettaglio, setDettaglio] = useState<DettaglioPrenotazione | null>(null);
  const [biglietti, setBiglietti] = useState<Biglietto[]>([]);
  const idTitolo = useId();
  // Aggiornato ogni minuto — serve per far scorrere il conto alla
  // rovescia senza dover ricaricare la pagina.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAdesso(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    prenotazioniApi.dettaglioPerCliente(pnr, email).then(setDettaglio).catch(() => setDettaglio(null));
    ticketApi.lista(pnr, email).then(setBiglietti);
  }, [pnr, email]);

  // Chi naviga solo da tastiera prima non aveva alcun modo di chiudere
  // il popup — stesso comportamento del tasto ✕. In cima, prima di
  // ogni return, perché gli hook non possono essere condizionali.
  useEffect(() => {
    function allaPressione(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', allaPressione);
    return () => window.removeEventListener('keydown', allaPressione);
  }, [onClose]);

  async function richiediRimborso() {
    const motivo = prompt('Vuoi aggiungere una nota per l\'amministrazione? (facoltativo, puoi lasciare vuoto)') ?? '';
    try {
      const r = await fetch(`${API_URL}/api/richieste-rimborso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pnr, email, motivo: motivo || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).errore ?? 'Richiesta non riuscita.');
      alert('Richiesta di rimborso inviata — verrà valutata al più presto.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Richiesta non riuscita, riprova.');
    }
  }

  if (!dettaglio) {
    return (
      <div className="travel-overlay" onClick={onClose}>
        <div className="travel-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dettaglio viaggio">
          <button className="travel-close" onClick={onClose} aria-label="Chiudi">✕</button>
          <p style={{ color: 'var(--mist)', marginTop: 30 }}>Carico...</p>
        </div>
      </div>
    );
  }

  const ev = dettaglio.evento;

  const oggi = new Date().toISOString().slice(0, 10);
  const giorniAlViaggio = ev ? Math.ceil((new Date(ev.data).getTime() - Date.now()) / (24 * 3600 * 1000)) : null;
  const pagamentoCompleto = dettaglio.tipoPagamento === 'COMPLETO' || dettaglio.saldoPagato;
  const stato = calcolaStatoPrenotazione(dettaglio);

  return (
    <div className="travel-overlay" onClick={onClose}>
      <div className="travel-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={idTitolo}>
        <button className="travel-close" onClick={onClose} aria-label="Chiudi">✕</button>

        <span className={`badge ${stato.classe}`}>
          {stato.chiave === 'confermata' ? '✓ ' : stato.chiave === 'acconto_scaduto' ? '⚠ ' : ''}{stato.etichetta}
        </span>

        <h1 id={idTitolo} style={{ margin: '10px 0 2px' }}>{ev?.artista ?? 'Evento'}</h1>
        {ev && (
          <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-base)', margin: 0 }}>
            {new Date(ev.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {giorniAlViaggio !== null && ev.data >= oggi && (giorniAlViaggio === 0 ? ' · oggi!' : giorniAlViaggio === 1 ? ' · domani!' : ` · tra ${giorniAlViaggio} giorni`)}
          </p>
        )}

        <div className="travel-route">
          <b>{dettaglio.fermataCitta}</b>
          {dettaglio.fermataOrario && <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>{dettaglio.fermataOrario}</span>}
          <span className="travel-arrow">→</span>
          <b>{ev?.citta}</b>
        </div>

        <p style={{ fontSize: 'var(--testo-md)', color: 'var(--mist)' }}>PNR <span className="pnr-tag">{dettaglio.pnr}</span></p>

        <p className="section-label" style={{ marginTop: 18 }}>Partecipanti ({dettaglio.passeggeri})</p>
        <div className="travel-partecipanti">
          {dettaglio.partecipanti.map((p, i) => (
            <span className="travel-partecipante-chip" key={i}>{p.nome} {p.cognome}</span>
          ))}
        </div>

        {dettaglio.stato === 'CONFERMATA' && (() => {
          // Il biglietto arriva dopo lo smistamento sui bus per età, il
          // giorno prima della partenza: prima non si sa su quale bus si
          // viaggia. Data e bus arrivano dal server (disponibileDal, bus),
          // che fa lo stesso controllo quando si scarica.
          const disponibileDal = biglietti.find((b) => b.disponibileDal)?.disponibileDal ?? null;
          const msAllaDisponibilita = disponibileDal ? new Date(disponibileDal).getTime() - adesso : null;
          const busAssegnato = biglietti.find((b) => b.bus)?.bus ?? null;
          return (
            <>
              <p className="section-label" style={{ marginTop: 18 }}>I miei biglietti</p>
              {!pagamentoCompleto ? (
                <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)' }}>
                  I biglietti saranno disponibili dopo il saldo, il giorno prima della partenza.
                </p>
              ) : msAllaDisponibilita !== null && msAllaDisponibilita > 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ margin: 0, fontSize: 'var(--testo-base)' }}>
                    Il biglietto con il tuo bus arriva via email il giorno prima della partenza, e da quel momento puoi scaricarlo anche da qui.
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--testo-2xl)', fontWeight: 700 }}>
                    {formattaConteggio(msAllaDisponibilita / 3600000)}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 'var(--testo-sm)', color: 'var(--mist)' }}>
                    Prima dividiamo i passeggeri sui bus: per questo il bus non è ancora indicato.
                  </p>
                </div>
              ) : biglietti.length > 0 && busAssegnato ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 'var(--testo-base)' }}>Il tuo bus: <b>{busAssegnato}</b></p>
                  {biglietti.map((b) => (
                    <div key={b.token} className="travel-biglietto-riga">
                      <span>{b.nome} {b.cognome}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '5px 10px', textDecoration: 'none' }} href={ticketApi.urlDownload(b.token)} target="_blank" rel="noreferrer">
                          Scarica
                        </a>
                        <PulsanteCondividi
                          titolo={`Biglietto OnWay — ${ev?.artista ?? ''}`}
                          testo={`Ecco il biglietto per ${b.nome} ${b.cognome} — ${ev?.artista ?? ''}`}
                          link={ticketApi.urlDownload(b.token)}
                          etichetta="Condividi"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)' }}>
                  Stiamo assegnando i posti sui bus: il biglietto arriva a breve via email e comparirà qui. Se non arriva entro qualche ora, scrivici in chat.
                </p>
              )}
            </>
          );
        })()}

        <p className="section-label" style={{ marginTop: 18 }}>Pagamento</p>
        <div className="travel-timeline">
          <div className="travel-timeline-riga">✓ Prenotazione confermata</div>
          {pagamentoCompleto ? (
            <div className="travel-timeline-riga">✓ Pagamento completato — {formattaEuro(dettaglio.totale)}</div>
          ) : (
            <>
              <div className="travel-timeline-riga">✓ Acconto ricevuto</div>
              <div className="travel-timeline-riga" style={{ color: stato.chiave === 'acconto_scaduto' ? 'var(--pink)' : '#e0a95b' }}>
                {stato.chiave === 'acconto_scaduto' ? '⚠ Termine per il saldo superato' : '⚠ Saldo da versare'}
                {dettaglio.scadenzaSaldo ? ` ${stato.chiave === 'acconto_scaduto' ? 'il' : 'entro il'} ${new Date(dettaglio.scadenzaSaldo).toLocaleDateString('it-IT')}` : ''}
              </div>
            </>
          )}
        </div>

        {dettaglio.stato === 'CONFERMATA' && (
          <div className="travel-azioni">
            {!pagamentoCompleto && (
              <a className="btn btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }} href={`/completa-saldo/${dettaglio.pnr}`}>
                Paga il saldo
              </a>
            )}
            <button className="btn btn-ghost" onClick={onVaiAllaChat}>💬 Hai bisogno di aiuto? Scrivi allo staff</button>
            <button className="btn-mini" onClick={richiediRimborso}>Richiedi rimborso</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Formatta le ore rimanenti in un testo leggibile — giorni+ore se
 *  manca più di un giorno, solo ore+minuti altrimenti (più preciso man
 *  mano che ci si avvicina, quando conta di più). */
function formattaConteggio(oreRimanenti: number): string {
  if (oreRimanenti <= 0) return 'Disponibile a breve';
  const giorni = Math.floor(oreRimanenti / 24);
  const oreResto = Math.floor(oreRimanenti % 24);
  if (giorni > 0) return `${giorni} giorno${giorni === 1 ? '' : 'i'} e ${oreResto} or${oreResto === 1 ? 'a' : 'e'}`;
  const minutiResto = Math.round((oreRimanenti - oreResto) * 60);
  return `${oreResto} or${oreResto === 1 ? 'a' : 'e'} e ${minutiResto} minuti`;
}
