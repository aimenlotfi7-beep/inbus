import { useEffect, useId, useRef, useState } from 'react';
import { prenotazioniApi, type DettaglioPrenotazione } from '../api/prenotazioni';
import { ticketApi, type Biglietto } from '../api/ticket';
import { calcolaStatoPrenotazione } from './statoPrenotazione';
import { PulsanteCondividi } from './PulsanteCondividi';
import { ModaleRimborso } from './ModaleRimborso';
import { Icona } from './Icone';
import { formattaEuro, formattaData, giorniAllaData, plurale } from '../shared/formato';

const formatoDataLunga = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** La "travel card" — tutto quello che serve sapere su UN viaggio in
 *  una sola schermata, con la stessa gerarchia della card in Panoramica:
 *  stato, titolo, data, percorso, poi biglietto, pagamento, passeggeri
 *  e le azioni possibili da qui (saldare, scrivere allo staff, chiedere
 *  il rimborso). Su telefono è un foglio che sale dal basso. */
export function DettaglioViaggioModale({ pnr, email, onClose, onVaiAllaChat }: {
  pnr: string;
  email: string;
  onClose: () => void;
  onVaiAllaChat: () => void;
}) {
  const [dettaglio, setDettaglio] = useState<DettaglioPrenotazione | null>(null);
  const [biglietti, setBiglietti] = useState<Biglietto[]>([]);
  const [rimborsoAperto, setRimborsoAperto] = useState(false);
  const [esitoRimborso, setEsitoRimborso] = useState('');
  const idTitolo = useId();
  const chiudiRef = useRef<HTMLButtonElement>(null);
  // Aggiornato ogni minuto — serve per far scorrere il conto alla
  // rovescia senza dover ricaricare la pagina.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAdesso(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    prenotazioniApi.dettaglioPerCliente(pnr, email).then(setDettaglio).catch(() => setDettaglio(null));
    ticketApi.lista(pnr, email).then(setBiglietti).catch(() => setBiglietti([]));
  }, [pnr, email]);

  // Il fuoco va sul pulsante di chiusura all'apertura; Esc chiude — ma
  // non mentre è aperta la finestra del rimborso, che gestisce da sé
  // il suo Esc. In cima, prima di ogni return: gli hook non possono
  // essere condizionali.
  // Quando il dettaglio arriva il riquadro "Carico…" è sostituito da
  // quello completo e il pulsante di prima sparisce: il fuoco va di nuovo
  // su "Chiudi". Alla chiusura torna a chi ha aperto la scheda.
  // (Prima si ricorda chi aveva il fuoco, poi lo si sposta.)
  useEffect(() => {
    const apertoDa = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { if (apertoDa?.isConnected) apertoDa.focus(); };
  }, []);
  const caricato = !!dettaglio;
  useEffect(() => { chiudiRef.current?.focus(); }, [caricato]);
  useEffect(() => {
    function allaPressione(e: KeyboardEvent) {
      if (e.key === 'Escape' && !rimborsoAperto) onClose();
    }
    window.addEventListener('keydown', allaPressione);
    return () => window.removeEventListener('keydown', allaPressione);
  }, [onClose, rimborsoAperto]);

  const pulsanteChiudi = (
    <button ref={chiudiRef} type="button" className="btn-icona travel-close" onClick={onClose} aria-label="Chiudi">
      <Icona nome="chiudi" dimensione={20} />
    </button>
  );

  if (!dettaglio) {
    return (
      <div className="travel-overlay" onClick={onClose}>
        <div className="travel-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dettaglio viaggio">
          {pulsanteChiudi}
          <p className="travel-nota" role="status">Carico…</p>
        </div>
      </div>
    );
  }

  const ev = dettaglio.evento;
  const oggi = new Date().toISOString().slice(0, 10);
  const giorniAlViaggio = ev ? giorniAllaData(ev.data) : null;
  const pagamentoCompleto = dettaglio.tipoPagamento === 'COMPLETO' || dettaglio.saldoPagato;
  const stato = calcolaStatoPrenotazione(dettaglio);

  return (
    <div className="travel-overlay" onClick={onClose}>
      <div className="travel-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={idTitolo}>
        <div className="travel-testata">
          <span className={`badge ${stato.classe}`}>{stato.etichetta}</span>
          {pulsanteChiudi}
        </div>

        <h1 id={idTitolo}>{ev?.artista ?? 'Evento'}</h1>
        {ev && (
          <p className="travel-data">
            {formatoDataLunga.format(new Date(ev.data))}
            {giorniAlViaggio !== null && ev.data >= oggi && (giorniAlViaggio <= 0 ? ' · oggi' : giorniAlViaggio === 1 ? ' · domani' : ` · tra ${plurale(giorniAlViaggio, 'giorno', 'giorni')}`)}
          </p>
        )}

        <p className="travel-route">
          <Icona nome="pin" dimensione={18} />
          <b>{dettaglio.fermataCitta}</b>
          {dettaglio.fermataOrario && <span className="travel-ora">{dettaglio.fermataOrario}</span>}
          <span className="travel-arrow" aria-hidden="true">→</span>
          <b>{ev?.citta}</b>
        </p>
        <p className="travel-nota">Codice prenotazione <span className="pnr-tag">{dettaglio.pnr}</span></p>

        {esitoRimborso && <p className="avviso avviso-ok travel-avviso" role="status">{esitoRimborso}</p>}

        {dettaglio.stato === 'CONFERMATA' && (() => {
          // Il biglietto arriva dopo lo smistamento sui bus per età, il
          // giorno prima della partenza: prima non si sa su quale bus si
          // viaggia. Data e bus arrivano dal server (disponibileDal, bus),
          // che fa lo stesso controllo quando si scarica.
          const disponibileDal = biglietti.find((b) => b.disponibileDal)?.disponibileDal ?? null;
          const msAllaDisponibilita = disponibileDal ? new Date(disponibileDal).getTime() - adesso : null;
          const busAssegnato = biglietti.find((b) => b.bus)?.bus ?? null;
          return (
            <section className="travel-sezione">
              <h2 className="section-label">Biglietto</h2>
              {!pagamentoCompleto ? (
                <p className="travel-nota">I biglietti saranno disponibili dopo il saldo, il giorno prima della partenza.</p>
              ) : msAllaDisponibilita !== null && msAllaDisponibilita > 0 ? (
                <div className="travel-riquadro">
                  <p>Il biglietto con il tuo bus arriva via email il giorno prima della partenza, e da quel momento puoi scaricarlo anche da qui.</p>
                  <p className="travel-conteggio">{formattaConteggio(msAllaDisponibilita / 3600000)}</p>
                  <p className="travel-nota">Prima dividiamo i passeggeri sui bus: per questo il bus non è ancora indicato.</p>
                </div>
              ) : biglietti.length > 0 && busAssegnato ? (
                <div className="travel-biglietti">
                  <p className="travel-bus"><Icona nome="bus" dimensione={18} />Il tuo bus: <b>{busAssegnato}</b></p>
                  {biglietti.map((b) => (
                    <div key={b.token} className="travel-biglietto-riga">
                      <span>{b.nome} {b.cognome}</span>
                      <div className="travel-biglietto-azioni">
                        <a className="btn btn-secondary btn-sm" href={ticketApi.urlDownload(b.token)} target="_blank" rel="noreferrer">
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
                <p className="travel-nota">
                  Stiamo assegnando i posti sui bus: il biglietto arriva a breve via email e comparirà qui. Se non arriva entro qualche ora, scrivici.
                </p>
              )}
            </section>
          );
        })()}

        <section className="travel-sezione">
          <h2 className="section-label">Pagamento</h2>
          <ul className="travel-timeline">
            <li><Icona nome="spunta" dimensione={18} strokeWidth={2.4} className="fatto" />Prenotazione confermata</li>
            {pagamentoCompleto ? (
              <li><Icona nome="spunta" dimensione={18} strokeWidth={2.4} className="fatto" />Pagamento completato: {formattaEuro(dettaglio.totale)}</li>
            ) : (
              <>
                <li><Icona nome="spunta" dimensione={18} strokeWidth={2.4} className="fatto" />Acconto ricevuto</li>
                <li>
                  <Icona nome="info" dimensione={18} className={stato.chiave === 'acconto_scaduto' ? 'scaduto' : 'in-attesa'} />
                  {stato.chiave === 'acconto_scaduto' ? 'Termine per il saldo superato' : 'Saldo da versare'}
                  {dettaglio.scadenzaSaldo ? ` ${stato.chiave === 'acconto_scaduto' ? 'il' : 'entro il'} ${formattaData(dettaglio.scadenzaSaldo)}` : ''}
                </li>
              </>
            )}
          </ul>
        </section>

        <section className="travel-sezione">
          <h2 className="section-label">{plurale(dettaglio.passeggeri, 'Passeggero', 'Passeggeri')}</h2>
          <div className="travel-partecipanti">
            {dettaglio.partecipanti.map((p, i) => (
              <span className="travel-partecipante-chip" key={i}>{p.nome} {p.cognome}</span>
            ))}
          </div>
        </section>

        {dettaglio.stato === 'CONFERMATA' && (
          <div className="travel-azioni">
            {!pagamentoCompleto && (
              <a className="btn btn-primary btn-block" href={`/completa-saldo/${dettaglio.pnr}`}>Paga il saldo</a>
            )}
            <button type="button" className="btn btn-secondary btn-block" onClick={onVaiAllaChat}>Scrivi allo staff</button>
            <button type="button" className="btn btn-tertiary" onClick={() => setRimborsoAperto(true)}>Richiedi rimborso</button>
          </div>
        )}

        {rimborsoAperto && (
          <ModaleRimborso
            pnr={dettaglio.pnr}
            email={email}
            onChiudi={() => setRimborsoAperto(false)}
            onInviata={() => setEsitoRimborso('Richiesta di rimborso inviata: ti rispondiamo via email appena è stata valutata.')}
          />
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
  if (giorni > 0) return `${plurale(giorni, 'giorno', 'giorni')} e ${plurale(oreResto, 'ora', 'ore')}`;
  const minutiResto = Math.round((oreRimanenti - oreResto) * 60);
  return `${plurale(oreResto, 'ora', 'ore')} e ${plurale(minutiResto, 'minuto', 'minuti')}`;
}
