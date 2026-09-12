import { ReimpostaPasswordGenerico } from '../features/ReimpostaPasswordGenerico';
import { organizzatoriApi } from '../api/organizzatori';
import '../styles/account.css';
import '../styles/promoter.css';

export function OrganizzatoreReimpostaPasswordPage() {
  return (
    <ReimpostaPasswordGenerico
      onConferma={organizzatoriApi.resetPassword}
      linkDopoSuccesso="/organizzatore"
      etichettaDopoSuccesso="Vai all'accesso"
      linkIndietro="/organizzatore"
      temaChiaro
      etichettaTipo="organizzatore"
    />
  );
}
