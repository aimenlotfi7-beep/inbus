import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Evento, Tragitto } from '../../api/types';
import { intervalloPrezzoEvento } from '../../api/prezzi';
import { formattaEuro } from '../../shared/formato';
import { Icona } from '../Icone';

/** Un solo componente per le card del sito: evento, tour (card
 *  virtuale con `tour: true`) e bundle (BundleCard.tsx, che monta lo
 *  stesso CardBase). Tre formati, decisi solo dalla classe CSS:
 *  griglia (verticale, predefinito), lista (media 96×120 + testo) e
 *  adattiva (lista sotto i 640px, griglia sopra — card.css). */
export type FormatoCard = 'griglia' | 'lista' | 'adattiva';
export type StatoCard = 'esaurito' | 'pochi' | 'nuovi';

const ETICHETTA_STATO: Record<StatoCard, string> = { esaurito: 'Esaurito', pochi: 'Pochi posti', nuovi: 'Nuovi posti' };

/** "sab 17 ott 2026" — nel fuso di Roma, qualunque sia quello del
 *  browser (le date degli eventi sono salvate a mezzanotte). */
export function formattaDataCard(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Iniziali per il segnaposto senza immagine: "Coez & Frah Quintale" → "CF". */
export function inizialiDi(nome: string): string {
  const parole = nome.split(/\s+/).map((p) => p.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  return parole.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export interface CardBaseProps {
  href: string;
  formato?: FormatoCard;
  /** Card sopra la piega (vetrina dell'hero): immagine caricata subito
   *  e con priorità alta, invece che pigra. */
  priorita?: boolean;
  immagine: string | null | undefined;
  alt: string;
  /** Mostrate nel segnaposto quando manca l'immagine. */
  iniziali: string;
  /** Riga mono maiuscola sopra il titolo: genere, "Tour · 3 date", "Bundle". */
  kicker: string;
  titolo: string;
  data?: string | null;
  /** Nome del luogo: nel formato lista si nasconde (resta "data · città"). */
  luogo?: string | null;
  citta?: string | null;
  partenze?: string | null;
  /** Righe in più (bundle): usare <span className="card-riga">. */
  righe?: ReactNode;
  prezzo?: { min: number; max: number } | null;
  /** Testo al posto del prezzo quando non c'è (es. "Non disponibile"). */
  nota?: string | null;
  cta: string;
  stato?: StatoCard | null;
}

export function CardBase({ href, formato = 'griglia', priorita = false, immagine, alt, iniziali, kicker, titolo, data, luogo, citta, partenze, righe, prezzo, nota, cta, stato }: CardBaseProps) {
  const classi = ['card', `card-${formato}`, stato === 'esaurito' ? 'esaurita' : ''].filter(Boolean).join(' ');
  return (
    <Link to={href} className={classi}>
      <div className="card-media">
        {immagine ? (
          <img
            src={immagine}
            alt={alt}
            width={480}
            height={600}
            loading={priorita ? 'eager' : 'lazy'}
            decoding="async"
            // React 18 non conosce `fetchPriority`: l'attributo HTML in
            // minuscolo passa così com'è, senza avvisi in console.
            {...(priorita ? { fetchpriority: 'high' } : {})}
          />
        ) : (
          <div className="card-segnaposto" aria-hidden="true">{iniziali}</div>
        )}
        {stato && <span className={`badge-stato ${stato}`}>{ETICHETTA_STATO[stato]}</span>}
      </div>
      <div className="card-corpo">
        <p className="card-kicker">{kicker}</p>
        <h3 className="card-titolo" title={titolo}>{titolo}</h3>
        {(data || luogo || citta || partenze || righe) && (
          <div className="card-righe">
            {data && (
              <span className="card-riga card-data">
                <Icona nome="calendario" dimensione={16} />
                <span>{data}</span>
              </span>
            )}
            {(luogo || citta) && (
              <span className="card-riga card-luogo">
                <Icona nome="pin" dimensione={16} />
                <span>
                  {luogo && <span className="card-luogo-nome">{luogo}{citta ? ' · ' : ''}</span>}
                  {citta}
                </span>
              </span>
            )}
            {partenze && (
              <span className="card-riga card-partenze">
                <Icona nome="bus" dimensione={16} />
                <span>{partenze}</span>
              </span>
            )}
            {righe}
          </div>
        )}
        <div className="card-piede">
          {prezzo ? (
            <span className="card-prezzo">
              <b>da {formattaEuro(prezzo.min, { senzaDecimali: true })}</b>
              {prezzo.max > prezzo.min && <small>fino a {formattaEuro(prezzo.max, { senzaDecimali: true })}</small>}
            </span>
          ) : nota ? (
            <span className="card-prezzo"><small>{nota}</small></span>
          ) : null}
          <span className="card-cta">{cta}<Icona nome="freccia" dimensione={14} /></span>
        </div>
      </div>
    </Link>
  );
}

/** Segnaposto animato mentre gli eventi arrivano (6 in home). */
export function CardScheletro() {
  return (
    <div className="card-scheletro" aria-hidden="true">
      <div className="card-scheletro-media" />
      <div className="card-scheletro-corpo">
        <span className="card-scheletro-riga" />
        <span className="card-scheletro-riga" />
        <span className="card-scheletro-riga" />
        <span className="card-scheletro-riga" />
      </div>
    </div>
  );
}

function tragittiAttivi(evento: Evento): Tragitto[] {
  return [...evento.tragitti, ...evento.servizi.flatMap((s) => s.tragitti)].filter((t) => t.attivo);
}

/** Le città di partenza vere, dalle fermate reali: solo tragitti e
 *  fermate attivi (una fermata disattivata non è una partenza), in
 *  ordine di elenco, senza doppioni. */
function cittaPartenzaAttive(evento: Evento): string[] {
  const viste = new Set<string>();
  const citta: string[] = [];
  for (const t of tragittiAttivi(evento)) {
    for (const f of t.fermate) {
      if (!f.attivo || viste.has(f.citta)) continue;
      viste.add(f.citta);
      citta.push(f.citta);
    }
  }
  return citta;
}

/** "Parte da Bologna", "Parte da Bologna e Modena", "Parte da Bologna,
 *  Modena e altre 2" (con una sola in più: "e un'altra"). */
export function testoPartenze(citta: string[]): string | null {
  if (citta.length === 0) return null;
  if (citta.length === 1) return `Parte da ${citta[0]}`;
  if (citta.length === 2) return `Parte da ${citta[0]} e ${citta[1]}`;
  const altre = citta.length - 2;
  return `Parte da ${citta[0]}, ${citta[1]} e ${altre === 1 ? "un'altra" : `altre ${altre}`}`;
}

/** L'etichetta scelta a mano dal gestionale ha sempre la priorità; senza
 *  etichetta, "Esaurito" solo se i posti veri sono davvero zero. Il
 *  numero esatto di posti non si mostra mai. */
function statoCard(evento: Evento, posti: number): StatoCard | null {
  switch (evento.statoDisponibilita) {
    case 'ESAURITO': return 'esaurito';
    case 'POCHI_POSTI': return 'pochi';
    case 'NUOVI_POSTI': return 'nuovi';
    default: return posti === 0 ? 'esaurito' : null;
  }
}

// La card porta sempre alla pagina dedicata dell'evento (/eventi/:slug):
// ogni evento ha un suo indirizzo indicizzabile e condivisibile. La card
// virtuale di un Tour porta invece a /tour/:slug.
export function EventoCard({ evento, formato, priorita }: { evento: Evento; formato?: FormatoCard; priorita?: boolean }) {
  const immagine = evento.immagini[0]?.url ?? null;
  const prezzo = intervalloPrezzoEvento(evento);
  const iniziali = inizialiDi(evento.artista);

  if (evento.tour) {
    // Card virtuale di un Tour: tragitti e servizi sono vuoti apposta (la
    // vendibilità vive nelle singole date), `luogo` contiene "3 date" e
    // `data` è la prima data.
    return (
      <CardBase
        href={`/tour/${evento.slug}`}
        formato={formato}
        priorita={priorita}
        immagine={immagine}
        alt={`${evento.artista} — ${evento.luogo}`}
        iniziali={iniziali}
        kicker={`Tour · ${evento.luogo}`}
        titolo={evento.artista}
        data={`dal ${formattaDataCard(evento.data)}`}
        prezzo={prezzo}
        cta="Vedi le date"
      />
    );
  }

  const posti = tragittiAttivi(evento).reduce((somma, t) => somma + t.postiDisponibili, 0);
  const stato = statoCard(evento, posti);
  return (
    <CardBase
      href={`/eventi/${evento.slug}`}
      formato={formato}
      priorita={priorita}
      immagine={immagine}
      alt={`${evento.artista} — ${evento.luogo}, ${evento.citta}`}
      iniziali={iniziali}
      kicker={evento.genere}
      titolo={evento.artista}
      data={formattaDataCard(evento.data)}
      luogo={evento.luogo}
      citta={evento.citta}
      partenze={testoPartenze(cittaPartenzaAttive(evento))}
      prezzo={prezzo}
      cta={stato === 'esaurito' ? "Lista d'attesa" : 'Prenota'}
      stato={stato}
    />
  );
}
