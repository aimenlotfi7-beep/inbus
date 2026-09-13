/** Campi che non devono MAI uscire dal server in una risposta: con il
 *  token di reset chiunque veda la risposta (anche un operatore con il solo
 *  permesso di consultare) può impostare una password nuova e prendere
 *  l'account; l'hash della password non serve a nessuna schermata. */
const CAMPI_SEGRETI = ['passwordHash', 'tokenResetPassword', 'tokenResetPasswordScadenza', 'tokenVerificaEmail', 'tokenVerificaScadenza'] as const;

type CampoSegreto = (typeof CAMPI_SEGRETI)[number];

/** La stessa riga senza hash della password e token (reset, verifica email).
 *  Al posto dell'hash dice solo se una password è impostata. */
export function senzaSegreti<T extends object>(riga: T): Omit<T, CampoSegreto> & { passwordImpostata?: boolean } {
  const copia = { ...riga } as Record<string, unknown>;
  const conPassword = 'passwordHash' in copia ? copia.passwordHash !== null && copia.passwordHash !== undefined : undefined;
  for (const campo of CAMPI_SEGRETI) delete copia[campo];
  if (conPassword !== undefined) copia.passwordImpostata = conPassword;
  return copia as Omit<T, CampoSegreto> & { passwordImpostata?: boolean };
}
