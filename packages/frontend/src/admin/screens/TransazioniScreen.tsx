import { useEffect, useState } from 'react';
import { prenotazioniAdminApi, type PrenotazioneRiga } from '../../api/prenotazioniAdmin';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';

export function TransazioniScreen() {
  const [righe, setRighe] = useState<PrenotazioneRiga[]>([]);
  function ricarica() { prenotazioniAdminApi.listAll().then(setRighe); }
  useEffect(ricarica, []);

  async function cancella(r: PrenotazioneRiga) {
    if (!confirm(`Cancellare la prenotazione ${r.pnr}? I posti torneranno disponibili.`)) return;
    await prenotazioniAdminApi.cancella(r.pnr);
    ricarica();
  }

  return (
    <div>
      <PanelHead titolo="Transazioni" />
      <TabellaGenerica
        righe={righe}
        colonne={[
          { etichetta: 'PNR', render: (r) => r.pnr },
          { etichetta: 'Evento', render: (r) => r.artista },
          { etichetta: 'Cliente', render: (r) => `${r.clienteNome ?? ''} · ${r.clienteEmail}` },
          { etichetta: 'Passeggeri', render: (r) => String(r.passeggeri) },
          { etichetta: 'Totale', render: (r) => `€${Number(r.totale).toFixed(2)}` },
          { etichetta: 'Stato', render: (r) => r.stato === 'CONFERMATA' ? 'Confermata' : 'Cancellata' },
          { etichetta: 'Data', render: (r) => new Date(r.creataIl).toLocaleDateString('it-IT') },
        ]}
        onElimina={(r) => r.stato === 'CONFERMATA' ? cancella(r) : undefined}
      />
    </div>
  );
}
