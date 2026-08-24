/** Regola unica di validazione della nuova password — usata da tutti i
 *  tipi di account (cliente, admin, promoter, tour leader). Prima era
 *  ripetuta identica in 4 punti diversi: cambiarla voleva dire
 *  ricordarsi di aggiornarla in tutti e 4, rischiando di dimenticarne
 *  uno. Torna il messaggio di errore da mostrare, o null se è tutto ok. */
export function erroreValidazionePassword(password: string, conferma: string): string | null {
  if (password.length < 8) return 'La password deve avere almeno 8 caratteri.';
  if (password !== conferma) return 'Le due password non coincidono.';
  return null;
}
