import { ReimpostaPasswordGenerico } from '../features/ReimpostaPasswordGenerico';
import { promoterApi } from '../api/promoter';
import '../styles/account.css';
import '../styles/promoter.css';

export function PromoterReimpostaPasswordPage() {
  return (
    <ReimpostaPasswordGenerico
      onConferma={promoterApi.resetPassword}
      linkDopoSuccesso="/promoter"
      etichettaDopoSuccesso="Vai all'accesso"
      linkIndietro="/promoter"
      temaChiaro
      etichettaTipo="promoter"
    />
  );
}
