import { RichiediResetGenerico } from '../features/RichiediResetGenerico';
import { tourLeaderAuthApi } from '../api/tourLeaderAuth';
import '../styles/account.css';
import '../styles/promoter.css';

export function TourLeaderPasswordDimenticataPage() {
  return (
    <RichiediResetGenerico
      onRichiedi={tourLeaderAuthApi.richiediReset}
      linkIndietro="/scansione/accedi"
      temaChiaro
      etichettaTipo="tour leader"
    />
  );
}
