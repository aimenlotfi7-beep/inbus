import { RichiediResetGenerico } from '../features/RichiediResetGenerico';
import { promoterApi } from '../api/promoter';
import '../styles/account.css';
import '../styles/promoter.css';

export function PromoterPasswordDimenticataPage() {
  return (
    <RichiediResetGenerico
      onRichiedi={promoterApi.richiediReset}
      linkIndietro="/promoter"
      temaChiaro
      etichettaTipo="promoter"
    />
  );
}
