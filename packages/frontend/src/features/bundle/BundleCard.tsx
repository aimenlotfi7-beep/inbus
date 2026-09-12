import type { BundlePubblico } from '../../api/bundle';
import { CardBase, formattaDataCard, inizialiDi, type FormatoCard } from '../eventi/EventoCard';
import { Icona } from '../Icone';

/** "sab 1 nov 2026", più "alle 18:00" solo se la vendita non parte a
 *  mezzanotte (ora di Roma). */
function testoInizioVendita(iso: string): string {
  const ora = new Date(iso).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
  return ora === '00:00' ? formattaDataCard(iso) : `${formattaDataCard(iso)} alle ${ora}`;
}

/** Card di un bundle nell'elenco e in home: stesso CardBase della card
 *  evento, con kicker "Bundle", la riga tipo · sconto, lo stato della
 *  vendita e "Scopri" al posto del prezzo (l'elenco pubblico non porta
 *  né il numero di eventi né un prezzo calcolabile). */
export function BundleCard({ bundle, formato, priorita }: { bundle: BundlePubblico; formato?: FormatoCard; priorita?: boolean }) {
  const sconto = Number(bundle.scontoPercentuale);
  const scontoTesto = Number.isFinite(sconto) && sconto > 0 ? ` · −${sconto.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%` : '';
  const righe = (
    <>
      <span className="card-riga">
        <Icona nome="spunta" dimensione={16} />
        <span>{bundle.tipo === 'FISSO' ? 'Pacchetto fisso' : 'Scegli tu gli eventi'}{scontoTesto}</span>
      </span>
      {bundle.stato === 'PROGRAMMATO' && bundle.inizioVendita && (
        <span className="card-riga">
          <Icona nome="orologio" dimensione={16} />
          <span>In vendita dal {testoInizioVendita(bundle.inizioVendita)}</span>
        </span>
      )}
      {bundle.stato === 'VENDITA_TERMINATA' && (
        <span className="card-riga">
          <Icona nome="orologio" dimensione={16} />
          <span>Vendita terminata</span>
        </span>
      )}
    </>
  );
  return (
    <CardBase
      href={`/bundle/${bundle.slug}`}
      formato={formato}
      priorita={priorita}
      immagine={bundle.copertinaUrl}
      alt={bundle.nome}
      iniziali={inizialiDi(bundle.nome)}
      kicker="Bundle"
      titolo={bundle.nome}
      righe={righe}
      cta="Scopri"
    />
  );
}
