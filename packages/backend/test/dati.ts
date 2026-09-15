import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { amministratori, coupon, eventi, fermate, fornitori, impostazioni, lineaFermate, linee, busFisici, ruoli, tragitti, utenti } from '../src/db/schema.js';
import { inizioGiornoRoma } from '../src/shared/formato.js';
import type { CreaPrenotazioneInput } from '../src/modules/prenotazioni/prenotazioni.dto.js';
import { svuotaPosta } from './posta.js';

/** Dati finti per i test con il database: eventi, tragitti, fermate, clienti,
 *  coupon. Ogni test parte da un database vuoto (svuotaDatabase). */

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;
let contatore = 0;
const progressivo = () => `${Date.now().toString(36)}${(contatore++).toString(36)}`;

/** Toglie tutti i dati creati dai test. CASCADE svuota anche le tabelle
 *  collegate (prenotazioni, ordini, linee, bus, crediti, richieste…). Restano
 *  modelli email, layout dei biglietti e permessi. */
export async function svuotaDatabase() {
  // Dentro un blocco solo per non stampare un avviso per ogni tabella svuotata.
  await db.execute(sql.raw(`do $$ begin
    set local client_min_messages = warning;
    truncate table eventi, utenti, coupon, promoter, impostazioni, log_attivita, amministratori, fornitori, tour_leader restart identity cascade;
  end $$`));
  svuotaPosta();
}

/** Il giorno fra `giorni` giorni, a mezzanotte di Roma: come le date degli eventi veri. */
export function fraGiorni(giorni: number): Date {
  return inizioGiornoRoma(new Date(Date.now() + giorni * UN_GIORNO_MS));
}

export async function impostazione(chiave: string, valore: string | number) {
  await db.insert(impostazioni).values({ chiave, valore: String(valore) })
    .onConflictDoUpdate({ target: impostazioni.chiave, set: { valore: String(valore) } });
}

export async function creaEvento(o: Partial<typeof eventi.$inferInsert> = {}) {
  const [evento] = await db.insert(eventi).values({
    slug: `evento-${progressivo()}`, artista: 'Concerto di prova', genere: 'Pop', luogo: 'Stadio', citta: 'Milano',
    data: fraGiorni(60), ...o,
  }).returning();
  return evento;
}

export async function creaTragitto(eventoId: string, o: Partial<typeof tragitti.$inferInsert> = {}) {
  const [tragitto] = await db.insert(tragitti).values({
    eventoId, nome: 'Da Roma', postiTotali: 999999, postiDisponibili: 999999, stato: 'PREZZATO', ...o,
  }).returning();
  return tragitto;
}

export async function creaFermata(tragittoId: string, o: Partial<typeof fermate.$inferInsert> = {}) {
  const [fermata] = await db.insert(fermate).values({
    tragittoId, citta: 'Roma', indirizzo: 'Piazza dei Cinquecento', orario: '08:00', prezzo: '40', ...o,
  }).returning();
  return fermata;
}

export async function creaCliente(o: Partial<typeof utenti.$inferInsert> = {}) {
  const [cliente] = await db.insert(utenti).values({
    email: `cliente-${progressivo()}@example.com`, nome: 'Mario', cognome: 'Rossi', telefono: '3330000000',
    emailVerificata: true, ...o,
  }).returning();
  return cliente;
}

export async function creaCoupon(o: Partial<typeof coupon.$inferInsert> & { codice: string; tipo: 'PERCENTUALE' | 'FISSO'; valore: string }) {
  const [c] = await db.insert(coupon).values(o).returning();
  return c;
}

/** Una linea con un bus da `postiBus` posti che copre le fermate indicate. */
export async function creaLineaConBus(tragittoId: string, fermateIds: string[], postiBus: number, nome = 'Linea 1') {
  const [linea] = await db.insert(linee).values({ tragittoId, nome }).returning();
  await db.insert(lineaFermate).values(fermateIds.map((fermataId, ordine) => ({ lineaId: linea.id, fermataId, ordine })));
  const [bus] = await db.insert(busFisici).values({ lineaId: linea.id, riferimento: `Bus ${nome}`, postiBus }).returning();
  return { linea, bus };
}

export async function creaFornitore(o: Partial<typeof fornitori.$inferInsert> = {}) {
  const n = progressivo();
  const [f] = await db.insert(fornitori).values({ nome: `Autolinee ${n}`, email: `fornitore-${n}@example.com`, stato: 'APPROVATO', ...o }).returning();
  return f;
}

/** Una proposta da confermare (come quelle create in automatico) sulle fermate indicate. */
export async function creaProposta(tragittoId: string, fermateIds: string[], nome = 'Linea 1') {
  const [linea] = await db.insert(linee).values({ tragittoId, nome, daConfermare: true }).returning();
  await db.insert(lineaFermate).values(fermateIds.map((fermataId, ordine) => ({ lineaId: linea.id, fermataId, ordine })));
  return linea;
}

/** Un bus su una linea che c'è già. */
export async function creaBusSuLinea(lineaId: string, postiBus: number) {
  const [bus] = await db.insert(busFisici).values({ lineaId, riferimento: 'Bus di prova', postiBus }).returning();
  return bus;
}

export async function creaAmministratore(o: { owner?: boolean; attivo?: boolean } = {}) {
  const [ruolo] = await db.insert(ruoli).values({ nome: `Ruolo ${progressivo()}`, owner: o.owner ?? true }).returning();
  const [admin] = await db.insert(amministratori).values({
    nome: 'Admin di prova', email: `admin-${progressivo()}@example.com`, passwordHash: 'non-usata', ruoloId: ruolo.id, attivo: o.attivo ?? true,
  }).returning();
  return admin;
}

/** Evento fra 60 giorni, tragitto in vendita, due fermate (Roma 40 €, Firenze 30 €) e un cliente. */
export async function scenarioBase(o: { evento?: Partial<typeof eventi.$inferInsert>; tragitto?: Partial<typeof tragitti.$inferInsert> } = {}) {
  const evento = await creaEvento(o.evento);
  const tragitto = await creaTragitto(evento.id, o.tragitto);
  const roma = await creaFermata(tragitto.id, { citta: 'Roma', prezzo: '40', orario: '08:00', ordine: 0 });
  const firenze = await creaFermata(tragitto.id, { citta: 'Firenze', prezzo: '30', orario: '10:00', ordine: 1 });
  const cliente = await creaCliente();
  return { evento, tragitto, roma, firenze, cliente };
}

/** Una riga di prenotazione come la manda il sito. */
export function riga(
  dove: { eventoId: string; tragittoId: string; fermataId: string },
  cliente: { email: string },
  extra: Partial<CreaPrenotazioneInput> = {},
): CreaPrenotazioneInput {
  const passeggeri = extra.passeggeri ?? 1;
  // Come i valori predefiniti del modulo sul server: un campo lasciato vuoto non toglie quello di base.
  const valorizzati = Object.fromEntries(Object.entries(extra).filter(([, valore]) => valore !== undefined));
  return {
    ...dove,
    passeggeri,
    tipoPagamento: 'COMPLETO',
    metodoPagamento: 'DA_CONCORDARE',
    cliente: { email: cliente.email, nome: 'Mario', cognome: 'Rossi', telefono: '3330000000' },
    partecipanti: Array.from({ length: passeggeri - 1 }, (_, i) => ({ nome: 'Passeggero', cognome: String(i + 2) })),
    ...valorizzati,
  };
}
