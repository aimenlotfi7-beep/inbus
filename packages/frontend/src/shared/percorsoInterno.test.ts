import { describe, expect, it } from 'vitest';
import { percorsoInterno } from './percorsoInterno';

describe('percorsoInterno', () => {
  it('lascia passare i percorsi del sito', () => {
    expect(percorsoInterno('/account')).toBe('/account');
    expect(percorsoInterno('/account?sezione=prenotazioni')).toBe('/account?sezione=prenotazioni');
    expect(percorsoInterno('/eventi/ultimo-roma?promo=ABC')).toBe('/eventi/ultimo-roma?promo=ABC');
  });

  it('manda alla pagina iniziale tutto ciò che porterebbe su un altro sito', () => {
    expect(percorsoInterno('https://sito-finto.it')).toBe('/');
    expect(percorsoInterno('//sito-finto.it')).toBe('/');
    expect(percorsoInterno('/\\sito-finto.it')).toBe('/');
    expect(percorsoInterno('/\t/sito-finto.it')).toBe('/');
    expect(percorsoInterno('javascript:alert(1)')).toBe('/');
  });

  it('senza valore usa la pagina di riserva', () => {
    expect(percorsoInterno(null)).toBe('/');
    expect(percorsoInterno('', '/account')).toBe('/account');
  });
});
