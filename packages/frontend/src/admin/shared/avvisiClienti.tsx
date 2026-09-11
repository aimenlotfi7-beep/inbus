import type { AnteprimaVariazioniEvento, AnteprimaVariazioniTragitto, EsitoAvvisiClienti } from '../../api/eventi';
import { notifica } from './notifiche';
import { conferma } from './conferma';
import { plurale } from '../../shared/formato';

/** Prima di salvare una modifica a un viaggio già venduto (data, luogo,
 *  fermate, orari): se qualche cliente riceverà l'email di variazione, lo
 *  si dice — quanti e per cosa — e si chiede conferma. Senza clienti
 *  coinvolti non chiede nulla e restituisce subito true. */
export async function confermaAvvisiClienti(
  anteprima: AnteprimaVariazioniTragitto | AnteprimaVariazioniEvento,
  etichettaConferma = 'Salva e avvisa',
): Promise<boolean> {
  if (anteprima.clientiTotali === 0) return true;
  const voci = anteprima.variazioni.filter((v) => v.clienti > 0);
  return conferma({
    titolo: `Questa modifica avviserà ${plurale(anteprima.clientiTotali, 'cliente', 'clienti')}`,
    testo: (
      <>
        <p style={{ margin: '0 0 10px' }}>
          {anteprima.clientiTotali === 1 ? 'Il cliente riceverà' : 'I clienti riceveranno'} un'email con la variazione e la possibilità di chiedere il rimborso:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {voci.map((v, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {(v as { tragitto?: string }).tragitto ? <b>{(v as { tragitto?: string }).tragitto}: </b> : null}
              {v.descrizione} <span style={{ color: 'var(--mist)' }}>({plurale(v.clienti, 'cliente', 'clienti')})</span>
            </li>
          ))}
        </ul>
      </>
    ),
    conferma: etichettaConferma,
    annulla: 'Torna a modificare',
  });
}

/** Il messaggio dopo il salvataggio, con l'esito delle email ai clienti:
 *  prima si leggeva solo "Orari salvati." anche quando erano partite email. */
export function notificaEsitoAvvisi(fatto: string, esito: EsitoAvvisiClienti) {
  if (!esito.clientiAvvisati) {
    notifica(`${fatto}.`, 'successo');
    return;
  }
  const partite = esito.clientiAvvisati - esito.emailNonInviate;
  if (esito.emailNonInviate === 0) {
    notifica(`${fatto}: ${plurale(partite, 'cliente avvisato', 'clienti avvisati')} via email.`, 'successo');
    return;
  }
  notifica(`${fatto}, ma ${esito.emailNonInviate === 1 ? "1 email ai clienti non è partita" : `${esito.emailNonInviate} email ai clienti non sono partite`} (inviate ${partite} su ${esito.clientiAvvisati}). Controlla la configurazione delle email.`, 'errore');
}
