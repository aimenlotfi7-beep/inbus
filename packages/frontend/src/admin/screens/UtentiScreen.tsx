import { useEffect, useState } from 'react';
import { utentiApi, type Utente } from '../../api/utenti';
import { PanelHead } from '../shared/PanelHead';
import { TabellaGenerica } from '../shared/TabellaGenerica';

export function UtentiScreen() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  useEffect(() => { utentiApi.list().then(setUtenti); }, []);

  return (
    <div>
      <PanelHead titolo="Utenti" />
      <TabellaGenerica
        righe={utenti}
        colonne={[
          { etichetta: 'Nome', render: (u) => `${u.nome ?? ''} ${u.cognome ?? ''}`.trim() || '—' },
          { etichetta: 'Email', render: (u) => u.email },
          { etichetta: 'Telefono', render: (u) => u.telefono ?? '—' },
          { etichetta: 'Città', render: (u) => u.citta ?? '—' },
          { etichetta: 'Cliente dal', render: (u) => new Date(u.creatoIl).toLocaleDateString('it-IT') },
        ]}
      />
    </div>
  );
}
