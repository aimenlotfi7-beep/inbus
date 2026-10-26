/** Generi e categorie degli eventi: «Rock», «rock» e « Rock » sono lo stesso
 *  nome (proprietario, ottobre 2026). Spazi ai lati e maiuscole non contano.
 *  Stessa regola nel server (backend/src/shared/nomi.ts). */
export const chiaveNome = (nome: string | null | undefined) => (nome ?? '').trim().toLowerCase();

export const stessoNome = (a: string | null | undefined, b: string | null | undefined) => chiaveNome(a) === chiaveNome(b);

/** Un nome per ciascuno, il primo come è scritto: «Rock» e «rock» compaiono una volta sola. */
export function nomiSenzaDoppioni(nomi: string[]): string[] {
  const visti = new Map<string, string>();
  for (const nome of nomi) {
    const chiave = chiaveNome(nome);
    if (chiave && !visti.has(chiave)) visti.set(chiave, nome.trim());
  }
  return [...visti.values()];
}
