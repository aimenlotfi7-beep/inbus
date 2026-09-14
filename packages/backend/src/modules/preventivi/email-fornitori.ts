import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, fermate, tragitti } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { inviaEmail } from '../../shared/email.service.js';
import { formattaData } from '../../shared/formato.js';
import { templateEmailService } from '../template-email/template-email.service.js';

export async function tragittoConEvento(tragittoId: string) {
  const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
  if (!t) throw new NonTrovato('Tragitto');
  const [e] = await db.select().from(eventi).where(eq(eventi.id, t.eventoId)).limit(1);
  return { tragitto: t, evento: e };
}

/** I segnaposto comuni a tutte le email ai fornitori su un tragitto. */
export function variabiliTragitto(tragitto: typeof tragitti.$inferSelect, evento: typeof eventi.$inferSelect | undefined) {
  return {
    evento: evento?.artista ?? 'evento',
    tragitto: tragitto.nome,
    data: evento?.data ? formattaData(evento.data) : '',
  };
}

/** Le fermate indicate, nell'ordine dato (quelle eliminate nel frattempo non ci sono). */
export async function fermateInOrdine(fermateIds: string[]) {
  if (fermateIds.length === 0) return [];
  const righe = await db.select({ id: fermate.id, citta: fermate.citta, indirizzo: fermate.indirizzo, orario: fermate.orario })
    .from(fermate).where(inArray(fermate.id, fermateIds)).orderBy(asc(fermate.ordine));
  const perId = new Map(righe.map((f) => [f.id, f]));
  return fermateIds.map((id) => perId.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
}

/** "Roma (08:00) → Firenze (10:00)" per il testo delle email. */
export function testoFermate(righe: { citta: string; orario: string | null }[]) {
  return righe.map((f) => (f.orario ? `${f.citta} (${f.orario})` : f.citta)).join(' → ');
}

/** Le email ai fornitori sono un effetto collaterale, non la sostanza
 *  dell'azione: se una fallisce (indirizzo sbagliato, provider giù, quota
 *  finita) l'azione — che sul database è già avvenuta — deve rispondere "ok"
 *  lo stesso, non 500 con uno stato a metà. Qui si registra e si va avanti;
 *  torna l'esito VERO (inviata sì/no) per lasciare al chiamante la scelta di
 *  contarlo. */
export async function inviaEmailBestEffort(...args: Parameters<typeof inviaEmail>): Promise<boolean> {
  try {
    const { inviata } = await inviaEmail(...args);
    return inviata;
  } catch (e) {
    console.error(`[preventivi] invio email a ${args[0].a} fallito:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Prepara un modello e lo invia a un fornitore — mai un'eccezione
 *  (neanche se il modello manca): false se l'email non è partita. */
export async function inviaEmailModello(
  a: string,
  chiave: string,
  variabili: Record<string, string>,
  allegati?: Parameters<typeof inviaEmail>[0]['allegati'],
): Promise<boolean> {
  try {
    const { oggetto, html } = await templateEmailService.renderizza(chiave, variabili);
    return await inviaEmailBestEffort({ a, oggetto, html, allegati });
  } catch (e) {
    console.error(`[preventivi] email "${chiave}" a ${a} non preparata:`, e instanceof Error ? e.message : e);
    return false;
  }
}
