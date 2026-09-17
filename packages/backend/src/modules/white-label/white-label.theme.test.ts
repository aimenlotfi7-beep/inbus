import { describe, expect, it } from 'vitest';
import { DEFAULT_WHITE_LABEL_THEME, normalizzaTema } from './white-label.theme.js';

// Il tema di una White Label sta in un jsonb: i temi salvati prima che una
// proprietà esistesse devono continuare a funzionare, prendendo il default.

describe('normalizzaTema', () => {
  it('un tema vuoto diventa quello di serie', () => {
    expect(normalizzaTema({})).toEqual(DEFAULT_WHITE_LABEL_THEME);
    expect(normalizzaTema(null)).toEqual(DEFAULT_WHITE_LABEL_THEME);
  });

  it('tiene quello che è salvato e riempie il resto', () => {
    const tema = normalizzaTema({ colori: { cta: '#00aa55' }, testi: { pulsante: 'Acquista' } });
    expect(tema.colori.cta).toBe('#00aa55');
    expect(tema.colori.sfondo).toBe(DEFAULT_WHITE_LABEL_THEME.colori.sfondo);
    expect(tema.testi.pulsante).toBe('Acquista');
    expect(tema.testi.titolo).toBeNull();
  });

  it('un tema vecchio (senza le nuove proprietà) prende i valori di serie', () => {
    const vecchio = {
      branding: { logoUrl: 'https://esempio.it/logo.png', posizioneLogo: 'in-alto-al-centro', dimensioneLogoPx: 40 },
      colori: { sfondo: '#ffffff', superficie: '#ffffff', testoPrincipale: '#111111', testoSecondario: '#666666', cta: '#111111', testoCta: '#ffffff', bordi: '#eeeeee' },
      tipografia: { font: 'Inter', dimensioneTitoloPx: 20, dimensioneTestoPx: 14 },
      stile: { borderRadiusPx: 6, stilePulsanti: 'pieno', altezzaPulsantePx: 44, spaziaturaPx: 16 },
    };
    const tema = normalizzaTema(vecchio);
    expect(tema.branding.logoUrl).toBe('https://esempio.it/logo.png');
    expect(tema.branding.sfondoImmagineUrl).toBeNull();
    expect(tema.colori.accento).toBe(DEFAULT_WHITE_LABEL_THEME.colori.accento);
    expect(tema.tipografia.fontTitoli).toBeNull();
    expect(tema.stile.larghezzaPx).toBe(DEFAULT_WHITE_LABEL_THEME.stile.larghezzaPx);
    // Il marchio OnWay resta acceso finché non lo si spegne di proposito.
    expect(tema.marchio.mostraOnWay).toBe(true);
  });
});
