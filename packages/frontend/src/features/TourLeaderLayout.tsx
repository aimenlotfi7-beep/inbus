import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { nomeTourLeader, logoutTourLeader } from '../api/tourLeaderAuth';
import { AccountShell } from './AccountShell';
import '../styles/promoter.css';

const ROTTA_PER_VOCE: Record<string, string> = {
  cerca: '/scansione/cerca',
  eventi: '/scansione',
};

/** Stesso componente condiviso di promoter/organizzatore (AccountShell)
 *  — qui le "voci" sono pagine vere (route diverse), non sezioni
 *  interne, quindi cambiare voce naviga invece di cambiare stato. */
export function TourLeaderLayout({ vocedAttiva, children }: { vocedAttiva: 'cerca' | 'eventi'; children: ReactNode }) {
  const navigate = useNavigate();

  function esci() {
    logoutTourLeader();
    navigate('/scansione/accedi');
  }

  return (
    <AccountShell
      etichettaTipo="tour leader" nomeUtente={nomeTourLeader()} onLogout={esci} temaChiaro
      voci={[{ id: 'cerca', label: 'Cerca' }, { id: 'eventi', label: 'Eventi' }]}
      voceAttiva={vocedAttiva}
      onCambiaVoce={(v) => navigate(ROTTA_PER_VOCE[v])}
    >
      {children}
    </AccountShell>
  );
}
