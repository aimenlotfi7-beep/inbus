/** Le email che il codice avrebbe mandato durante un test: nessuna parte
 *  davvero (vedi controllo-database.ts), restano qui per controllarle. */
export interface EmailDiProva {
  a: string;
  oggetto: string;
  html: string;
  allegati?: { nomeFile: string; contenuto: Buffer; tipo: string }[];
}

export const posta: EmailDiProva[] = [];

export function svuotaPosta() {
  posta.length = 0;
}
