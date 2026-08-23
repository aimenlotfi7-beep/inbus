import { useEffect, useState, type InputHTMLAttributes } from 'react';

/** Come un normale campo numerico, ma senza il fastidioso bug per cui
 *  cancellando lo zero il campo ci torna subito da solo (perché ogni
 *  tasto veniva trasformato in numero all'istante, e "" diventa 0) —
 *  qui si può scrivere/cancellare liberamente, il valore numerico vero
 *  viene calcolato solo quando serve davvero. Passare `valuta` mostra
 *  il simbolo € a sinistra. */
export function CampoNumero({
  value, onChange, valuta, style, ...resto
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  valuta?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [testo, setTesto] = useState(value !== undefined && value !== null ? String(value) : '');

  // Se il valore arriva cambiato dall'esterno (es. caricamento di un
  // evento esistente), aggiorno il testo mostrato di conseguenza.
  useEffect(() => {
    setTesto(value !== undefined && value !== null ? String(value) : '');
  }, [value]);

  function gestisciCambio(v: string) {
    setTesto(v);
    if (v.trim() === '' || v === '-') { onChange(undefined); return; }
    const n = Number(v.replace(',', '.'));
    if (!Number.isNaN(n)) onChange(n);
  }

  return (
    <div style={{ position: 'relative', ...(style as object) }}>
      {valuta && (
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: .55, pointerEvents: 'none', fontSize: 14 }}>
          €
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={testo}
        onChange={(e) => gestisciCambio(e.target.value)}
        style={valuta ? { paddingLeft: 26, width: '100%' } : { width: '100%' }}
        {...resto}
      />
    </div>
  );
}
