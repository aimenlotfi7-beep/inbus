export function PanelHead({ titolo, azione }: { titolo: string; azione?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <h2>{titolo}</h2>
      {azione}
    </div>
  );
}
