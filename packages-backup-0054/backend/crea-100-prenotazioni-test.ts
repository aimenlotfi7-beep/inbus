// Crea fino a 100 prenotazioni di prova su un evento a tua scelta —
// ogni passeggero prova a prenotare su una fermata a caso tra quelle
// disponibili; se i posti sulla tratta scelta sono finiti, quella
// richiesta diventa un'iscrizione alla lista d'attesa invece di fallire.
//
// Uso: npx tsx crea-100-prenotazioni-test.ts
// (richiede DATABASE_URL già impostata sull'ambiente giusto)
import readline from 'node:readline/promises';
import { db } from './src/db/client.js';
import { prenotazioniService } from './src/modules/prenotazioni/prenotazioni.service.js';
import { listaAttesaService } from './src/modules/lista-attesa/lista-attesa.service.js';
import { ConflittoDati } from './src/shared/errors.js';

const NOMI = ['Marco', 'Giulia', 'Luca', 'Sara', 'Andrea', 'Chiara', 'Matteo', 'Francesca', 'Davide', 'Elisa'];
const COGNOMI = ['Rossi', 'Bianchi', 'Verdi', 'Russo', 'Ferrari', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino'];

function scegliA<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

async function main() {
  const eventiEsistenti = await db.query.eventi.findMany({
    with: { linee: { with: { fermate: true } } },
    orderBy: (e, { desc }) => [desc(e.data)],
  });
  const eventiConTratte = eventiEsistenti.filter((e) => e.linee.some((l) => l.fermate.length > 0));

  if (eventiConTratte.length === 0) {
    console.log('Nessun evento con tratte configurate trovato — creane uno prima dal gestionale.');
    process.exit(1);
  }

  console.log('\nEventi disponibili:');
  eventiConTratte.forEach((e, i) => {
    const postiTotali = e.linee.reduce((s, l) => s + l.postiTotali, 0);
    console.log(`  ${i + 1}. ${e.artista} — ${e.luogo}, ${e.citta} (${postiTotali} posti totali sulle tratte)`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const risposta = await rl.question('\nNumero dell\'evento da usare: ');
  const scelto = eventiConTratte[Number(risposta) - 1];
  if (!scelto) {
    console.log('Numero non valido.');
    rl.close();
    process.exit(1);
  }
  const rispostaN = await rl.question('Quante richieste generare? [100]: ');
  rl.close();
  const numeroRichieste = Number(rispostaN) || 100;

  const opzioniFermate = scelto.linee.flatMap((linea) =>
    linea.fermate.map((f) => ({ lineaId: linea.id, fermataId: f.id }))
  );
  if (opzioniFermate.length === 0) {
    console.log('Questo evento non ha nessuna fermata configurata.');
    process.exit(1);
  }

  console.log(`\nGenero ${numeroRichieste} richieste per "${scelto.artista}"...\n`);

  let confermate = 0;
  let inListaAttesa = 0;
  let errori = 0;

  for (let i = 1; i <= numeroRichieste; i++) {
    const { lineaId, fermataId } = scegliA(opzioniFermate);
    const nome = scegliA(NOMI);
    const cognome = scegliA(COGNOMI);
    const cliente = {
      email: `test.prenotazione.${i}@esempio.it`,
      nome,
      cognome,
      telefono: `333${String(1000000 + i).slice(-7)}`,
    };

    try {
      await prenotazioniService.crea({
        eventoId: scelto.id,
        lineaId,
        fermataId,
        passeggeri: 1,
        tipoPagamento: 'COMPLETO',
        metodoPagamento: 'CARTA',
        cliente,
        partecipanti: [],
      });
      confermate++;
      process.stdout.write('✓');
    } catch (err) {
      if (err instanceof ConflittoDati) {
        // Posti finiti su quella tratta: la richiesta diventa lista d'attesa.
        try {
          await listaAttesaService.iscriviti({
            eventoId: scelto.id,
            lineaId,
            fermataId,
            passeggeri: 1,
            cliente,
            partecipanti: [],
          });
          inListaAttesa++;
          process.stdout.write('⏳');
        } catch {
          errori++;
          process.stdout.write('✗');
        }
      } else {
        errori++;
        process.stdout.write('✗');
      }
    }
    if (i % 50 === 0) process.stdout.write('\n');
  }

  console.log(`\n\nFatto: ${confermate} prenotazioni confermate, ${inListaAttesa} finite in lista d'attesa, ${errori} errori imprevisti.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore:', err);
  process.exit(1);
});
