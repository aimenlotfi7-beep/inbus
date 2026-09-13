import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { variazioni, variazioniRisposte, prenotazioni, richiesteRimborso, eventi, tragitti, utenti, fermate, linee, lineaFermate } from '../../db/schema.js';
import { calcolaTempi, leggiOrariTragitto } from '../prenotazioni/partenza.js';
import { inizioOggiRoma } from '../../shared/formato.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';
import { leggiSogliaPosticipoMinuti } from '../impostazioni/impostazioni.routes.js';
import { templateEmailService } from '../template-email/template-email.service.js';
import { NonTrovato } from '../../shared/errors.js';

export type FermataConfronto = { citta: string; indirizzo?: string | null; orario?: string | null; attivo?: boolean | null };

/** Una variazione da comunicare. Con fermataVecchia valorizzata tocca
 *  chi ha prenotato su QUELLA fermata (città); con fermataVecchia null
 *  tocca tutte le prenotazioni confermate del tragitto (data o luogo
 *  dell'evento cambiati). */
export type VariazioneRilevata = { fermataVecchia: FermataConfronto | null; descrizione: string };

export type EsitoComunicazioni = { clientiAvvisati: number; emailNonInviate: number };

/** Orario come lo scrive il salvataggio e come lo si confronta: "8:00",
 *  "08:00" e "08:00:00" sono lo stesso orario; vuoto e assente sono la
 *  stessa cosa (nessun orario) — così un valore rimasto uguale non fa
 *  mai partire una variazione per sbaglio. */
export function normalizzaOrario(orario: string | null | undefined): string | null {
  const t = (orario ?? '').trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t;
}

/** Testo libero (indirizzo, luogo): null, vuoto e spazi ai lati contano uguale. */
export function normalizzaTesto(valore: string | null | undefined): string {
  return (valore ?? '').trim();
}

function minutiDa(orario: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(orario);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Confronta le fermate di un tragitto prima/dopo una modifica, e
 *  decide quali richiedono una comunicazione ai clienti — vedi
 *  aggiornaTragittoOperativo e l'aggiornamento dell'evento, che chiamano
 *  questa funzione PRIMA di sostituire le fermate nel database, quando
 *  "vecchie" sono ancora quelle vere.
 *
 *  Regole (decise): fermata tolta o disattivata → sempre; cambio
 *  indirizzo → sempre; anticipo dell'orario (qualunque entità) →
 *  sempre; posticipo → solo oltre la soglia impostata
 *  (leggiSogliaPosticipoMinuti, default 0 = qualunque posticipo, vedi
 *  impostazioni.routes.ts). Riattivare una fermata non genera nulla. */
export async function rilevaVariazioni(
  vecchie: FermataConfronto[],
  nuove: FermataConfronto[]
): Promise<VariazioneRilevata[]> {
  const soglia = await leggiSogliaPosticipoMinuti();
  const risultato: VariazioneRilevata[] = [];

  // Abbinate per CITTÀ (l'identità vera di una fermata — è quella che
  // le prenotazioni referenziano, fermataCitta), non per posizione
  // nell'elenco: aggiungere o togliere una fermata da Partenze non
  // deve far scattare confronti sbagliati su tutte quelle successive,
  // che semplicemente si sono spostate di posto senza essere
  // cambiate per davvero.
  for (const v of vecchie) {
    // Già disattivata prima di questo salvataggio: chi aveva prenotato lì
    // è stato avvisato quando è stata spenta, e riattivarla (anche con
    // valori diversi) non genera una variazione.
    if (v.attivo === false) continue;

    const n = nuove.find((f) => f.citta === v.citta);

    if (!n || n.attivo === false) {
      // La fermata non c'è più (o non è più attiva) — un cambiamento
      // ancora più grande di un semplice spostamento, va comunicato
      // comunque a chi aveva già prenotato lì.
      risultato.push({
        fermataVecchia: v,
        descrizione: `La fermata di "${v.citta}" non è più prevista in questo tragitto.`,
      });
      continue;
    }

    const indirizzoVecchio = normalizzaTesto(v.indirizzo);
    const indirizzoNuovo = normalizzaTesto(n.indirizzo);
    if (indirizzoVecchio !== indirizzoNuovo) {
      risultato.push({
        fermataVecchia: v,
        descrizione: `Il punto di ritrovo di "${v.citta}" è cambiato: ora è ${indirizzoNuovo} (prima era ${indirizzoVecchio}).`,
      });
      continue; // un solo motivo di variazione per fermata, non due insieme se anche l'orario è cambiato nello stesso salvataggio
    }

    const orarioVecchio = normalizzaOrario(v.orario);
    const orarioNuovo = normalizzaOrario(n.orario);
    if (orarioVecchio && orarioNuovo && orarioVecchio !== orarioNuovo) {
      const mVecchio = minutiDa(orarioVecchio);
      const mNuovo = minutiDa(orarioNuovo);
      if (mVecchio !== null && mNuovo !== null) {
        const delta = mNuovo - mVecchio;
        const eAnticipo = delta < 0;
        if (eAnticipo || Math.abs(delta) >= soglia) {
          risultato.push({
            fermataVecchia: v,
            descrizione: `L'orario di "${v.citta}" è ${eAnticipo ? 'anticipato' : 'posticipato'}: da ${orarioVecchio} a ${orarioNuovo}.`,
          });
        }
      }
    }
  }
  return risultato;
}

/** Le prenotazioni toccate da una variazione: confermate, del tragitto,
 *  sulla città della fermata (matching per città, come già fa tutto il
 *  resto dell'app — le prenotazioni salvano la città come testo, non un
 *  riferimento) oppure tutte quelle del tragitto se citta è null. Una
 *  sola definizione, usata sia per l'invio vero sia per l'anteprima. */
function condizioniPrenotazioniToccate(tragittoId: string, citta: string | null): SQL[] {
  const condizioni: SQL[] = [eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')];
  if (citta !== null) condizioni.push(eq(prenotazioni.fermataCitta, citta));
  return condizioni;
}

/** Anteprima (nessuna scrittura): per ogni variazione, quante email
 *  partirebbero. */
export async function anteprimaComunicazioni(
  tragittoId: string,
  variazioniRilevate: VariazioneRilevata[]
): Promise<{ fermata: string; descrizione: string; clienti: number }[]> {
  const righe: { fermata: string; descrizione: string; clienti: number }[] = [];
  for (const v of variazioniRilevate) {
    const citta = v.fermataVecchia?.citta ?? null;
    const [conteggio] = await db.select({ n: sql<number>`count(*)::int` })
      .from(prenotazioni)
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .where(and(...condizioniPrenotazioniToccate(tragittoId, citta)));
    righe.push({ fermata: citta ?? '', descrizione: v.descrizione, clienti: Number(conteggio?.n ?? 0) });
  }
  return righe;
}

/** Per ogni variazione, trova le prenotazioni confermate toccate, crea
 *  la variazione e una riga di risposta per ognuna (col link univoco),
 *  e manda la comunicazione. Va chiamata DOPO che la transazione del
 *  salvataggio è confermata (le email non devono partire per un
 *  salvataggio poi andato storto). Non lancia mai: il salvataggio è già
 *  avvenuto, un problema qui si registra nei log e si conta. Il
 *  fallimento verso un cliente non ferma gli altri. */
export async function generaComunicazioniVariazione(
  tragittoId: string,
  variazioniRilevate: VariazioneRilevata[]
): Promise<EsitoComunicazioni> {
  const esito: EsitoComunicazioni = { clientiAvvisati: 0, emailNonInviate: 0 };
  if (variazioniRilevate.length === 0) return esito;

  try {
    const [tragitto] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
    if (!tragitto) return esito;
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, tragitto.eventoId)).limit(1);
    if (!evento) return esito;

    for (const v of variazioniRilevate) {
      try {
        const citta = v.fermataVecchia?.citta ?? null;
        const prenotazioniToccate = await db
          .select({ prenotazione: prenotazioni, clienteEmail: utenti.email, clienteNome: utenti.nome })
          .from(prenotazioni)
          .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
          .where(and(...condizioniPrenotazioniToccate(tragittoId, citta)));
        if (prenotazioniToccate.length === 0) continue; // nessuno ha ancora prenotato, nessuna comunicazione da mandare

        const [nuovaVariazione] = await db.insert(variazioni).values({
          tragittoId, fermataDescrizione: citta ?? '', descrizione: v.descrizione,
        }).returning();

        for (const { prenotazione: p, clienteEmail, clienteNome } of prenotazioniToccate) {
          esito.clientiAvvisati++;
          try {
            const token = randomUUID();
            await db.insert(variazioniRisposte).values({ variazioneId: nuovaVariazione.id, prenotazioneId: p.id, token });
            const link = urlSito(`/variazione/${token}`);
            const { oggetto, html } = await templateEmailService.renderizza('variazione_viaggio', {
              nome: clienteNome ?? '',
              evento: evento.artista,
              pnr: p.pnr,
              descrizione: v.descrizione,
              link,
            });
            const { inviata } = await inviaEmail({ a: clienteEmail, oggetto, html });
            if (!inviata) esito.emailNonInviate++;
          } catch (err) {
            esito.emailNonInviate++;
            console.error(`[variazioni] avviso al cliente ${clienteEmail} (PNR ${p.pnr}) non riuscito:`, err);
          }
        }
      } catch (err) {
        console.error(`[variazioni] comunicazione della variazione "${v.descrizione}" (tragitto ${tragittoId}) non riuscita:`, err);
      }
    }
  } catch (err) {
    console.error(`[variazioni] comunicazioni per il tragitto ${tragittoId} non riuscite:`, err);
  }
  return esito;
}

/** Elenco variazioni per il gestionale — con quante risposte mancano
 *  ancora, per decidere se è "in corso" o "gestita" a colpo d'occhio, e
 *  a quale evento/tragitto si riferisce. */
export async function listaVariazioni() {
  const righe = await db
    .select({ variazione: variazioni, tragittoNome: tragitti.nome, eventoArtista: eventi.artista, eventoData: eventi.data })
    .from(variazioni)
    .innerJoin(tragitti, eq(tragitti.id, variazioni.tragittoId))
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .orderBy(desc(variazioni.creataIl)); // le più recenti prima
  if (righe.length === 0) return [];

  const risposte = await db.select({ variazioneId: variazioniRisposte.variazioneId, risposta: variazioniRisposte.risposta })
    .from(variazioniRisposte)
    .where(inArray(variazioniRisposte.variazioneId, righe.map((r) => r.variazione.id)));

  return righe.map(({ variazione: v, tragittoNome, eventoArtista, eventoData }) => {
    const sue = risposte.filter((r) => r.variazioneId === v.id);
    return {
      ...v,
      eventoArtista,
      eventoData: new Date(eventoData).toISOString(),
      tragittoNome,
      totaleClienti: sue.length,
      rispostoAccettato: sue.filter((r) => r.risposta === 'ACCETTATA').length,
      rispostoRimborso: sue.filter((r) => r.risposta === 'RIMBORSO_RICHIESTO').length,
      inAttesa: sue.filter((r) => !r.risposta).length,
    };
  });
}

/** Info pubbliche per la pagina "/variazione/:token" — solo il minimo
 *  indispensabile per mostrare al cliente cosa sta scegliendo, niente
 *  dati sensibili di altri passeggeri. */
export async function infoRispostaVariazione(token: string) {
  const [riga] = await db.select().from(variazioniRisposte).where(eq(variazioniRisposte.token, token)).limit(1);
  if (!riga) throw new NonTrovato('Link');
  const [v] = await db.select().from(variazioni).where(eq(variazioni.id, riga.variazioneId)).limit(1);
  const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, riga.prenotazioneId)).limit(1);
  if (!v || !p) throw new NonTrovato('Variazione');
  return { descrizione: v.descrizione, pnr: p.pnr, giaRisposto: riga.risposta };
}

export async function rispondiVariazione(token: string, risposta: 'ACCETTATA' | 'RIMBORSO_RICHIESTO') {
  const [riga] = await db.select().from(variazioniRisposte).where(eq(variazioniRisposte.token, token)).limit(1);
  if (!riga) throw new NonTrovato('Link');

  // Atomico: la condizione "risposta IS NULL" si riverifica proprio
  // nel comando che la imposta — un doppio click sullo stesso link
  // (o due tab aperte), solo uno dei due riesce, l'altro vede l'elenco
  // vuoto e capisce che si è già risposto un istante fa.
  const [rigaAggiornata] = await db.update(variazioniRisposte)
    .set({ risposta, rispostoIl: new Date() })
    .where(and(eq(variazioniRisposte.id, riga.id), isNull(variazioniRisposte.risposta)))
    .returning();
  if (!rigaAggiornata) return; // già risposto una volta, non si sovrascrive (comportamento invariato, solo ora davvero senza corsa)

  if (risposta === 'RIMBORSO_RICHIESTO') {
    // Segnalata come "da variazione" — priorità diversa dalle altre,
    // ma passa comunque da approvazione admin (deciso apposta: non
    // automatica, anche se causata da noi).
    await db.insert(richiesteRimborso).values({
      prenotazioneId: riga.prenotazioneId,
      motivo: 'Rimborso richiesto in seguito a una variazione del viaggio.',
      origine: 'VARIAZIONE',
      variazioneId: riga.variazioneId,
    });
  }

  // Appena questa risposta arriva, ricontrollo se restano altre
  // risposte in attesa per la stessa variazione — se no, la segno
  // "gestita" (tutti hanno risposto, o accettata di default a
  // scadenza — quel caso non scrive nulla qui, va gestito a parte
  // con un controllo periodico se serve un pulsante "segna scaduta").
  const tutteLeRisposte = await db.select().from(variazioniRisposte).where(eq(variazioniRisposte.variazioneId, riga.variazioneId));
  const restanoInAttesa = tutteLeRisposte.some((r) => !r.risposta);
  if (!restanoInAttesa) {
    await db.update(variazioni).set({ stato: 'GESTITA' }).where(eq(variazioni.id, riga.variazioneId));
  }
}

/** Disattiva le fermate "Partenza" che non hanno raggiunto la loro
 *  soglia minima di partecipanti, nelle ultime 24 ore prima della
 *  partenza (stesso momento del riordino per fasce d'età e dello
 *  sblocco del biglietto — è il punto naturale in cui la decisione
 *  diventa definitiva). Riusa lo stesso meccanismo di comunicazione
 *  già costruito per le Variazioni vere e proprie (email + scelta
 *  accetta/rimborso) — dal punto di vista del cliente è esattamente lo
 *  stesso tipo di avviso, solo con una causa diversa. */
/** Parole fisse della descrizione di questa variazione: servono anche a
 *  riconoscere una fermata già spenta (e avvisata) per soglia. */
const TESTO_SOGLIA = 'non ha raggiunto il numero minimo di partecipanti';

export async function disattivaFermateSottoSoglia() {
  const adesso = new Date();

  // Facoltativa su OGNI fermata: la sola presenza di una soglia scritta
  // basta a dire che va controllata. Solo tragitti attivi di eventi in
  // programma, pubblicati e non nel cestino: prima finivano nel controllo
  // anche gli eventi già passati, con avvisi per viaggi già fatti.
  const fermateConSoglia = await db.select({
    fermataId: fermate.id,
    tragittoId: fermate.tragittoId,
    citta: fermate.citta,
    indirizzo: fermate.indirizzo,
    orario: fermate.orario,
    sogliaMinima: fermate.sogliaMinima,
  }).from(fermate)
    .innerJoin(tragitti, eq(tragitti.id, fermate.tragittoId))
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .where(and(
      isNotNull(fermate.sogliaMinima), eq(fermate.attivo, true),
      eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl),
      isNull(eventi.eliminatoIl), eq(eventi.bozza, false), gte(eventi.data, inizioOggiRoma(adesso)),
    ));

  const orariPerTragitto = new Map<string, Awaited<ReturnType<typeof leggiOrariTragitto>>>();
  const copertePerTragitto = new Map<string, Set<string>>();
  let disattivate = 0;
  let emailNonInviate = 0;

  for (const f of fermateConSoglia) {
    // Una fermata che va storta non deve fermare il controllo delle altre.
    try {
      if (!orariPerTragitto.has(f.tragittoId)) orariPerTragitto.set(f.tragittoId, await leggiOrariTragitto(f.tragittoId));
      const orari = orariPerTragitto.get(f.tragittoId);
      if (!orari) continue;
      // Stessa partenza (ora di Roma) e stesso momento "24 ore prima" dello
      // smistamento sui bus e del biglietto (partenza.ts). Prima l'orario
      // era letto come ora UTC con setHours: la decisione arrivava 1-2 ore
      // dopo lo smistamento.
      const tempi = calcolaTempi(orari, f.citta);
      if (!tempi.orarioFermata) continue; // senza orario della fermata non si sa quando parte
      if (adesso < tempi.disponibileDal) continue; // troppo presto per decidere
      if (adesso >= tempi.partenza) continue; // già partita: niente da decidere

      // Fermata dentro una linea confermata: il bus la serve comunque, e chi
      // ha prenotato lì riceverà il biglietto. Non si spegne e non si
      // avvisa (stessa regola dei salvataggi, senzaFermateCoperteDaLinee).
      if (!copertePerTragitto.has(f.tragittoId)) {
        const coperte = await db.selectDistinct({ citta: fermate.citta }).from(lineaFermate)
          .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
          .innerJoin(linee, and(eq(linee.id, lineaFermate.lineaId), eq(linee.daConfermare, false)))
          .where(eq(fermate.tragittoId, f.tragittoId));
        copertePerTragitto.set(f.tragittoId, new Set(coperte.map((c) => c.citta)));
      }
      if (copertePerTragitto.get(f.tragittoId)!.has(f.citta)) continue;

      // Già spenta per soglia in questa finestra e poi riattivata a mano
      // dal gestionale: è una scelta, non la si rispegne ogni ora con
      // nuove email.
      const [giaGestita] = await db.select({ id: variazioni.id }).from(variazioni)
        .where(and(
          eq(variazioni.tragittoId, f.tragittoId), eq(variazioni.fermataDescrizione, f.citta),
          gte(variazioni.creataIl, tempi.disponibileDal), ilike(variazioni.descrizione, `%${TESTO_SOGLIA}%`),
        )).limit(1);
      if (giaGestita) continue;

      // Garantita non-nulla dal filtro isNotNull qui sopra.
      const soglia = f.sogliaMinima!;
      const [conteggio] = await db.select({ tot: sql<number>`coalesce(sum(${prenotazioni.passeggeri}), 0)` }).from(prenotazioni)
        .where(and(eq(prenotazioni.tragittoId, f.tragittoId), eq(prenotazioni.fermataCitta, f.citta), eq(prenotazioni.stato, 'CONFERMATA')));
      const partecipantiAttuali = Number(conteggio?.tot ?? 0);
      if (partecipantiAttuali >= soglia) continue; // soglia raggiunta, nessuna azione

      await db.update(fermate).set({ attivo: false }).where(eq(fermate.id, f.fermataId));
      disattivate++;
      // Non lancia mai, e un cliente non raggiunto non ferma gli altri.
      const esito = await generaComunicazioniVariazione(f.tragittoId, [{
        fermataVecchia: { citta: f.citta, indirizzo: f.indirizzo, orario: f.orario },
        descrizione: `La fermata di "${f.citta}" ${TESTO_SOGLIA} necessario (${partecipantiAttuali} su ${soglia} richiesti) — non è più prevista per questa partenza.`,
      }]);
      emailNonInviate += esito.emailNonInviate;
      if (esito.emailNonInviate > 0) {
        console.error(`[variazioni] fermata ${f.citta} (tragitto ${f.tragittoId}) spenta per soglia: ${esito.emailNonInviate} avvisi ai clienti non partiti.`);
      }
    } catch (err) {
      console.error(`[variazioni] controllo soglia della fermata ${f.fermataId} (${f.citta}) non riuscito:`, err);
    }
  }
  return { disattivate, emailNonInviate };
}
