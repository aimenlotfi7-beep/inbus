import { RichiediResetGenerico } from '../features/RichiediResetGenerico';
import { organizzatoriApi } from '../api/organizzatori';
import '../styles/account.css';
import '../styles/promoter.css';

export function OrganizzatorePasswordDimenticataPage() {
  return (
    <RichiediResetGenerico
      onRichiedi={organizzatoriApi.richiediReset}
      linkIndietro="/organizzatore"
      temaChiaro
      etichettaTipo="organizzatore"
    />
  );
}
