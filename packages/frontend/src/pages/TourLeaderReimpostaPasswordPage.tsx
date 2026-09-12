import { ReimpostaPasswordGenerico } from '../features/ReimpostaPasswordGenerico';
import { tourLeaderAuthApi } from '../api/tourLeaderAuth';
import '../styles/account.css';
import '../styles/promoter.css';

export function TourLeaderReimpostaPasswordPage() {
  return (
    <ReimpostaPasswordGenerico
      onConferma={tourLeaderAuthApi.resetPassword}
      linkDopoSuccesso="/scansione/accedi"
      etichettaDopoSuccesso="Vai all'accesso"
      linkIndietro="/scansione/accedi"
      temaChiaro
      etichettaTipo="tour leader"
    />
  );
}
