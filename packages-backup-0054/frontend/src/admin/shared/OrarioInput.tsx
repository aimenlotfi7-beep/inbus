import { useState, useEffect } from 'react';

/** Come <input type="time">, ma se scrivi solo l'ora (es. "18") e esci
 *  dal campo senza compilare i minuti, li imposta da sola a "00" invece
 *  di lasciare il valore vuoto/non valido — risparmia di dover scrivere
 *  ":00" ogni volta per gli orari in punto. */
export function OrarioInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [testo, setTesto] = useState(value);

  useEffect(() => setTesto(value), [value]);

  function normalizza(v: string): string {
    const pulito = v.trim().replace(/[^0-9:]/g, '');
    if (!pulito) return '';
    if (/^\d{1,2}$/.test(pulito)) {
      const ora = pulito.padStart(2, '0');
      return `${ora}:00`;
    }
    const match = pulito.match(/^(\d{1,2}):(\d{0,2})$/);
    if (match) {
      const ora = match[1].padStart(2, '0');
      const minuti = (match[2] || '00').padEnd(2, '0');
      return `${ora}:${minuti}`;
    }
    return v; // formato non riconosciuto: lascio così com'è, non forzo nulla
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder ?? 'HH:MM'}
      value={testo}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={() => {
        const norm = normalizza(testo);
        setTesto(norm);
        onChange(norm);
      }}
    />
  );
}
