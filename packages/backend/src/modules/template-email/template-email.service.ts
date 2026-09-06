import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templateEmail } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';

/** Modelli di base — usati per popolare la tabella al primo avvio (solo
 *  se una chiave non esiste ancora: non sovrascrivono mai una modifica
 *  già fatta dal gestionale). Sono lo stesso identico testo che prima
 *  era scritto fisso nel codice, spostato qui perché diventi
 *  modificabile. I segnaposto disponibili per ognuno sono elencati nel
 *  campo "segnaposto", mostrati nel gestionale come promemoria per chi
 *  scrive/modifica il testo. */
export const MODELLI_BASE: { chiave: string; nome: string; oggetto: string; corpo: string; segnaposto: string[] }[] = [
  {
    chiave: 'reset_password',
    nome: 'Recupero password',
    oggetto: 'Reimposta la tua password — OnWay',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Hai chiesto di reimpostare la password del tuo account OnWay. Clicca qui sotto per sceglierne una nuova.</p>
      <p><a href="{{link}}">Reimposta la password</a></p>
      <p>Il link resta valido per {{ore_validita}} ore. Se non sei stato tu a farne richiesta, ignora pure questa email — la tua password attuale resta invariata.</p>
    `,
    segnaposto: ['nome', 'link', 'ore_validita'],
  },
  {
    chiave: 'verifica_email',
    nome: 'Conferma email (registrazione nuovo account)',
    oggetto: 'Conferma la tua email — OnWay',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Grazie per esserti registrato su OnWay — manca solo un passaggio: conferma la tua email cliccando qui sotto.</p>
      <p><a href="{{link}}">Conferma la tua email</a></p>
      <p>Il link resta valido per {{ore_validita}} ore. Se non sei stato tu a registrarti, ignora pure questa email.</p>
    `,
    segnaposto: ['nome', 'link', 'ore_validita'],
  },
  {
    chiave: 'conferma_acconto',
    nome: 'Conferma prenotazione (solo acconto pagato)',
    oggetto: 'Prenotazione confermata — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>La tua prenotazione è confermata! Ecco i dettagli:</p>
      <ul>
        <li><b>PNR:</b> {{pnr}}</li>
        <li><b>Partenza da:</b> {{fermata}} alle {{orario}}</li>
        <li><b>Passeggeri:</b> {{passeggeri}}</li>
        <li><b>Totale:</b> €{{totale}} (acconto — il saldo va completato entro la scadenza indicata via email; il biglietto vero arriverà via email a saldo completato)</li>
      </ul>
      <p>Puoi completare il saldo in qualsiasi momento da <a href="{{link_saldo}}">questa pagina</a>, con già tutti i tuoi dati e la cifra da versare pronti.</p>
      <p>A presto!</p>
    `,
    segnaposto: ['nome', 'pnr', 'fermata', 'orario', 'passeggeri', 'totale', 'evento', 'link_saldo'],
  },
  {
    chiave: 'ticket',
    nome: 'Biglietto digitale (PDF con QR in allegato)',
    oggetto: 'Il tuo biglietto — PNR {{pnr}}',
    corpo: `
      <p>Ciao,</p>
      <p>ecco il tuo biglietto digitale per <b>{{evento}}</b> — trovi tutto in allegato (PDF con QR).</p>
      <p>Mostralo al momento della salita sul bus, anche direttamente dallo schermo del telefono.</p>
      <p>PNR: <b>{{pnr}}</b></p>
    `,
    segnaposto: ['evento', 'pnr'],
  },
  {
    chiave: 'promemoria_saldo',
    nome: 'Promemoria saldo (15 giorni prima, automatico)',
    oggetto: 'Completa il saldo per {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>La partenza per <b>{{evento}}</b> si avvicina: manca il saldo di <b>€{{differenza}}</b> sulla tua prenotazione <b>{{pnr}}</b>.</p>
      <p><a href="{{link}}">Completa il pagamento</a></p>
    `,
    segnaposto: ['nome', 'evento', 'differenza', 'pnr', 'link'],
  },
  {
    chiave: 'lista_attesa_promossa',
    nome: "Promozione dalla lista d'attesa (si è liberato un posto)",
    oggetto: 'Ci sono posti per {{evento}}!',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Si sono liberati posti per <b>{{evento}}</b>. Completa la tua prenotazione entro le prossime ore, prima che si esauriscano di nuovo:</p>
      <p><a href="{{link}}">Completa la prenotazione</a></p>
    `,
    segnaposto: ['nome', 'evento', 'link'],
  },
  {
    chiave: 'preventivo_richiesta',
    nome: 'Richiesta preventivo a un fornitore',
    oggetto: 'Richiesta preventivo — {{evento}} ({{tragitto}})',
    corpo: `
      <p>Buongiorno,</p>
      <p>Le chiediamo un preventivo per il seguente tragitto: <b>{{tragitto}}</b>, evento <b>{{evento}}</b> del {{data}}.</p>
      <p><a href="{{link}}">Apri la richiesta e rispondi</a></p>
      <p>Il link mostra tutti i dettagli (fermate, orari) e permette di caricare il proprio preventivo.</p>
    `,
    segnaposto: ['evento', 'tragitto', 'data', 'link'],
  },
  {
    chiave: 'preventivo_non_scelto',
    nome: 'Avviso al fornitore non scelto (dopo aver accettato un altro preventivo)',
    oggetto: 'Aggiornamento sulla richiesta preventivo',
    corpo: `
      <p>Grazie per il preventivo inviato — per questo tragitto abbiamo scelto un altro fornitore. Ci teniamo comunque a ringraziarla per la disponibilità, e restiamo a disposizione per le prossime richieste.</p>
    `,
    segnaposto: [],
  },
  {
    chiave: 'preventivo_firmato',
    nome: 'Invio preventivo confermato e firmato (con allegato)',
    oggetto: 'Preventivo confermato e firmato',
    corpo: `
      <p>In allegato trova il preventivo confermato, firmato per accettazione.</p>
    `,
    segnaposto: [],
  },
];

/** Vecchio testo del modello "conferma_acconto" (prima del link corretto
 *  a /completa-saldo) — usato solo per riconoscere se qualcuno l'ha già
 *  modificato a mano o no, vedi sotto. */
const VECCHIO_CORPO_CONFERMA_ACCONTO = `
      <p>Ciao {{nome}},</p>
      <p>La tua prenotazione è confermata! Ecco i dettagli:</p>
      <ul>
        <li><b>PNR:</b> {{pnr}}</li>
        <li><b>Partenza da:</b> {{fermata}} alle {{orario}}</li>
        <li><b>Passeggeri:</b> {{passeggeri}}</li>
        <li><b>Totale:</b> €{{totale}} (acconto — il saldo va completato entro la scadenza indicata via email; il biglietto vero arriverà via email a saldo completato)</li>
      </ul>
      <p>Puoi rivedere la tua prenotazione in qualsiasi momento nella tua <a href="{{link_account}}">area personale</a>, accedendo con questa stessa email.</p>
      <p>A presto!</p>
    `;

/** Da chiamare una volta all'avvio del server (come già si fa per i
 *  permessi): crea le righe mancanti con il testo di base, non tocca
 *  mai quelle già esistenti — così un riavvio non cancella mai le
 *  modifiche fatte dal gestionale. Un'eccezione, una tantum: se il
 *  testo di "conferma_acconto" è ancora ESATTAMENTE quello vecchio (col
 *  link sbagliato), lo aggiorna al testo nuovo — ma solo in quel caso
 *  preciso, per non rischiare di cancellare per sbaglio una modifica
 *  vera fatta dal gestionale nel frattempo. */
export async function sincronizzaTemplateEmail() {
  for (const modello of MODELLI_BASE) {
    const [esistente] = await db.select().from(templateEmail).where(eq(templateEmail.chiave, modello.chiave)).limit(1);
    if (!esistente) {
      await db.insert(templateEmail).values({ chiave: modello.chiave, nome: modello.nome, oggetto: modello.oggetto, corpo: modello.corpo });
    } else if (modello.chiave === 'conferma_acconto' && esistente.corpo === VECCHIO_CORPO_CONFERMA_ACCONTO) {
      await db.update(templateEmail).set({ corpo: modello.corpo, aggiornatoIl: new Date() }).where(eq(templateEmail.chiave, modello.chiave));
    }
  }
}

/** Sostituisce {{segnaposto}} con i valori veri — non fallisce se un
 *  segnaposto usato nel testo non ha un valore corrispondente (resta
 *  scritto {{così}}, visibile, invece di far fallire l'invio di
 *  un'intera email per un errore di battitura in un template). */
function sostituisciSegnaposto(testo: string, variabili: Record<string, string>): string {
  return testo.replace(/\{\{(\w+)\}\}/g, (match, chiave) => (chiave in variabili ? variabili[chiave] : match));
}

export const templateEmailService = {
  async list() {
    const righe = await db.select().from(templateEmail).orderBy(templateEmail.nome);
    // Aggiungo l'elenco dei segnaposto disponibili (solo informativo,
    // preso dai modelli di base — non è salvato sul database).
    return righe.map((r) => ({
      ...r,
      segnaposto: MODELLI_BASE.find((m) => m.chiave === r.chiave)?.segnaposto ?? [],
    }));
  },

  async getByChiave(chiave: string) {
    const [riga] = await db.select().from(templateEmail).where(eq(templateEmail.chiave, chiave)).limit(1);
    if (!riga) throw new NonTrovato('Modello email');
    return riga;
  },

  async aggiorna(chiave: string, input: { oggetto?: string; corpo?: string }) {
    const [riga] = await db.select().from(templateEmail).where(eq(templateEmail.chiave, chiave)).limit(1);
    if (!riga) throw new NonTrovato('Modello email');
    await db.update(templateEmail).set({
      ...(input.oggetto !== undefined && { oggetto: input.oggetto }),
      ...(input.corpo !== undefined && { corpo: input.corpo }),
      aggiornatoIl: new Date(),
    }).where(eq(templateEmail.chiave, chiave));
  },

  /** Prende il modello, sostituisce i segnaposto, torna oggetto+html
   *  pronti da passare a inviaEmail(). Usata da tutti i punti del
   *  codice che mandano email automatiche — così il testo vero vive in
   *  un solo posto (il database, modificabile dal gestionale) invece
   *  che ripetuto/scritto fisso in ogni singolo file. */
  async renderizza(chiave: string, variabili: Record<string, string>): Promise<{ oggetto: string; html: string }> {
    const modello = await this.getByChiave(chiave);
    return {
      oggetto: sostituisciSegnaposto(modello.oggetto, variabili),
      html: sostituisciSegnaposto(modello.corpo, variabili),
    };
  },
};
