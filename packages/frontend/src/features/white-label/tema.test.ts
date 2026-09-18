import { describe, expect, it } from 'vitest';
import type { WhiteLabelTheme } from '../../api/whiteLabel';
import { conTrasparenza, famigliaFont, fontDaCaricare, piePagina, sfondoPagina, stilePulsante, testoPrezzoDa, testoPulsante, titoloElenco, titoloVetrina } from './tema';

// Il tema di una White Label diventa stile vero: font, sfondo, pulsanti e
// marchio (proprietario, settembre 2026: con alcuni clienti OnWay non si
// deve vedere da nessuna parte).

const tema: WhiteLabelTheme = {
  branding: {
    logoUrl: null, logoMobileUrl: null, immaginePrincipaleUrl: null, heroImageUrl: null,
    posizioneLogo: 'in-alto-a-sinistra', dimensioneLogoPx: 32,
    sfondoImmagineUrl: null, sfondoImmagineModo: 'copri', sfondoVeloPercentuale: 40,
    faviconUrl: null, titoloPagina: null,
  },
  colori: {
    sfondo: '#101010', superficie: '#202020', testoPrincipale: '#ffffff', testoSecondario: '#aaaaaa', bordi: '#303030',
    cta: '#ff0000', testoCta: '#ffffff', ctaSecondaria: '#202020', testoCtaSecondaria: '#ffffff', accento: '#00ff00',
    campoSfondo: '#101010', campoTesto: '#ffffff',
  },
  tipografia: { font: 'Poppins', fontTitoli: null, dimensioneTitoloPx: 22, dimensioneTestoPx: 14 },
  stile: { borderRadiusPx: 10, stilePulsanti: 'pieno', altezzaPulsantePx: 46, spaziaturaPx: 16, ombre: false, mostraBordi: true, larghezzaPx: 420 },
  layout: { tipo: 'card' },
  testi: { titolo: null, sottotitolo: null, pulsante: null, piePagina: null, titoloElenco: null },
  marchio: { mostraOnWay: true },
  elementiVisibili: {
    logo: true, immagine: true, titolo: true, data: true, percorso: true, fermate: true,
    prezzo: true, disponibilita: true, descrizione: true, cta: true, informazioni: true,
  },
};

describe('font', () => {
  it('«Di sistema» e vuoto usano il font del dispositivo', () => {
    expect(famigliaFont('Di sistema')).toBe(famigliaFont(''));
    expect(famigliaFont('')).toMatch(/^system-ui/);
    expect(famigliaFont('Poppins')).toMatch(/^'Poppins',/);
  });

  it('si caricano solo i font veri, senza ripetizioni', () => {
    expect(fontDaCaricare(tema)).toEqual(['Poppins']);
    expect(fontDaCaricare({ ...tema, tipografia: { ...tema.tipografia, fontTitoli: 'Poppins' } })).toEqual(['Poppins']);
    expect(fontDaCaricare({ ...tema, tipografia: { ...tema.tipografia, font: 'Di sistema', fontTitoli: 'Inter' } })).toEqual(['Inter']);
  });
});

describe('sfondo della pagina', () => {
  it('senza immagine è solo il colore', () => {
    expect(sfondoPagina(tema)).toEqual({ background: '#101010' });
  });

  it('con immagine mette il velo del colore sopra', () => {
    const conImmagine = { ...tema, branding: { ...tema.branding, sfondoImmagineUrl: 'https://esempio.it/sfondo.jpg' } };
    const stile = sfondoPagina(conImmagine);
    expect(stile.backgroundImage).toContain('https://esempio.it/sfondo.jpg');
    expect(stile.backgroundImage).toContain('rgba(16, 16, 16, 0.4)');
    expect(stile.backgroundSize).toBe('cover');
  });

  it('a piastrelle si ripete', () => {
    const stile = sfondoPagina({ ...tema, branding: { ...tema.branding, sfondoImmagineUrl: 'https://esempio.it/s.png', sfondoImmagineModo: 'affianca' } });
    expect(stile.backgroundRepeat).toBe('repeat');
  });

  it('conTrasparenza tiene i limiti', () => {
    expect(conTrasparenza('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)');
    expect(conTrasparenza('#fff', 200)).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('pulsanti', () => {
  it('principale pieno, secondario con i suoi colori', () => {
    expect(stilePulsante(tema)).toMatchObject({ background: '#ff0000', color: '#ffffff', borderRadius: 10 });
    expect(stilePulsante(tema, 'secondario')).toMatchObject({ background: '#202020', color: '#ffffff' });
  });

  it('a pillola e solo contorno', () => {
    expect(stilePulsante({ ...tema, stile: { ...tema.stile, stilePulsanti: 'arrotondato' } }).borderRadius).toBe(999);
    expect(stilePulsante({ ...tema, stile: { ...tema.stile, stilePulsanti: 'contorno' } })).toMatchObject({ background: 'transparent', color: '#ff0000' });
  });
});

describe('testi e marchio', () => {
  it('di serie i testi di OnWay, altrimenti quelli scritti nel tema', () => {
    expect(testoPulsante(tema)).toBe('Prenota ora');
    expect(titoloVetrina(tema, 'Concerto')).toBe('Concerto');
    const personalizzato = { ...tema, testi: { ...tema.testi, pulsante: 'Acquista il posto', titolo: 'Il nostro viaggio' } };
    expect(testoPulsante(personalizzato)).toBe('Acquista il posto');
    expect(titoloVetrina(personalizzato, 'Concerto')).toBe('Il nostro viaggio');
  });

  it('card: titolo di serie o scritto nel tema; il prezzo è quello vero, o niente', () => {
    expect(titoloElenco(tema)).toBe('Scegli il tuo viaggio');
    expect(titoloElenco({ ...tema, testi: { ...tema.testi, titoloElenco: 'I nostri viaggi' } })).toBe('I nostri viaggi');
    expect(testoPrezzoDa(39)).toMatch(/^da 39,00\s€$/);
    expect(testoPrezzoDa(null)).toBeNull();
  });

  it('col marchio spento nessun riferimento a OnWay', () => {
    expect(piePagina(tema)).toBe('Viaggio organizzato da OnWay');
    expect(piePagina({ ...tema, testi: { ...tema.testi, piePagina: 'Organizzato da Viaggi Rossi' } })).toContain('OnWay');
    const senzaMarchio = { ...tema, marchio: { mostraOnWay: false } };
    expect(piePagina(senzaMarchio)).toBe('');
    expect(piePagina({ ...senzaMarchio, testi: { ...tema.testi, piePagina: 'Organizzato da Viaggi Rossi' } })).toBe('Organizzato da Viaggi Rossi');
  });
});
