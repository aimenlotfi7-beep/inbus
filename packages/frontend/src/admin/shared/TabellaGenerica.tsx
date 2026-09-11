import { Fragment } from 'react';

interface Colonna<T> {
  etichetta: string;
  render: (riga: T) => React.ReactNode;
  // Classe su intestazione e celle della colonna: con "solo-largo" o
  // "solo-stretto" la colonna compare solo quando la tabella ha (o non
  // ha) spazio — vedi .table-scroll.adattiva in gestionale.css.
  classe?: string;
}

export function TabellaGenerica<T extends { id: string }>({
  righe, colonne, onModifica, onElimina, gruppo,
}: {
  righe: T[];
  colonne: Colonna<T>[];
  onModifica?: (riga: T) => void;
  onElimina?: (riga: T) => void;
  // Titoletto di gruppo di ogni riga (es. la regione). Le righe vanno
  // passate già in ordine di gruppo: il titoletto compare ogni volta che
  // il gruppo cambia, dentro la stessa tabella, così le colonne restano
  // allineate tra un gruppo e l'altro.
  gruppo?: (riga: T) => string;
}) {
  if (!righe.length) {
    return <p style={{ color: 'var(--mist)', padding: 20 }}>Nessun elemento ancora.</p>;
  }
  const conAzioni = !!(onModifica || onElimina);
  const adattiva = colonne.some((c) => c.classe);
  return (
    <div className={adattiva ? 'table-scroll adattiva' : 'table-scroll'}>
      <table className="data-table">
        <thead>
          <tr>
            {colonne.map((c) => <th key={c.etichetta} className={c.classe}>{c.etichetta}</th>)}
            {conAzioni && <th></th>}
          </tr>
        </thead>
        <tbody>
          {righe.map((riga, i) => {
            const titoloGruppo = gruppo?.(riga);
            const nuovoGruppo = gruppo !== undefined && (i === 0 || gruppo(righe[i - 1]) !== titoloGruppo);
            return (
              <Fragment key={riga.id}>
                {nuovoGruppo && (
                  <tr className="riga-gruppo">
                    <th scope="colgroup" colSpan={colonne.length + (conAzioni ? 1 : 0)}>{titoloGruppo}</th>
                  </tr>
                )}
                <tr>
                  {colonne.map((c) => <td key={c.etichetta} className={c.classe}>{c.render(riga)}</td>)}
                  {conAzioni && (
                    <td className="azioni-riga">
                      {onModifica && <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 'var(--testo-sm)', marginRight: 6 }} onClick={() => onModifica(riga)}>Modifica</button>}
                      {onElimina && <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 'var(--testo-sm)', color: 'var(--pink)' }} onClick={() => onElimina(riga)}>Elimina</button>}
                    </td>
                  )}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
