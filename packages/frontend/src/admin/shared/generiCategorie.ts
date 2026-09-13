import { categorieApi, type Categoria } from '../../api/categorie';
import { categorieEventoApi, type CategoriaEvento } from '../../api/categorieEvento';
import { confermaConTesto } from './conferma';
import { notifica } from './notifiche';
import { motivoErrore } from './errori';

/** Chiede il nome e crea un genere o una categoria: lo stesso passaggio
 *  serviva in Contenuti e nella scheda evento, prima copiato due volte con
 *  la finestra del browser. null se si annulla o se non riesce. */
async function chiediECrea<T extends { nome: string }>(titolo: string, etichetta: string, crea: (nome: string) => Promise<T>, fatto: (nome: string) => string): Promise<T | null> {
  const nome = (await confermaConTesto({ titolo, testo: '', conferma: 'Crea', campoTesto: { etichetta } }))?.trim();
  if (!nome) return null;
  try {
    const creato = await crea(nome);
    notifica(fatto(creato.nome), 'successo');
    return creato;
  } catch (e) {
    notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    return null;
  }
}

export function chiediNuovoGenere(): Promise<Categoria | null> {
  return chiediECrea('Nuovo genere', 'Nome del genere', (nome) => categorieApi.create(nome), (nome) => `Genere "${nome}" creato.`);
}

export function chiediNuovaCategoria(): Promise<CategoriaEvento | null> {
  return chiediECrea('Nuova categoria', 'Nome della categoria (compare come pulsante in alto sul sito)', (nome) => categorieEventoApi.create(nome), (nome) => `Categoria "${nome}" creata.`);
}
