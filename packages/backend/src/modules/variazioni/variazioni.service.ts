import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { variazioni, variazioniRisposte, prenotazioni, richiesteRimborso, eventi, tragitti, utenti, fermate } from '../../db/schema.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';
import { leggiSogliaPosticipoMinuti, leggiSogliaMinimaPartenza } from '../impostazioni/impostazioni.routes.js';
import { NonTrovato } from '../../shared/errors.js';

type FermataConfronto = { citta: string; indirizzo: string; orario?: string | null };

function minutiDa(orario: string): number | null {
  const parti = orario.split(':');
  if (parti.length !== 2) return null;
  const h = Number(parti[0]);
  const m = Number(parti[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Confronta le fermate di un tragitto prima/dopo una modifica, e
 *  decide quali richiedono una comunicazione ai clienti — abbinate per
 *  POSIZIONE nell'elenco (stesso ordine, non si aggiungono/tolgono
 *  fermate da qui, solo si modificano valori) — vedi
 *  aggiornaTragittoOperativo, che chiama questa funzione PRIMA di
 *  sostituire le fermate nel database, quando "vecchie" sono ancora
 *  quelle vere.
 *
 *  Regole (decise): cambio città o indirizzo → sempre; anticipo
 *  dell'orario (qualunque entità) → sempre; posticipo → solo oltre la
 *  soglia impostata (leggiSogliaPosticipoMinuti, default 20 minuti). */
export async function rilevaVariazioni(
  vecchie: FermataConfronto[],
  nuove: FermataConfronto[]
): Promise<{ fermataVecchia: FermataConfronto; descrizione: string }[]> {
  const soglia = await leggiSogliaPosticipoMinuti();
  const risultato: { fermataVecchia: FermataConfronto; descrizione: string }[] = [];

  // Abbinate per CITTÀ (l'identità vera di una fermata — è quella che
  // le prenotazioni referenziano, fermataCitta), non per posizione
  // nell'elenco: aggiungere o togliere una fermata da Partenze non
  // deve far scattare confronti sbagliati su tutte quelle successive,
  // che semplicemente si sono spostate di posto senza essere
  // cambiate per davvero.
  for (const v of vecchie) {
    const n = nuove.find((f) => f.citta === v.citta);

    if (!n) {
      // La fermata non c'è più nel nuovo elenco — un cambiamento
      // ancora più grande di un semplice spostamento, va comunicato
      // comunque a chi aveva già prenotato lì.
      risultato.push({
        fermataVecchia: v,
        descrizione: `La fermata di "${v.citta}" non è più prevista in questo tragitto.`,
      });
      continue;
    }

    if (v.indirizzo !== n.indirizzo) {
      risultato.push({
        fermataVecchia: v,
        descrizione: `Il punto di ritrovo di "${v.citta}" è cambiato: ora è ${n.indirizzo} (prima era ${v.indirizzo}).`,
      });
      continue; // un solo motivo di variazione per fermata, non due insieme se anche l'orario è cambiato nello stesso salvataggio
    }

    if (v.orario && n.orario && v.orario !== n.orario) {
      const mVecchio = minutiDa(v.orario);
      const mNuovo = minutiDa(n.orario);
      if (mVecchio !== null && mNuovo !== null) {
        const delta = mNuovo - mVecchio;
        const eAnticipo = delta < 0;
        if (eAnticipo || Math.abs(delta) >= soglia) {
          risultato.push({
            fermataVecchia: v,
            descrizione: `L'orario di "${v.citta}" è ${eAnticipo ? 'anticipato' : 'posticipato'}: da ${v.orario} a ${n.orario}.`,
          });
        }
      }
    }
  }
  return risultato;
}

/** Per ogni fermata variata, trova le prenotazioni confermate che la
 *  toccano (matching per città, come già fa tutto il resto dell'app —
 *  le prenotazioni salvano la città come testo, non un riferimento),
 *  crea la variazione e una riga di risposta per ognuna (col link
 *  univoco), e manda la comunicazione. Va chiamata DOPO che la
 *  transazione di aggiornaTragittoOperativo è confermata (le email non
 *  devono partire per un salvataggio poi andato storto). */
export async function generaComunicazioniVariazione(
  tragittoId: string,
  variazioniRilevate: { fermataVecchia: FermataConfronto; descrizione: string }[]
) {
  if (variazioniRilevate.length === 0) return;

  const [tragitto] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
  if (!tragitto) return;
  const [evento] = await db.select().from(eventi).where(eq(eventi.id, tragitto.eventoId)).limit(1);
  if (!evento) return;

  for (const v of variazioniRilevate) {
    const prenotazioniToccate = await db
      .select({ prenotazione: prenotazioni, clienteEmail: utenti.email, clienteNome: utenti.nome })
      .from(prenotazioni)
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.fermataCitta, v.fermataVecchia.citta), eq(prenotazioni.stato, 'CONFERMATA')));
    if (prenotazioniToccate.length === 0) continue; // nessuno ha ancora prenotato su questa fermata, nessuna comunicazione da mandare

    const [nuovaVariazione] = await db.insert(variazioni).values({
      tragittoId, fermataDescrizione: v.fermataVecchia.citta, descrizione: v.descrizione,
    }).returning();

    for (const { prenotazione: p, clienteEmail, clienteNome } of prenotazioniToccate) {
      const token = randomUUID();
      await db.insert(variazioniRisposte).values({ variazioneId: nuovaVariazione.id, prenotazioneId: p.id, token });
      const link = urlSito(`/variazione/${token}`);
      await inviaEmail({
        a: clienteEmail,
        oggetto: `Una variazione al tuo viaggio — ${evento.artista}`,
        html: `
          <p>Ciao ${clienteNome ?? ''},</p>
          <p>C'è una variazione al tuo viaggio per <strong>${evento.artista}</strong> (PNR ${p.pnr}):</p>
          <p>${v.descrizione}</p>
          <p>Se va bene così, non devi fare nulla — la tua prenotazione resta confermata automaticamente.
          Se invece preferisci il rimborso, puoi richiederlo qui:</p>
          <p><a href="${link}">${link}</a></p>
        `,
      });
    }
  }
}

/** Elenco variazioni per il gestionale — con quante risposte mancano
 *  ancora, per decidere se è "in corso" o "gestita" a colpo d'occhio. */
export async function listaVariazioni() {
  const tutte = await db.select().from(variazioni).orderBy(variazioni.creataIl);
  const risultato = [];
  for (const v of tutte) {
    const risposte = await db.select().from(variazioniRisposte).where(eq(variazioniRisposte.variazioneId, v.id));
    risultato.push({
      ...v,
      totaleClienti: risposte.length,
      rispostoAccettato: risposte.filter((r) => r.risposta === 'ACCETTATA').length,
      rispostoRimborso: risposte.filter((r) => r.risposta === 'RIMBORSO_RICHIESTO').length,
      inAttesa: risposte.filter((r) => !r.risposta).length,
    });
  }
  return risultato.reverse(); // le più recenti prima
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
  if (riga.risposta) return; // già risposto una volta, non si sovrascrive

  await db.update(variazioniRisposte).set({ risposta, rispostoIl: new Date() }).where(eq(variazioniRisposte.id, riga.id));

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
export async function disattivaFermatePartenzaSottoSoglia() {
  const oraAdesso = new Date();
  const tra24Ore = new Date(oraAdesso.getTime() + 24 * 3600 * 1000);

  const fermatePartenza = await db.select({
    fermataId: fermate.id,
    tragittoId: fermate.tragittoId,
    citta: fermate.citta,
    indirizzo: fermate.indirizzo,
    orario: fermate.orario,
    sogliaMinima: fermate.sogliaMinima,
    eventoData: eventi.data,
  }).from(fermate)
    .innerJoin(tragitti, eq(tragitti.id, fermate.tragittoId))
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .where(and(eq(fermate.tipo, 'PARTENZA'), eq(fermate.attivo, true)));

  let disattivate = 0;
  for (const f of fermatePartenza) {
    if (!f.orario) continue; // senza orario non posso calcolare quando parte davvero
    const [ore, minuti] = f.orario.split(':').map(Number);
    if (Number.isNaN(ore) || Number.isNaN(minuti)) continue;
    const partenzaVera = new Date(f.eventoData);
    partenzaVera.setHours(ore, minuti, 0, 0);
    if (partenzaVera > tra24Ore) continue; // non ancora nelle prossime 24 ore, troppo presto per decidere

    const soglia = f.sogliaMinima ?? await leggiSogliaMinimaPartenza();
    const [conteggio] = await db.select({ tot: sql<number>`coalesce(sum(${prenotazioni.passeggeri}), 0)` }).from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, f.tragittoId), eq(prenotazioni.fermataCitta, f.citta), eq(prenotazioni.stato, 'CONFERMATA')));
    const partecipantiAttuali = Number(conteggio?.tot ?? 0);
    if (partecipantiAttuali >= soglia) continue; // soglia raggiunta, tutto bene, nessuna azione

    await db.update(fermate).set({ attivo: false }).where(eq(fermate.id, f.fermataId));
    await generaComunicazioniVariazione(f.tragittoId, [{
      fermataVecchia: { citta: f.citta, indirizzo: f.indirizzo, orario: f.orario },
      descrizione: `La fermata di "${f.citta}" non ha raggiunto il numero minimo di partecipanti necessario (${partecipantiAttuali} su ${soglia} richiesti) — non è più prevista per questa partenza.`,
    }]);
    disattivate++;
  }
  return { disattivate };
}
