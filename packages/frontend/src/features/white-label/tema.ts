import type { CSSProperties } from 'react';
import type { WhiteLabelTheme } from '../../api/whiteLabel';

/** Come il tema di una White Label diventa stile vero: font, colori,
 *  sfondi, pulsanti, riquadri e campi. Un posto solo, così l'anteprima
 *  del gestionale, la pagina del link e il checkout mostrano davvero la
 *  stessa cosa al cliente finale (proprietario, settembre 2026: il
 *  cliente non deve accorgersi di essere su un'altra piattaforma).
 *  Si prova in tema.test.ts. */

const RIPIEGO_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Il font come lo scrive il CSS; "Di sistema" o vuoto = quello del dispositivo. */
export function famigliaFont(nome: string | null | undefined): string {
  const pulito = (nome ?? '').trim();
  if (!pulito || pulito.toLowerCase() === 'di sistema') return RIPIEGO_FONT;
  return `'${pulito.replace(/'/g, '')}', ${RIPIEGO_FONT}`;
}

export const fontTitoli = (tema: WhiteLabelTheme) => famigliaFont(tema.tipografia.fontTitoli || tema.tipografia.font);

/** I font scelti, da chiedere a Google Fonts (vuoto se sono di sistema). */
export function fontDaCaricare(tema: WhiteLabelTheme): string[] {
  return [tema.tipografia.font, tema.tipografia.fontTitoli]
    .map((f) => (f ?? '').trim())
    .filter((f) => f && f.toLowerCase() !== 'di sistema')
    .filter((f, i, tutti) => tutti.indexOf(f) === i);
}

/** Aggiunge alla pagina i font del tema (una volta sola per font). */
export function caricaFontTema(tema: WhiteLabelTheme): void {
  for (const nome of fontDaCaricare(tema)) {
    const id = `wl-font-${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nome)}:wght@400;600;700;800&display=swap`;
    document.head.appendChild(link);
  }
}

/** Il titolo della scheda del browser e l'icona, quando li ha impostati. */
export function applicaTitoloPagina(tema: WhiteLabelTheme, titoloDiSerie: string): void {
  document.title = tema.branding.titoloPagina?.trim() || titoloDiSerie;
  const favicon = tema.branding.faviconUrl;
  if (!favicon) return;
  let icona = document.querySelector<HTMLLinkElement>('link#wl-favicon');
  if (!icona) {
    icona = document.createElement('link');
    icona.id = 'wl-favicon';
    icona.rel = 'icon';
    document.head.appendChild(icona);
  }
  icona.href = favicon;
}

/** Le variabili CSS del tema: si mettono su un contenitore e valgono per tutto quello che c'è dentro. */
export function variabiliTema(tema: WhiteLabelTheme): CSSProperties {
  const { colori, stile, tipografia } = tema;
  // Forma dei pulsanti come stilePulsante qui sotto, per i pulsanti della
  // prenotazione che vengono dai fogli di stile del sito (checkout.css,
  // blocco "PRENOTAZIONE DENTRO LA WHITE LABEL").
  const contorno = stile.stilePulsanti === 'contorno';
  return {
    '--wl-pulsante-fondo': contorno ? 'transparent' : colori.cta,
    '--wl-pulsante-testo': contorno ? colori.cta : colori.testoCta,
    '--wl-pulsante-bordo': contorno ? colori.cta : 'transparent',
    '--wl-pulsante2-fondo': contorno ? 'transparent' : colori.ctaSecondaria,
    '--wl-pulsante2-testo': colori.testoCtaSecondaria,
    '--wl-pulsante-raggio': stile.stilePulsanti === 'arrotondato' ? '999px' : `${stile.borderRadiusPx}px`,
    // Riquadri rialzati e passaggio del mouse: il testo del tema, appena accennato.
    '--wl-velo': conTrasparenza(colori.testoPrincipale, 6),
    '--wl-sfondo': colori.sfondo,
    '--wl-superficie': colori.superficie,
    '--wl-testo': colori.testoPrincipale,
    '--wl-testo-2': colori.testoSecondario,
    '--wl-bordi': colori.bordi,
    '--wl-cta': colori.cta,
    '--wl-cta-testo': colori.testoCta,
    '--wl-cta-2': colori.ctaSecondaria,
    '--wl-cta-2-testo': colori.testoCtaSecondaria,
    '--wl-accento': colori.accento,
    '--wl-campo-sfondo': colori.campoSfondo,
    '--wl-campo-testo': colori.campoTesto,
    '--wl-raggio': `${stile.borderRadiusPx}px`,
    '--wl-spazio': `${stile.spaziaturaPx}px`,
    '--wl-font': famigliaFont(tipografia.font),
    '--wl-font-titoli': fontTitoli(tema),
    '--wl-testo-px': `${tipografia.dimensioneTestoPx}px`,
    '--wl-titolo-px': `${tipografia.dimensioneTitoloPx}px`,
    fontFamily: famigliaFont(tipografia.font),
    fontSize: tipografia.dimensioneTestoPx,
    color: colori.testoPrincipale,
  } as CSSProperties;
}

/** Un colore #rrggbb con la trasparenza indicata (0-100). */
export function conTrasparenza(colore: string, percentuale: number): string {
  const c = colore.replace('#', '');
  const pieno = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const canale = (da: number) => parseInt(pieno.slice(da, da + 2), 16) || 0;
  const quota = Math.min(100, Math.max(0, percentuale)) / 100;
  return `rgba(${canale(0)}, ${canale(2)}, ${canale(4)}, ${quota})`;
}

/** Lo sfondo della pagina: colore, immagine e velo che la rende leggibile. */
export function sfondoPagina(tema: WhiteLabelTheme): CSSProperties {
  const { sfondoImmagineUrl, sfondoImmagineModo, sfondoVeloPercentuale } = tema.branding;
  if (!sfondoImmagineUrl) return { background: tema.colori.sfondo };
  const velo = conTrasparenza(tema.colori.sfondo, sfondoVeloPercentuale);
  const immagine = `linear-gradient(${velo}, ${velo}), url("${sfondoImmagineUrl}")`;
  if (sfondoImmagineModo === 'affianca') {
    return { backgroundColor: tema.colori.sfondo, backgroundImage: immagine, backgroundRepeat: 'repeat' };
  }
  return {
    backgroundColor: tema.colori.sfondo,
    backgroundImage: immagine,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: sfondoImmagineModo === 'fisso' ? 'fixed' : 'scroll',
  };
}

export function stileRiquadro(tema: WhiteLabelTheme): CSSProperties {
  return {
    background: tema.colori.superficie,
    borderRadius: tema.stile.borderRadiusPx,
    border: tema.stile.mostraBordi ? `1px solid ${tema.colori.bordi}` : 'none',
    boxShadow: tema.stile.ombre ? '0 10px 30px rgba(0,0,0,.18)' : 'none',
    padding: tema.stile.spaziaturaPx,
    color: tema.colori.testoPrincipale,
    fontFamily: famigliaFont(tema.tipografia.font),
    boxSizing: 'border-box',
  };
}

export function stilePulsante(tema: WhiteLabelTheme, tipo: 'principale' | 'secondario' = 'principale'): CSSProperties {
  const { stile, colori, tipografia } = tema;
  const raggio = stile.stilePulsanti === 'arrotondato' ? 999 : stile.borderRadiusPx;
  const comune: CSSProperties = {
    height: stile.altezzaPulsantePx,
    borderRadius: raggio,
    fontFamily: famigliaFont(tipografia.font),
    fontWeight: 700,
    fontSize: tipografia.dimensioneTestoPx,
    width: '100%',
    cursor: 'pointer',
    boxSizing: 'border-box',
  };
  if (tipo === 'secondario') {
    return {
      ...comune,
      background: stile.stilePulsanti === 'contorno' ? 'transparent' : colori.ctaSecondaria,
      color: colori.testoCtaSecondaria,
      border: `1px solid ${colori.bordi}`,
      fontWeight: 600,
    };
  }
  return {
    ...comune,
    background: stile.stilePulsanti === 'contorno' ? 'transparent' : colori.cta,
    color: stile.stilePulsanti === 'contorno' ? colori.cta : colori.testoCta,
    border: stile.stilePulsanti === 'contorno' ? `1.5px solid ${colori.cta}` : 'none',
  };
}

export function stileCampo(tema: WhiteLabelTheme): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: Math.min(tema.stile.borderRadiusPx, 12),
    border: `1px solid ${tema.colori.bordi}`,
    background: tema.colori.campoSfondo,
    color: tema.colori.campoTesto,
    fontFamily: famigliaFont(tema.tipografia.font),
    fontSize: tema.tipografia.dimensioneTestoPx,
  };
}

/** Testi della vetrina: quello scritto nel tema, altrimenti quello di serie. */
export const testoPulsante = (tema: WhiteLabelTheme) => tema.testi.pulsante?.trim() || 'Prenota ora';
export const titoloVetrina = (tema: WhiteLabelTheme, diSerie: string) => tema.testi.titolo?.trim() || diSerie;
export const sottotitoloVetrina = (tema: WhiteLabelTheme) => tema.testi.sottotitolo?.trim() || '';

/** La riga in fondo: la nota scritta nel tema e, solo se il marchio è
 *  acceso, "Viaggio organizzato da OnWay". */
export function piePagina(tema: WhiteLabelTheme): string {
  const nota = tema.testi.piePagina?.trim();
  if (!tema.marchio.mostraOnWay) return nota ?? '';
  return nota ? `${nota} · Viaggio organizzato da OnWay` : 'Viaggio organizzato da OnWay';
}
