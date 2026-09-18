/** Il tipo di un file caricato lo dichiara il browser di chi lo manda:
 *  un file qualunque può presentarsi come "image/png". Qui si guardano i
 *  primi byte, che per ogni formato ammesso sono sempre gli stessi, e il
 *  file passa solo se il contenuto vero corrisponde al tipo dichiarato. */

const inizia = (buffer: Buffer, byte: number[], da = 0) => byte.every((b, i) => buffer[da + i] === b);
const testo = (s: string) => [...s].map((c) => c.charCodeAt(0));

const FIRME: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (b) => inizia(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => inizia(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => inizia(b, testo('GIF87a')) || inizia(b, testo('GIF89a')),
  'image/webp': (b) => inizia(b, testo('RIFF')) && inizia(b, testo('WEBP'), 8),
  'application/pdf': (b) => inizia(b, testo('%PDF-')),
};

const ESTENSIONI: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

export function contenutoCorrispondeAlTipo(buffer: Buffer, tipo: string): boolean {
  return FIRME[tipo]?.(buffer) ?? false;
}

/** Il tipo vero di un file dai suoi primi byte, tra quelli ammessi. */
export function tipoDalContenuto(buffer: Buffer): string | null {
  return Object.keys(FIRME).find((tipo) => FIRME[tipo](buffer)) ?? null;
}

/** Il nome con cui si salva un allegato mandato da fuori (per esempio
 *  il preventivo di un fornitore, che chiunque può registrare): niente
 *  cartelle né caratteri strani, e l'estensione del contenuto vero.
 *  Così "preventivo.pdf.exe" diventa "preventivopdf.pdf" e il computer
 *  di chi lo scarica non lo tratta come un programma. */
export function nomeAllegatoSicuro(nome: string | undefined, tipo: string): string {
  const base = (nome ?? '')
    .split(/[\\/]/).pop()!
    .replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N} _()-]/gu, '')
    .trim()
    .slice(0, 80);
  return `${base || 'allegato'}.${ESTENSIONI[tipo] ?? 'bin'}`;
}
