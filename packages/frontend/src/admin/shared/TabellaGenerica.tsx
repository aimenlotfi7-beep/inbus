interface Colonna<T> {
  etichetta: string;
  render: (riga: T) => React.ReactNode;
}

export function TabellaGenerica<T extends { id: string }>({
  righe, colonne, onModifica, onElimina,
}: {
  righe: T[];
  colonne: Colonna<T>[];
  onModifica?: (riga: T) => void;
  onElimina?: (riga: T) => void;
}) {
  if (!righe.length) {
    return <p style={{ color: 'var(--mist)', padding: 20 }}>Nessun elemento ancora.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {colonne.map((c) => <th key={c.etichetta}>{c.etichetta}</th>)}
            {(onModifica || onElimina) && <th></th>}
          </tr>
        </thead>
        <tbody>
          {righe.map((riga) => (
            <tr key={riga.id}>
              {colonne.map((c) => <td key={c.etichetta}>{c.render(riga)}</td>)}
              {(onModifica || onElimina) && (
                <td style={{ whiteSpace: 'nowrap' }}>
                  {onModifica && <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5, marginRight: 6 }} onClick={() => onModifica(riga)}>Modifica</button>}
                  {onElimina && <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5, color: 'var(--pink)' }} onClick={() => onElimina(riga)}>Elimina</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
