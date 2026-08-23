import { InfoTooltip } from './InfoTooltip';

export function PanelHead({ titolo, azione, info }: { titolo: string; azione?: React.ReactNode; info?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <h2>{titolo}{info && <InfoTooltip>{info}</InfoTooltip>}</h2>
      {azione}
    </div>
  );
}
