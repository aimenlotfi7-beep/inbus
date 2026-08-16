import { useEffect, useState } from 'react';
import { utentiApi, type Utente } from '../../api/utenti';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';

export function UtentiScreen() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [ricerca, setRicerca] = useState('');
  useEffect(() => { utentiApi.list().then(setUtenti); }, []);

  const utentiFiltrati = ricerca.trim()
    ? utenti.filter((u) => `${u.nome ?? ''} ${u.cognome ?? ''} ${u.email} ${u.citta ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : utenti;

  return (
    <div>
      <PanelHead titolo="Utenti" />
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o città..." />
      <TabellaGenerica
        righe={utentiFiltrati}
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
