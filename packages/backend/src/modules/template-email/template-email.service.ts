import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templateEmail } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { escapaHtml } from '../../shared/formato.js';

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
    chiave: 'benvenuto_ospite',
    nome: 'Benvenuto (acquisto da ospite, senza account)',
    oggetto: 'Il tuo ordine è confermato — imposta una password per gestirlo',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Il tuo ordine su OnWay è confermato! Hai acquistato senza creare un account — se vuoi, puoi impostare
      una password per accedere quando vuoi ai tuoi biglietti, al credito fedeltà e alla lista d'attesa.</p>
      <p><a href="{{link}}">Imposta la tua password</a></p>
      <p>Il link resta valido per {{ore_validita}} ore. Nessun obbligo: i tuoi biglietti restano comunque
      raggiungibili in qualsiasi momento con "Traccia la tua prenotazione", usando questa email.</p>
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
        <li><b>Totale:</b> €{{totale}} (acconto — il saldo va completato entro la scadenza indicata via email)</li>
      </ul>
      <p>Puoi completare il saldo in qualsiasi momento da <a href="{{link_saldo}}">questa pagina</a>, con già tutti i tuoi dati e la cifra da versare pronti.</p>
      <p>Dopo il saldo, il biglietto con il bus su cui viaggerai ti arriverà via email il giorno prima della partenza: da quel momento potrai scaricarlo anche dalla tua area personale.</p>
      <p>A presto!</p>
    `,
    segnaposto: ['nome', 'pnr', 'fermata', 'orario', 'passeggeri', 'totale', 'evento', 'link_saldo'],
  },
  {
    chiave: 'conferma_pagamento',
    nome: 'Conferma pagamento (pagamento completo o saldo, senza biglietto)',
    oggetto: 'Pagamento ricevuto — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>abbiamo ricevuto il tuo pagamento: la prenotazione per <b>{{evento}}</b> del {{data}} è confermata.</p>
      <ul>
        <li><b>PNR:</b> {{pnr}}</li>
        <li><b>Partenza da:</b> {{fermata}}</li>
        <li><b>Importo pagato:</b> {{importo}}</li>
      </ul>
      <p>Il biglietto, con il bus su cui viaggerai, ti arriverà via email il giorno prima della partenza, quando assegniamo i passeggeri ai bus. Sarà scaricabile anche dalla tua area personale dal {{disponibileDal}}.</p>
      <p>A presto!</p>
    `,
    segnaposto: ['nome', 'evento', 'data', 'fermata', 'pnr', 'importo', 'disponibileDal'],
  },
  {
    chiave: 'ticket',
    nome: 'Biglietto digitale (PDF con QR in allegato)',
    oggetto: 'Il tuo biglietto e il tuo bus — PNR {{pnr}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>ecco il tuo biglietto per <b>{{evento}}</b> del {{data}}: in allegato trovi un PDF con QR per ogni passeggero.</p>
      <ul>
        <li><b>Il tuo bus:</b> {{bus}}</li>
        <li><b>Partenza da:</b> {{fermata}} alle {{orario}}</li>
        <li><b>PNR:</b> {{pnr}}</li>
      </ul>
      <p>Sali sul bus indicato e mostra il QR al tour leader, anche direttamente dallo schermo del telefono. Puoi scaricare di nuovo i biglietti in qualsiasi momento dalla tua area personale.</p>
      <p>Buon viaggio!</p>
    `,
    segnaposto: ['nome', 'evento', 'data', 'fermata', 'orario', 'bus', 'pnr'],
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
    oggetto: 'Aggiornamento sulla richiesta preventivo — {{evento}} ({{tragitto}})',
    corpo: `
      <p>Buongiorno,</p>
      <p>Grazie per il preventivo inviato per il tragitto <b>{{tragitto}}</b>, evento <b>{{evento}}</b> del {{data}} — per questo viaggio abbiamo scelto un altro fornitore.</p>
      <p>Ci teniamo comunque a ringraziarla per la disponibilità, e restiamo a disposizione per le prossime richieste.</p>
    `,
    segnaposto: ['evento', 'tragitto', 'data'],
  },
  {
    chiave: 'preventivo_scelto',
    nome: 'Avviso al fornitore scelto (preventivo accettato)',
    oggetto: 'Preventivo accettato — {{evento}} ({{tragitto}})',
    corpo: `
      <p>Buongiorno,</p>
      <p>Le comunichiamo che abbiamo scelto il Suo preventivo di <b>{{prezzo}}</b> per il tragitto <b>{{tragitto}}</b>, evento <b>{{evento}}</b> del {{data}}.</p>
      <p>Seguirà a parte il preventivo confermato e firmato per accettazione. Per qualsiasi necessità restiamo a Sua disposizione.</p>
    `,
    segnaposto: ['evento', 'tragitto', 'data', 'prezzo'],
  },
  {
    chiave: 'bundle_conferma',
    nome: 'Riepilogo acquisto bundle (oltre alle conferme dei singoli eventi)',
    oggetto: 'Il tuo bundle {{bundle}} è confermato',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Grazie! Hai acquistato il bundle <b>{{bundle}}</b>: {{eventi}}.</p>
      <p>Totale originale {{totaleOriginale}} — sconto bundle {{sconto}} — <b>totale {{totale}}</b>.</p>
      <p>Riceverai una conferma separata per ogni evento; i biglietti, con il bus assegnato, ti arriveranno via email il giorno prima di ogni partenza.</p>
    `,
    segnaposto: ['nome', 'bundle', 'eventi', 'totaleOriginale', 'sconto', 'totale'],
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
  {
    // Stesso testo che prima era scritto fisso in generaComunicazioniVariazione.
    chiave: 'variazione_viaggio',
    nome: 'Variazione al viaggio (fermata, orario, data o luogo cambiati)',
    oggetto: 'Una variazione al tuo viaggio — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>C'è una variazione al tuo viaggio per <strong>{{evento}}</strong> (PNR {{pnr}}):</p>
      <p>{{descrizione}}</p>
      <p>Se va bene così, non devi fare nulla — la tua prenotazione resta confermata automaticamente.
      Se invece preferisci il rimborso, puoi richiederlo qui:</p>
      <p><a href="{{link}}">{{link}}</a></p>
    `,
    segnaposto: ['nome', 'evento', 'pnr', 'descrizione', 'link'],
  },
  {
    chiave: 'partenza_confermata',
    nome: 'Partenza confermata (primo bus organizzato per il tragitto)',
    oggetto: 'La tua partenza è confermata — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Buone notizie: la partenza del tuo viaggio per <b>{{evento}}</b> del {{data}} è confermata, il bus è organizzato.</p>
      <ul>
        <li><b>PNR:</b> {{pnr}}</li>
        <li><b>Tragitto:</b> {{tragitto}}</li>
        <li><b>Partenza da:</b> {{fermata}}</li>
        <li><b>Orario di partenza:</b> {{orario}}</li>
      </ul>
      <p>Non devi fare nulla: se dovesse cambiare qualcosa ti scriveremo. A presto!</p>
    `,
    segnaposto: ['nome', 'evento', 'data', 'tragitto', 'fermata', 'orario', 'pnr'],
  },
  {
    chiave: 'tour_leader_assegnato',
    nome: 'Tour leader assegnato a un bus',
    oggetto: 'Sei il tour leader di un bus — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Ti abbiamo assegnato come tour leader del bus <b>{{bus}}</b>, tragitto <b>{{tragitto}}</b>, per <b>{{evento}}</b> del {{data}}.</p>
      <p>Il giorno della partenza controllerai i biglietti dei passeggeri dall'app di scansione:</p>
      <p><a href="{{link}}">{{link}}</a></p>
      <p>Se non hai ancora le credenziali di accesso, chiedile all'organizzazione.</p>
    `,
    segnaposto: ['nome', 'evento', 'data', 'tragitto', 'bus', 'link'],
  },
  {
    chiave: 'prenotazione_cancellata',
    nome: "Prenotazione cancellata dall'organizzazione",
    oggetto: 'La tua prenotazione è stata cancellata — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Ti informiamo che la tua prenotazione <b>{{pnr}}</b> per <b>{{evento}}</b> è stata cancellata.</p>
      <p>Motivo: {{motivo}}</p>
      <p>Se hai domande, contattaci: siamo a disposizione.</p>
    `,
    segnaposto: ['nome', 'evento', 'pnr', 'motivo'],
  },
  {
    chiave: 'rimborso_approvato',
    nome: 'Richiesta di rimborso approvata',
    oggetto: 'Rimborso approvato — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>La tua richiesta di rimborso per la prenotazione <b>{{pnr}}</b> (<b>{{evento}}</b>) è stata approvata: la prenotazione è cancellata.</p>
      <p>Importo del rimborso: <b>{{importo}}</b>.</p>
      <p>Grazie per la pazienza.</p>
    `,
    segnaposto: ['nome', 'evento', 'pnr', 'importo'],
  },
  {
    chiave: 'rimborso_rifiutato',
    nome: 'Richiesta di rimborso non approvata',
    oggetto: 'La tua richiesta di rimborso — {{evento}}',
    corpo: `
      <p>Ciao {{nome}},</p>
      <p>Abbiamo valutato la tua richiesta di rimborso per la prenotazione <b>{{pnr}}</b> (<b>{{evento}}</b>): purtroppo non possiamo approvarla.</p>
      <p>Motivo: {{motivo}}</p>
      <p>La tua prenotazione resta confermata. Se hai domande, contattaci: siamo a disposizione.</p>
    `,
    segnaposto: ['nome', 'evento', 'pnr', 'motivo'],
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

/** Vecchio testo di "preventivo_non_scelto" (senza evento/tragitto/data). */
const VECCHIO_OGGETTO_PREVENTIVO_NON_SCELTO = 'Aggiornamento sulla richiesta preventivo';
const VECCHIO_CORPO_PREVENTIVO_NON_SCELTO = `
      <p>Grazie per il preventivo inviato — per questo tragitto abbiamo scelto un altro fornitore. Ci teniamo comunque a ringraziarla per la disponibilità, e restiamo a disposizione per le prossime richieste.</p>
    `;

/** Testi di base di prima che il biglietto partisse solo dopo lo
 *  smistamento sui bus (il giorno prima della partenza): promettevano il
 *  biglietto a saldo completato / subito, e il biglietto non citava il bus. */
const VECCHIO_CORPO_CONFERMA_ACCONTO_BIGLIETTO_A_SALDO = `
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
    `;
const VECCHIO_OGGETTO_TICKET = 'Il tuo biglietto — PNR {{pnr}}';
const VECCHIO_CORPO_TICKET = `
      <p>Ciao,</p>
      <p>ecco il tuo biglietto digitale per <b>{{evento}}</b> — trovi tutto in allegato (PDF con QR).</p>
      <p>Mostralo al momento della salita sul bus, anche direttamente dallo schermo del telefono.</p>
      <p>PNR: <b>{{pnr}}</b></p>
    `;
const VECCHIO_CORPO_BUNDLE_CONFERMA = `
      <p>Ciao {{nome}},</p>
      <p>Grazie! Hai acquistato il bundle <b>{{bundle}}</b>: {{eventi}}.</p>
      <p>Totale originale {{totaleOriginale}} — sconto bundle {{sconto}} — <b>totale {{totale}}</b>.</p>
      <p>Riceverai una conferma e un biglietto separati per ogni evento.</p>
    `;

/** Testi di base cambiati nel tempo: si portano al testo nuovo SOLO se
 *  la riga salvata è ancora esattamente un vecchio testo di base (mai
 *  toccata dal gestionale). Una modifica vera resta sempre com'è. Una
 *  chiave può comparire più volte (un testo per ogni vecchia versione). */
const AGGIORNAMENTI_TESTO_BASE: { chiave: string; vecchioOggetto?: string; vecchioCorpo: string }[] = [
  { chiave: 'conferma_acconto', vecchioCorpo: VECCHIO_CORPO_CONFERMA_ACCONTO },
  { chiave: 'conferma_acconto', vecchioCorpo: VECCHIO_CORPO_CONFERMA_ACCONTO_BIGLIETTO_A_SALDO },
  { chiave: 'preventivo_non_scelto', vecchioOggetto: VECCHIO_OGGETTO_PREVENTIVO_NON_SCELTO, vecchioCorpo: VECCHIO_CORPO_PREVENTIVO_NON_SCELTO },
  { chiave: 'ticket', vecchioOggetto: VECCHIO_OGGETTO_TICKET, vecchioCorpo: VECCHIO_CORPO_TICKET },
  { chiave: 'bundle_conferma', vecchioCorpo: VECCHIO_CORPO_BUNDLE_CONFERMA },
];

/** Da chiamare una volta all'avvio del server (come già si fa per i
 *  permessi): crea le righe mancanti con il testo di base, non tocca
 *  mai quelle già esistenti — così un riavvio non cancella mai le
 *  modifiche fatte dal gestionale. Eccezione, una tantum: i modelli in
 *  AGGIORNAMENTI_TESTO_BASE ancora ESATTAMENTE col vecchio testo di base
 *  passano al testo nuovo — solo in quel caso preciso, per non rischiare
 *  di cancellare una modifica vera fatta dal gestionale nel frattempo. */
export async function sincronizzaTemplateEmail() {
  for (const modello of MODELLI_BASE) {
    const [esistente] = await db.select().from(templateEmail).where(eq(templateEmail.chiave, modello.chiave)).limit(1);
    if (!esistente) {
      await db.insert(templateEmail).values({ chiave: modello.chiave, nome: modello.nome, oggetto: modello.oggetto, corpo: modello.corpo });
      continue;
    }
    const aggiornamento = AGGIORNAMENTI_TESTO_BASE.find((a) => a.chiave === modello.chiave && a.vecchioCorpo === esistente.corpo);
    if (aggiornamento) {
      await db.update(templateEmail).set({
        corpo: modello.corpo,
        ...(aggiornamento.vecchioOggetto !== undefined && esistente.oggetto === aggiornamento.vecchioOggetto && { oggetto: modello.oggetto }),
        aggiornatoIl: new Date(),
      }).where(eq(templateEmail.chiave, modello.chiave));
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
   *  che ripetuto/scritto fisso in ogni singolo file.
   *
   *  opzioni.escapaHtml: i segnaposto il cui valore arriva da persone
   *  (nomi, indirizzi, descrizioni, motivi) — nel corpo HTML vengono
   *  resi innocui; nell'oggetto (testo semplice) restano come sono. Mai
   *  metterci i link.
   *
   *  Se la riga non è ancora sul database (sincronizzazione all'avvio
   *  non ancora passata) si usa il testo di base, invece di perdere
   *  l'email. */
  async renderizza(
    chiave: string,
    variabili: Record<string, string>,
    opzioni: { escapaHtml?: string[] } = {},
  ): Promise<{ oggetto: string; html: string }> {
    const [riga] = await db.select().from(templateEmail).where(eq(templateEmail.chiave, chiave)).limit(1);
    const modello = riga ?? MODELLI_BASE.find((m) => m.chiave === chiave);
    if (!modello) throw new NonTrovato('Modello email');
    const daEscapare = new Set(opzioni.escapaHtml ?? []);
    const variabiliHtml = Object.fromEntries(
      Object.entries(variabili).map(([k, v]) => [k, daEscapare.has(k) ? escapaHtml(v) : v]),
    );
    return {
      oggetto: sostituisciSegnaposto(modello.oggetto, variabili),
      html: sostituisciSegnaposto(modello.corpo, variabiliHtml),
    };
  },
};
