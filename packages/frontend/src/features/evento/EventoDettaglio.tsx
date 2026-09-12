import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Evento, OpzionePartenza, Tragitto } from '../../api/types';
import { eventiApi } from '../../api/eventi';
import { applicaScontoOfferta, prezzoMinimoEvento } from '../../api/prezzi';
import { CheckoutForm, type OffertaCheckout } from '../checkout/CheckoutForm';
import { EtichettaPosti } from '../checkout/SceltaFermata';
import { PulsanteCondividi } from '../PulsanteCondividi';
import { EventiCorrelati } from '../EventiCorrelati';
import { Icona } from '../Icone';
import { useMobile } from '../useMobile';
import { formattaEuro } from '../../shared/formato';

/** Sotto questa soglia "N persone hanno già prenotato" non si mostra:
 *  "2 persone" sembra scarso invece che rassicurante. */
const SOGLIA_PROVA_SOCIALE = 10;

type StatoEvento = 'esaurito' | 'pochi' | 'nuovi' | 'chiuso';
const ETICHETTA_STATO: Record<StatoEvento, string> = { esaurito: 'Esaurito', pochi: 'Pochi posti', nuovi: 'Nuovi posti', chiuso: 'Prenotazioni chiuse' };

/** Tragitti attivi, liberi e dei servizi, senza doppioni. */
function tragittiAttivi(evento: Evento): Tragitto[] {
  const mappa = new Map<string, Tragitto>();
  for (const t of [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)]) if (t.attivo) mappa.set(t.id, t);
  return [...mappa.values()];
}

/** "sabato 17 ottobre 2026", nel fuso di Roma. */
function formattaDataLunga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "39 €" quando è tondo, "39,50 €" altrimenti. */
function prezzoBreve(n: number): string {
  return formattaEuro(n, { senzaDecimali: Number.isInteger(n) });
}

interface RigaPartenza {
  fermataId: string; tragittoId: string; citta: string; indirizzo: string | null;
  orario: string | null; orarioRitorno: string | null;
  /** Prezzo della fermata più l'extra del tragitto (come api/prezzi.ts); null se non ancora prezzata. */
  prezzo: number | null;
}

function righeDelTragitto(t: Tragitto): RigaPartenza[] {
  const extra = Number(t.prezzoExtra ?? 0);
  return t.fermate.filter((f) => f.attivo).map((f) => ({
    fermataId: f.id, tragittoId: t.id, citta: f.citta, indirizzo: f.indirizzo, orario: f.orario, orarioRitorno: f.orarioRitorno,
    prezzo: f.prezzo ? Number(f.prezzo) + extra : null,
  }));
}

/** In ordine di città, come le card nel modulo (SceltaFermata): chi
 *  cerca la propria città la trova nello stesso posto nei due elenchi. */
function perCitta(righe: RigaPartenza[]): RigaPartenza[] {
  return [...righe].sort((a, b) => a.citta.localeCompare(b.citta, 'it'));
}

/** Scheletro mostrato mentre l'evento arriva: copertina grigia e righe. */
export function EventoScheletro() {
  return (
    <div className="evento-griglia evento-scheletro" aria-busy="true" aria-label="Carico l'evento…">
      <div className="evento-principale">
        <div className="scheletro-cover" />
        <span className="scheletro-riga titolo" />
        <span className="scheletro-riga media" />
        <span className="scheletro-riga media" />
        <span className="scheletro-riga corta" />
        <span className="scheletro-riga lunga" />
        <span className="scheletro-riga lunga" />
      </div>
      <aside className="evento-lato"><div className="scheletro-pannello" /></aside>
    </div>
  );
}

/**
 * Il corpo della pagina evento, condiviso con la pagina offerta (che
 * passa `offerta`): a sinistra copertina, titolo, informazioni, partenze,
 * informazioni pratiche, descrizione, galleria e correlati; a destra
 * (solo da 901px) il pannello con il modulo di prenotazione. Sui
 * telefoni il modulo NON sta nella pagina: la barra fissa in fondo apre
 * un foglio a schermo intero con lo stesso modulo (una sola istanza,
 * decisa da useMobile). "Scegli" su una partenza preseleziona la fermata
 * nel modulo e, sui telefoni, apre il foglio.
 */
export function EventoDettaglio({ evento, offerta }: { evento: Evento; offerta?: OffertaCheckout }) {
  const mobile = useMobile();
  const idFoglio = useId();
  const [foglioAperto, setFoglioAperto] = useState(false);
  const [fermataPreselezionata, setFermataPreselezionata] = useState<string | undefined>(undefined);
  const chiudiFoglioRef = useRef<HTMLButtonElement>(null);
  const foglioRef = useRef<HTMLDivElement>(null);
  const barraPrenotaRef = useRef<HTMLButtonElement>(null);
  /** Chi ha aperto il foglio (una riga "Scegli"): ci torna il focus alla chiusura. */
  const apertoDaRef = useRef<HTMLElement | null>(null);

  // Disponibilità per fermata (dal server, con i limiti per fermata):
  // caricata una volta, solo se l'evento non ha più servizi — in quel
  // caso le opzioni dipendono dal servizio scelto nel modulo.
  const multiServizio = evento.servizi.length >= 2;
  const [opzioni, setOpzioni] = useState<OpzionePartenza[] | null>(null);
  useEffect(() => {
    if (multiServizio) return;
    eventiApi.opzioniPartenza(evento.id, evento.servizi[0]?.id).then(setOpzioni).catch(() => {});
  }, [evento.id, multiServizio]);

  // Prova sociale: quante persone hanno già confermato.
  const [prenotazioniConfermate, setPrenotazioniConfermate] = useState<number | null>(null);
  useEffect(() => {
    eventiApi.conteggioPrenotazioni(evento.id).then((r) => setPrenotazioniConfermate(r.conteggio)).catch(() => {});
  }, [evento.id]);

  // Foglio mobile: blocca lo scorrimento della pagina, Esc chiude, il
  // focus va sul pulsante "Chiudi" e Tab resta dentro il foglio. Alla
  // chiusura il focus torna a chi l'ha aperto (riga "Scegli") o al
  // pulsante della barra, che si rimonta proprio alla chiusura. Se la
  // finestra si allarga, si chiude.
  useEffect(() => {
    if (!foglioAperto) return;
    const attivo = document.activeElement;
    apertoDaRef.current = attivo instanceof HTMLElement && attivo !== document.body ? attivo : null;
    const precedente = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const allaPressione = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFoglioAperto(false); return; }
      const foglio = foglioRef.current;
      if (e.key !== 'Tab' || !foglio) return;
      const focusabili = [...foglio.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.getClientRects().length > 0);
      if (focusabili.length === 0) return;
      const primo = focusabili[0];
      const ultimo = focusabili[focusabili.length - 1];
      const dentro = foglio.contains(document.activeElement);
      if (e.shiftKey && (!dentro || document.activeElement === primo)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) { e.preventDefault(); primo.focus(); }
    };
    window.addEventListener('keydown', allaPressione);
    chiudiFoglioRef.current?.focus();
    return () => {
      document.body.style.overflow = precedente;
      window.removeEventListener('keydown', allaPressione);
      const daChi = apertoDaRef.current;
      if (daChi?.isConnected) daChi.focus();
      else barraPrenotaRef.current?.focus();
    };
  }, [foglioAperto]);
  useEffect(() => { if (!mobile) setFoglioAperto(false); }, [mobile]);

  // Descrizione: troncata a 8 righe con "Leggi tutto" solo se serve
  // davvero (misurata, non a occhio sul numero di caratteri).
  const descrizioneRef = useRef<HTMLParagraphElement>(null);
  const [descrizioneLunga, setDescrizioneLunga] = useState(false);
  const [descrizioneEspansa, setDescrizioneEspansa] = useState(false);
  useEffect(() => {
    const el = descrizioneRef.current;
    if (!el || descrizioneEspansa) return;
    const misura = () => setDescrizioneLunga(el.scrollHeight > el.clientHeight + 1);
    misura();
    window.addEventListener('resize', misura);
    return () => window.removeEventListener('resize', misura);
  }, [evento.descrizione, descrizioneEspansa]);

  // Galleria: la foto grande in un <dialog>. Esc chiude: il dialog lo
  // fa da solo (evento close), ma un ascoltatore esplicito non guasta
  // dove la chiusura nativa non scatta.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fotoAperta, setFotoAperta] = useState<{ url: string; alt: string } | null>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (fotoAperta && !d.open) d.showModal();
    if (!fotoAperta && d.open) d.close();
    if (!fotoAperta) return;
    const allaPressione = (e: KeyboardEvent) => { if (e.key === 'Escape') setFotoAperta(null); };
    window.addEventListener('keydown', allaPressione);
    return () => window.removeEventListener('keydown', allaPressione);
  }, [fotoAperta]);

  function scegliPartenza(fermataId: string) {
    setFermataPreselezionata(fermataId);
    if (mobile) setFoglioAperto(true);
  }

  // ---------- Dati derivati ----------
  const attivi = tragittiAttivi(evento);
  const copertina = evento.immagini[0]?.url;
  const galleria = evento.immagini.slice(1);
  const arrivo = attivi.find((t) => t.arrivoOrario) ?? null;
  const puntoArrivo = attivi.find((t) => t.arrivoIndirizzo) ?? null;
  const prezzoMinimo = prezzoMinimoEvento(evento);
  const prezzoMinimoMostrato = prezzoMinimo !== null && offerta ? applicaScontoOfferta(prezzoMinimo, offerta.scontoPercentuale) : prezzoMinimo;
  const postiAttivi = attivi.reduce((s, t) => s + t.postiDisponibili, 0);
  const stato: StatoEvento | null = evento.venditeFermate ? 'chiuso'
    : evento.statoDisponibilita === 'ESAURITO' ? 'esaurito'
    : evento.statoDisponibilita === 'POCHI_POSTI' ? 'pochi'
    : evento.statoDisponibilita === 'NUOVI_POSTI' ? 'nuovi'
    : postiAttivi === 0 || (opzioni !== null && opzioni.length > 0 && opzioni.every((o) => o.postiDisponibili === 0)) ? 'esaurito'
    : null;
  const prenotabile = !evento.venditeFermate;
  const etichettaPrenota = stato === 'esaurito' ? "Lista d'attesa" : 'Prenota';

  // Partenze: una riga per fermata attiva di ogni tragitto attivo; con più
  // servizi, raggruppate con un titoletto per servizio.
  const gruppiPartenze: { titolo: string | null; righe: RigaPartenza[] }[] = [];
  if (multiServizio) {
    const liberi = evento.tragitti.filter((t) => t.attivo && !t.servizioId).flatMap(righeDelTragitto);
    if (liberi.length) gruppiPartenze.push({ titolo: null, righe: perCitta(liberi) });
    for (const s of evento.servizi) {
      const righe = s.tragitti.filter((t) => t.attivo).flatMap(righeDelTragitto);
      if (righe.length) gruppiPartenze.push({ titolo: s.nome, righe: perCitta(righe) });
    }
  } else {
    gruppiPartenze.push({ titolo: null, righe: perCitta(attivi.flatMap(righeDelTragitto)) });
  }
  const mappaOpzioni = new Map((opzioni ?? []).map((o) => [o.fermataId, o]));
  const cePartenze = gruppiPartenze.some((g) => g.righe.length > 0);
  const ceInfoPratiche = !!(puntoArrivo || evento.cosaIncluso || evento.requisitiNote);

  const modulo = <CheckoutForm evento={evento} offerta={offerta} fermataPreselezionata={fermataPreselezionata} onChiudi={mobile ? () => setFoglioAperto(false) : undefined} />;

  return (
    <div className="evento-griglia">
      <div className="evento-principale">
        {/* ---------- Copertina ---------- */}
        <div className="evento-cover">
          {copertina ? (
            <img src={copertina} alt={`${evento.artista} — ${evento.luogo}, ${evento.citta}`} width={1200} height={800} decoding="async" {...{ fetchpriority: 'high' }} />
          ) : (
            <div className="evento-cover-segnaposto" aria-hidden="true">{evento.artista}</div>
          )}
          <span className="evento-cover-genere">{evento.genere}</span>
          <div className="evento-cover-condividi">
            <PulsanteCondividi soloIcona titolo={`${evento.artista} — OnWay`} testo={`Vieni con noi in bus a vedere ${evento.artista}, ${evento.luogo} (${evento.citta})`} />
          </div>
        </div>

        {/* ---------- Titolo, informazioni, stato, prezzo ----------
            Un <div>, non <header>: header.css stila il tag nudo (barra
            appiccicosa del sito) e lo trascinerebbe qui. */}
        <div className="evento-testata">
          <h1>{evento.artista}</h1>
          <ul className="evento-meta">
            <li><Icona nome="calendario" /><span>{formattaDataLunga(evento.data)}</span></li>
            <li><Icona nome="pin" /><span>{evento.luogo}, {evento.citta}</span></li>
            {arrivo?.arrivoOrario && <li><Icona nome="orologio" /><span>Arrivo previsto alle {arrivo.arrivoOrario}</span></li>}
          </ul>
          {stato && <div className="evento-stato"><span className={`badge-stato ${stato}`}>{ETICHETTA_STATO[stato]}</span></div>}
          {offerta && <p className="banner-offerta">Offerta {offerta.nome}: −{offerta.scontoPercentuale.toFixed(0)}% su tutte le fermate</p>}
          {prezzoMinimoMostrato !== null && (
            <p className="evento-prezzo">
              <b>da {prezzoBreve(prezzoMinimoMostrato)}</b>
              <span>a persona</span>
              {offerta && prezzoMinimo !== null && <span>prezzo pieno {prezzoBreve(prezzoMinimo)}</span>}
            </p>
          )}
          {prenotazioniConfermate !== null && prenotazioniConfermate >= SOGLIA_PROVA_SOCIALE && (
            <p className="evento-prova-sociale">{prenotazioniConfermate} persone hanno già prenotato</p>
          )}
        </div>

        {/* ---------- Partenze ---------- */}
        {cePartenze && (
          <section className="evento-sezione" id="partenze" aria-labelledby="partenze-titolo">
            <div className="evento-sezione-testata">
              <h2 id="partenze-titolo">Partenze</h2>
              <p className="evento-sezione-sub">Andata e ritorno in giornata, scegli la fermata più comoda</p>
            </div>
            {gruppiPartenze.map((g, gi) => (
              <div key={g.titolo ?? gi}>
                {g.titolo && <h3 className="partenze-gruppo">{g.titolo}</h3>}
                <ul className="partenze-elenco">
                  {g.righe.map((r) => {
                    const opz = mappaOpzioni.get(r.fermataId);
                    const prezzoBase = opz?.prezzoEffettivo ?? r.prezzo;
                    const prezzoMostrato = prezzoBase !== null && offerta ? applicaScontoOfferta(prezzoBase, offerta.scontoPercentuale) : prezzoBase;
                    // Finché la disponibilità non è arrivata (o con più
                    // servizi, dove non si carica) la riga resta cliccabile.
                    const rigaPrenotabile = prenotabile && (opzioni === null || !!opz);
                    return (
                      <li key={r.fermataId}>
                        <button type="button" className="partenza-riga" disabled={!rigaPrenotabile} onClick={() => scegliPartenza(r.fermataId)}>
                          <span className="partenza-info">
                            <span className="partenza-citta">{r.citta}</span>
                            {r.indirizzo && <span className="partenza-indirizzo">{r.indirizzo}</span>}
                          </span>
                          <span className="partenza-orari">
                            <Icona nome="orologio" dimensione={14} />
                            <span>{r.orario ? `Andata ${r.orario}` : 'Orario da definire'}{r.orarioRitorno ? ` · Ritorno ${r.orarioRitorno}` : ''}</span>
                          </span>
                          <span className="partenza-prezzo">
                            {prezzoMostrato !== null ? <b>{prezzoBreve(prezzoMostrato)}</b> : <small>Prezzo da definire</small>}
                            {offerta && prezzoBase !== null && <small>invece di {prezzoBreve(prezzoBase)}</small>}
                            {opz
                              ? <EtichettaPosti posti={opz.postiDisponibili} />
                              : (opzioni !== null && prenotabile) ? <small>Non ancora prenotabile</small> : null}
                          </span>
                          {rigaPrenotabile && <span className="partenza-cta">Scegli<Icona nome="freccia" dimensione={14} /></span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* ---------- Informazioni pratiche ---------- */}
        {ceInfoPratiche ? (
          <section className="pannello evento-info" aria-labelledby="info-pratiche-titolo">
            <h2 id="info-pratiche-titolo">Informazioni pratiche</h2>
            {puntoArrivo && (
              <p className="pannello-riga">
                <Icona nome="pin" />
                <span className="testo"><b>Punto di arrivo</b>{puntoArrivo.arrivoIndirizzo}{puntoArrivo.arrivoOrario ? ` · ore ${puntoArrivo.arrivoOrario}` : ''}</span>
              </p>
            )}
            {evento.cosaIncluso && (
              <p className="pannello-riga">
                <Icona nome="spunta" />
                <span className="testo"><b>Cosa include</b>{evento.cosaIncluso}</span>
              </p>
            )}
            {evento.requisitiNote && (
              <p className="pannello-riga">
                <Icona nome="info" />
                <span className="testo"><b>Da sapere</b>{evento.requisitiNote}</span>
              </p>
            )}
            <p className="pannello-riga">
              <Icona nome="documento" />
              <span className="testo"><Link to="/pagina/termini">Politica di cancellazione e termini</Link></span>
            </p>
          </section>
        ) : (
          <p className="evento-termini">
            <Icona nome="documento" dimensione={16} />
            <Link to="/pagina/termini">Politica di cancellazione e termini</Link>
          </p>
        )}

        {/* ---------- Descrizione ---------- */}
        {evento.descrizione?.trim() && (
          <section className="evento-sezione evento-descrizione" aria-labelledby="descrizione-titolo">
            <div className="evento-sezione-testata"><h2 id="descrizione-titolo">Descrizione</h2></div>
            <p ref={descrizioneRef} className={descrizioneEspansa ? undefined : 'tronca'}>{evento.descrizione}</p>
            {(descrizioneLunga || descrizioneEspansa) && (
              <button type="button" className="btn btn-tertiary" aria-expanded={descrizioneEspansa} onClick={() => setDescrizioneEspansa((v) => !v)}>
                {descrizioneEspansa ? 'Mostra meno' : 'Leggi tutto'}
              </button>
            )}
          </section>
        )}

        {/* ---------- Galleria ---------- */}
        {galleria.length > 0 && (
          <section className="evento-sezione" aria-labelledby="galleria-titolo">
            <div className="evento-sezione-testata"><h2 id="galleria-titolo">Foto</h2></div>
            <div className="evento-galleria">
              {galleria.map((img, i) => {
                const alt = `${evento.artista} — foto ${i + 2}`;
                return (
                  <button key={img.id} type="button" onClick={() => setFotoAperta({ url: img.url, alt })} aria-label={`Apri la foto ${i + 2} di ${evento.immagini.length}`}>
                    <img src={img.url} alt={alt} width={360} height={240} loading="lazy" decoding="async" />
                  </button>
                );
              })}
            </div>
            <dialog ref={dialogRef} className="galleria-dialog" onClose={() => setFotoAperta(null)} onClick={(e) => { if (e.target === e.currentTarget) setFotoAperta(null); }}>
              {fotoAperta && (
                <div className="galleria-dialog-corpo">
                  <img src={fotoAperta.url} alt={fotoAperta.alt} />
                  <button type="button" className="btn btn-secondary" onClick={() => setFotoAperta(null)}>Chiudi</button>
                </div>
              )}
            </dialog>
          </section>
        )}

        <EventiCorrelati evento={evento} />
      </div>

      {/* ---------- Pannello di prenotazione (desktop) ---------- */}
      {!mobile && (
        <aside className="evento-lato" aria-label="Prenotazione">
          <div className="prenota-pannello superficie-chiara">
            <h2 className="prenota-titolo">Prenota il tuo posto</h2>
            {modulo}
          </div>
        </aside>
      )}

      {/* ---------- Barra fissa e foglio (telefoni) ---------- */}
      {mobile && prenotabile && !foglioAperto && (
        <div className="barra-prenota">
          <p className="barra-prenota-prezzo">
            {prezzoMinimoMostrato !== null ? <><b>da {prezzoBreve(prezzoMinimoMostrato)}</b><span>a persona</span></> : <span>Vedi le partenze</span>}
          </p>
          <button ref={barraPrenotaRef} type="button" className="btn btn-primary" onClick={() => setFoglioAperto(true)}>{etichettaPrenota}</button>
        </div>
      )}
      {mobile && foglioAperto && (
        <div ref={foglioRef} className="foglio-prenota superficie-chiara" role="dialog" aria-modal="true" aria-labelledby={idFoglio}>
          <div className="foglio-prenota-testata">
            <h2 id={idFoglio}>{etichettaPrenota}</h2>
            <button ref={chiudiFoglioRef} type="button" className="btn-icona" aria-label="Chiudi" onClick={() => setFoglioAperto(false)}><Icona nome="chiudi" /></button>
          </div>
          <div className="foglio-prenota-corpo">
            {modulo}
          </div>
        </div>
      )}
    </div>
  );
}
