import { useEffect, useState } from 'react';
import { richiesteRimborsoApi, type RichiestaRimborso } from '../../api/richiesteRimborso';
import { PanelHead } from '../shared/PanelHead';

const ETICHETTA_STATO: Record<RichiestaRimborso['stato'], { testo: string; classe: string }> = {
  IN_ATTESA: { testo: 'In attesa', classe: 'attenzione' },
  APPROVATA: { testo: 'Approvata', classe: 'coperta' },
  RIFIUTATA: { testo: 'Rifiutata', classe: 'non-coperta' },
};

/** Richieste di rimborso inviate dai clienti dalla loro area personale
 *  — il cliente non può più cancellare da solo la prenotazione, passa
 *  sempre da qui. Approvando: la prenotazione viene cancellata per
 *  davvero (posti restituiti) e l'eventuale credito fedeltà già
 *  maturato da quel viaggio viene tolto. */
export function RimborsiScreen() {
  const [lista, setLista] = useState<RichiestaRimborso[] | null>(null);
  const [soloInAttesa, setSoloInAttesa] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState('TUTTE');

  function ricarica() {
    richiesteRimborsoApi.list().then(setLista);
  }
  useEffect(ricarica, []);

  async function approva(r: RichiestaRimborso) {
    if (!confirm(`Approvare il rimborso per PNR ${r.pnr}? La prenotazione verrà cancellata per davvero (posti restituiti) e l'eventuale credito fedeltà già maturato verrà tolto.`)) return;
    await richiesteRimborsoApi.approva(r.id);
    ricarica();
  }
  async function rifiuta(r: RichiestaRimborso) {
    const nota = prompt('Motivo del rifiuto (facoltativo, visibile solo internamente):') ?? undefined;
    await richiesteRimborsoApi.rifiuta(r.id, nota);
    ricarica();
  }

  // Le categorie sono libere/dinamiche (gestite in Contenuti sito) —
  // costruisco l'elenco da quelle DAVVERO presenti tra le richieste
  // caricate, invece di richiamare a parte l'intera anagrafica: niente
  // voci vuote nel filtro per categorie senza nessuna richiesta.
  const categorieDisponibili = Array.from(new Set((lista ?? []).map((r) => r.eventoCategoria).filter((c): c is string => !!c))).sort();
  const filtrata = (lista ?? []).filter((r) =>
    (!soloInAttesa || r.stato === 'IN_ATTESA')
    && (filtroCategoria === 'TUTTE' || r.eventoCategoria === filtroCategoria)
  );

  return (
    <div>
      <PanelHead titolo="Richieste di rimborso" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="mini-tabs">
          <button type="button" className={`mini-tab${soloInAttesa ? ' active' : ''}`} onClick={() => setSoloInAttesa(true)}>Da gestire</button>
          <button type="button" className={`mini-tab${!soloInAttesa ? ' active' : ''}`} onClick={() => setSoloInAttesa(false)}>Tutte</button>
        </div>
        {categorieDisponibili.length > 0 && (
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="TUTTE">Tutte le categorie</option>
            {categorieDisponibili.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {lista === null && <p className="testo-intro">Carico...</p>}
      {lista !== null && filtrata.length === 0 && (
        <p className="testo-intro">
          Nessuna richiesta {soloInAttesa ? 'da gestire' : 'ancora'}{filtroCategoria !== 'TUTTE' ? ` nella categoria "${filtroCategoria}"` : ''}.
        </p>
      )}

      {filtrata.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>PNR</th>
                <th>Evento</th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Totale</th>
                <th>Motivo del cliente</th>
                <th>Richiesta il</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrata.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.pnr}</b></td>
                  <td>
                    {r.eventoArtista}<br />
                    <span style={{ color: 'var(--mist)', fontSize: 12 }}>
                      {new Date(r.eventoData).toLocaleDateString('it-IT')}{r.eventoCategoria ? ` · ${r.eventoCategoria}` : ''}
                    </span>
                  </td>
                  <td>{r.clienteNome} {r.clienteCognome ?? ''}<br /><span style={{ color: 'var(--mist)', fontSize: 12 }}>{r.clienteEmail}</span></td>
                  <td style={{ textAlign: 'right' }}><b>€{Number(r.prenotazioneTotale).toFixed(2)}</b></td>
                  <td style={{ maxWidth: 260 }}>{r.motivo || <span style={{ color: 'var(--mist)' }}>—</span>}</td>
                  <td>{new Date(r.richiestaIl).toLocaleString('it-IT')}</td>
                  <td><span className={`badge ${ETICHETTA_STATO[r.stato].classe}`}>{ETICHETTA_STATO[r.stato].testo}</span></td>
                  <td>
                    {r.stato === 'IN_ATTESA' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => approva(r)}>Approva</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--pink)' }} onClick={() => rifiuta(r)}>Rifiuta</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
