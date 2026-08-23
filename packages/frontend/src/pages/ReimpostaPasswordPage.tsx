import { ReimpostaPasswordGenerico } from '../features/ReimpostaPasswordGenerico';
import { clienteAuthApi } from '../api/clienteAuth';
import '../styles/account.css';

export function ReimpostaPasswordPage() {
  return (
    <ReimpostaPasswordGenerico
      onConferma={clienteAuthApi.resetPassword}
      linkDopoSuccesso="/accedi"
      etichettaDopoSuccesso="Vai al login"
      linkIndietro="/accedi"
    />
  );
}
