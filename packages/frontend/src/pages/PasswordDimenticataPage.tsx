import { RichiediResetGenerico } from '../features/RichiediResetGenerico';
import { clienteAuthApi } from '../api/clienteAuth';
import '../styles/account.css';

export function PasswordDimenticataPage() {
  return <RichiediResetGenerico onRichiedi={clienteAuthApi.richiediReset} linkIndietro="/accedi" />;
}
