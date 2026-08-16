/** Campo di ricerca grande e centrato, stesso stile della ricerca nella
 *  Home del gestionale — da mettere in cima alle sezioni con un elenco,
 *  per filtrare i dati di quella sezione (non è la ricerca globale). */
export function RicercaSezione({ valore, onChange, placeholder }: { valore: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="home-search-center" style={{ maxWidth: 560, margin: '0 auto 28px' }}>
      <div className="home-search-box">
        <input
          type="text"
          placeholder={placeholder ?? 'Inizia a digitare per cercare...'}
          value={valore}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
