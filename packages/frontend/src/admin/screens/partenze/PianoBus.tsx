import { useState } from 'react';
import { eventiApi, type AnteprimaPiano } from '../../../api/eventi';
import { Modale } from '../../shared/Modale';
import { notifica } from '../../shared/notifiche';
import { motivoErrore } from '../../shared/errori';
import { formattaEuro, plurale } from '../../../shared/formato';

/** "Crea piano" (proprietario, ottobre 2026): mostra come sarebbero i bus
 *  se si decidesse adesso — quanti, da dove partono, chi ci sale, quanto
 *  costano — e permette di confermarlo senza aspettare la data stabilita
 *  nelle Impostazioni. Finché non si conferma non viene scritto niente e
 *  nessun fornitore riceve richieste. */
export function PianoBus({ eventoId, tragittoId, onConfermato }: {
  eventoId: string;
  tragittoId: string;
  /** Per ricaricare la pagina dopo: le proposte possono essere cambiate. */
  onConfermato: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [piano, setPiano] = useState<AnteprimaPiano | null>(null);
  const [errore, setErrore] = useState('');
  const [confermando, setConfermando] = useState(false);

  async function apri() {
    setAperto(true);
    setPiano(null);
    setErrore('');
    try {
      setPiano(await eventiApi.anteprimaPiano(tragittoId));
    } catch (e) {
      setErrore(motivoErrore(e));
    }
  }

  async function conferma() {
    setConfermando(true);
    try {
      const esito = await eventiApi.confermaPiano(eventoId);
      notifica(
        esito.richiesteInviate > 0
          ? `Piano confermato: ${plurale(esito.richiesteInviate, 'richiesta di preventivo inviata', 'richieste di preventivo inviate')}.`
          : 'Piano confermato. Nessuna richiesta da mandare: i preventivi erano già partiti o manca un fornitore adatto.',
        'successo',
      );
      setAperto(false);
      onConfermato();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setConfermando(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={apri}>Crea piano</button>

      {aperto && (
        <Modale titolo="Il piano dei bus, se decidessi adesso" onClose={() => setAperto(false)} larga>
          {errore && <p className="avviso avviso-errore" role="alert">Piano non calcolato: {errore}</p>}
          {!errore && !piano && <p className="testo-intro">Calcolo…</p>}

          {piano?.senzaQuotazione && (
            <div className="prossimo-passo avviso" role="alert">
              <div>
                <p className="titolo">Serve prima una quotazione</p>
                <p>
                  Senza un prezzo del bus non si può sapere quante persone lo ripagano, e quindi nemmeno quanti
                  bus servono. Chiedila dalla voce Quotazione di questo tragitto.
                </p>
              </div>
            </div>
          )}

          {piano && !piano.senzaQuotazione && (
            <>
              {piano.voci.length === 0 ? (
                <p className="testo-intro">
                  Nessun bus da confermare: i passeggeri di adesso stanno tutti nei bus già confermati, oppure non
                  sono ancora abbastanza da ripagarne uno nuovo
                  {piano.contatore ? ` (${piano.contatore.contati} su ${piano.contatore.pareggio} per il ${piano.contatore.bus}° bus)` : ''}.
                </p>
              ) : (
                <>
                  <p className="testo-intro">
                    {plurale(piano.voci.length, 'bus da confermare', 'bus da confermare')} su «{piano.tragittoNome}».
                    Il primo parte da dove inizia il tragitto; gli altri partono il più avanti possibile — meno strada,
                    meno costo — purché chi sale lì basti a ripagare il bus e nessuno resti a terra.
                  </p>
                  <div className="table-scroll adattiva">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Bus</th>
                          <th>Parte da</th>
                          <th>Fermate</th>
                          <th style={{ textAlign: 'right' }}>Passeggeri</th>
                          <th style={{ textAlign: 'right' }}>Costo stimato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {piano.voci.map((v, i) => (
                          <tr key={i}>
                            <td>
                              <b>{v.tipo === 'bus' ? `Bus ${i + 1}` : `Linea nuova ${i + 1}`}</b>
                              {v.giaProposta && <><br /><span className="testo-secondario">già proposto</span></>}
                            </td>
                            <td><b>{v.fermate[0] ?? '—'}</b></td>
                            <td>{v.fermate.join(' → ')}</td>
                            <td style={{ textAlign: 'right' }}>{v.passeggeri} / {v.posti}</td>
                            <td style={{ textAlign: 'right' }}>{v.costoStimato === null ? '—' : formattaEuro(v.costoStimato)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="riepilogo-numeri" style={{ marginTop: 14 }}>
                <div className="riepilogo-numero">
                  <span>Spesa stimata</span><b>{piano.costoStimatoTotale === null ? '—' : formattaEuro(piano.costoStimatoTotale)}</b>
                  <small>la quotazione per ogni bus: un bus che parte più avanti costerà meno</small>
                </div>
                <div className={`riepilogo-numero ${piano.senzaPosto > 0 ? 'rosso' : 'verde'}`}>
                  <span>Resterebbero a terra</span><b>{piano.senzaPosto}</b>
                  <small>{piano.senzaPosto === 0 ? 'nessuno' : 'non abbastanza da ripagare un altro bus'}</small>
                </div>
              </div>

              <p className="testo-secondario" style={{ marginTop: 12, lineHeight: 1.5 }}>
                La stima usa il prezzo della quotazione, che è uno solo per tutto il tragitto: il risparmio di un bus
                che parte più avanti si vedrà nel <b>preventivo del fornitore</b>, perché la richiesta porta solo le
                fermate di quel bus.
              </p>
              <p className="testo-secondario" style={{ marginTop: 8, lineHeight: 1.5 }}>
                Confermando, la data di decisione di <b>tutto l'evento</b> viene portata a oggi: le proposte vengono
                ricalcolate e le richieste di preventivo partono subito ai fornitori della zona di ogni bus, più chi
                ha dato la quotazione. I bus già confermati non si toccano. Niente diventa definitivo finché non
                scegli tu un preventivo.
              </p>
            </>
          )}

          <div className="modal-azioni">
            <button type="button" className="btn btn-ghost" onClick={() => setAperto(false)}>Chiudi</button>
            {piano && !piano.senzaQuotazione && (
              <button type="button" className="btn btn-primary" onClick={conferma} disabled={confermando}>
                {confermando ? 'Confermo…' : 'Conferma il piano'}
              </button>
            )}
          </div>
        </Modale>
      )}
    </>
  );
}
