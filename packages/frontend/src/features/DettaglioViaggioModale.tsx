import { useEffect, useState } from 'react';
import { prenotazioniApi, type DettaglioPrenotazione } from '../api/prenotazioni';
import { ticketApi, type Biglietto } from '../api/ticket';
import { calcolaStatoPrenotazione } from './statoPrenotazione';
import { PulsanteCondividi } from './PulsanteCondividi';

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

  useEffect(() => {
    prenotazioniApi.dettaglioPerCliente(pnr, email).then(setDettaglio).catch(() => setDettaglio(null));
    ticketApi.lista(pnr, email).then(setBiglietti);
  }, [pnr, email]);

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
        <div className="travel-card" onClick={(e) => e.stopPropagation()}>
          <button className="travel-close" onClick={onClose}>✕</button>
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
      <div className="travel-card" onClick={(e) => e.stopPropagation()}>
        <button className="travel-close" onClick={onClose}>✕</button>

        <span className={`badge ${stato.classe}`}>
          {stato.chiave === 'confermata' ? '✓ ' : stato.chiave === 'acconto_scaduto' ? '⚠ ' : ''}{stato.etichetta}
        </span>

        <h1 style={{ margin: '10px 0 2px' }}>{ev?.artista ?? 'Evento'}</h1>
        {ev && (
          <p style={{ color: 'var(--mist)', fontSize: 13.5, margin: 0 }}>
            {new Date(ev.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {giorniAlViaggio !== null && ev.data >= oggi && (giorniAlViaggio === 0 ? ' · oggi!' : giorniAlViaggio === 1 ? ' · domani!' : ` · tra ${giorniAlViaggio} giorni`)}
          </p>
        )}

        <div className="travel-route">
          <b>{dettaglio.fermataCitta}</b>
          {dettaglio.fermataOrario && <span style={{ color: 'var(--mist)', fontSize: 12 }}>{dettaglio.fermataOrario}</span>}
          <span className="travel-arrow">→</span>
          <b>{ev?.citta}</b>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--mist)' }}>PNR <span className="pnr-tag">{dettaglio.pnr}</span></p>

        <p className="section-label" style={{ marginTop: 18 }}>Partecipanti ({dettaglio.passeggeri})</p>
        <div className="travel-partecipanti">
          {dettaglio.partecipanti.map((p, i) => (
            <span className="travel-partecipante-chip" key={i}>{p.nome} {p.cognome}</span>
          ))}
        </div>

        {dettaglio.stato === 'CONFERMATA' && (
          <>
            <p className="section-label" style={{ marginTop: 18 }}>I miei biglietti</p>
            {biglietti.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {biglietti.map((b) => (
                  <div key={b.token} className="travel-biglietto-riga">
                    <span>🎫 {b.nome} {b.cognome}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', textDecoration: 'none' }} href={ticketApi.urlDownload(b.token)} target="_blank" rel="noreferrer">
                        Scarica
                      </a>
                      <PulsanteCondividi
                        titolo={`Biglietto INBUS — ${ev?.artista ?? ''}`}
                        testo={`Ecco il biglietto per ${b.nome} ${b.cognome} — ${ev?.artista ?? ''}`}
                        link={ticketApi.urlDownload(b.token)}
                        etichetta="Condividi"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--mist)', fontSize: 13 }}>
                {pagamentoCompleto
                  ? 'I biglietti sono in preparazione — se non compaiono entro poco, scrivici in chat.'
                  : 'I biglietti saranno disponibili qui non appena il saldo sarà completato.'}
              </p>
            )}
          </>
        )}

        <p className="section-label" style={{ marginTop: 18 }}>Pagamento</p>
        <div className="travel-timeline">
          <div className="travel-timeline-riga">✓ Prenotazione confermata</div>
          {pagamentoCompleto ? (
            <div className="travel-timeline-riga">✓ Pagamento completato — €{Number(dettaglio.totale).toFixed(2)}</div>
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
