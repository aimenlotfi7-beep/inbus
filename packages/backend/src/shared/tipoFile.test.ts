import { describe, expect, it } from 'vitest';
import { contenutoCorrispondeAlTipo, nomeAllegatoSicuro, tipoDalContenuto } from './tipoFile.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const pdf = Buffer.from('%PDF-1.7\n');
const html = Buffer.from('<html><script>alert(1)</script></html>');

describe('contenutoCorrispondeAlTipo', () => {
  it('accetta i formati ammessi quando il contenuto è quello dichiarato', () => {
    expect(contenutoCorrispondeAlTipo(png, 'image/png')).toBe(true);
    expect(contenutoCorrispondeAlTipo(jpeg, 'image/jpeg')).toBe(true);
    expect(contenutoCorrispondeAlTipo(webp, 'image/webp')).toBe(true);
    expect(contenutoCorrispondeAlTipo(Buffer.from('GIF89a...'), 'image/gif')).toBe(true);
    expect(contenutoCorrispondeAlTipo(pdf, 'application/pdf')).toBe(true);
  });

  it('rifiuta un file che dichiara un tipo ma ne contiene un altro', () => {
    expect(contenutoCorrispondeAlTipo(html, 'image/png')).toBe(false);
    expect(contenutoCorrispondeAlTipo(pdf, 'image/jpeg')).toBe(false);
    expect(contenutoCorrispondeAlTipo(png, 'application/pdf')).toBe(false);
  });

  it('rifiuta i tipi non ammessi e i file vuoti', () => {
    expect(contenutoCorrispondeAlTipo(html, 'text/html')).toBe(false);
    expect(contenutoCorrispondeAlTipo(Buffer.alloc(0), 'image/png')).toBe(false);
  });
});

describe('tipoDalContenuto', () => {
  it('riconosce il tipo vero, qualunque cosa dica il nome', () => {
    expect(tipoDalContenuto(pdf)).toBe('application/pdf');
    expect(tipoDalContenuto(jpeg)).toBe('image/jpeg');
    expect(tipoDalContenuto(html)).toBeNull();
  });
});

describe('nomeAllegatoSicuro', () => {
  it("mette l'estensione del contenuto vero", () => {
    expect(nomeAllegatoSicuro('preventivo.pdf.exe', 'application/pdf')).toBe('preventivopdf.pdf');
    expect(nomeAllegatoSicuro('Offerta bus (Como).PDF', 'application/pdf')).toBe('Offerta bus (Como).pdf');
    expect(nomeAllegatoSicuro('foto.jpeg', 'image/jpeg')).toBe('foto.jpg');
  });

  it('toglie cartelle e caratteri strani, e dà un nome se manca', () => {
    expect(nomeAllegatoSicuro('..\\..\\windows\\evil.pdf', 'application/pdf')).toBe('evil.pdf');
    expect(nomeAllegatoSicuro('<script>.pdf', 'application/pdf')).toBe('script.pdf');
    expect(nomeAllegatoSicuro(undefined, 'application/pdf')).toBe('allegato.pdf');
  });
});
