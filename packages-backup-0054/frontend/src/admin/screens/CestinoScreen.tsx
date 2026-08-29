import { PanelHead } from '../shared/PanelHead';

export function CestinoScreen() {
  return (
    <div>
      <PanelHead titolo="Cestino" />
      <div style={{ background: 'var(--dusk)', border: '1px dashed var(--line)', borderRadius: 14, padding: 30, color: 'var(--mist)', fontSize: 13.5 }}>
        Il cestino non è ancora collegato: oggi eliminare un evento lo rimuove
        definitivamente dal database. Per un vero cestino serve aggiungere un
        campo "eliminatoIl" allo schema invece di cancellare la riga — vedi
        docs/MODULI-DA-COMPLETARE.md per i dettagli.
      </div>
    </div>
  );
}
