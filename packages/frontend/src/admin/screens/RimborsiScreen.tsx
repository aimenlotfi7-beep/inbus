import { useEffect, useState } from 'react';
import { richiesteRimborsoApi, type RichiestaRimborso } from '../../api/richiesteRimborso';
import { PanelHead } from '../shared/PanelHead';
import { notifica } from '../shared/notifiche';
import { conferma, confermaConTesto } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { formattaData, formattaDataOra, formattaEuro } from '../../shared/formato';

const ETICHETTA_STATO: Record<RichiestaRimborso['stato'], { testo: string; classe: string }> = {
  IN_ATTESA: { testo: 'In attesa', classe: 'attenzione' },
  APPROVATA: { testo: 'Approvata', classe: 'coperta' },
  RIFIUTATA: { testo: 'Rifiutata', classe: 'non-coperta' },
};

/** Richieste di rimborso inviate dai clienti dalla loro area personale
 *  — il cliente non può più cancellare da solo la prenotazione, passa
 *  sempre da qui. Approvando: la prenotazione viene cancellata per
 *  davvero (posti restituiti) e l'eventuale credito fedeltà già
 *  maturato da quel viaggio viene tolto. In entrambi i casi il cliente
 *  riceve un'email con l'esito. */
export function RimborsiScreen() {
  const [lista, setLista] = useState<RichiestaRimborso[] | null>(null);
  const [erroreLista, setErroreLista] = useState('');
  const [soloInAttesa, setSoloInAttesa] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState('TUTTE');
  const [inCorsoId, setInCorsoId] = useState<string | null>(null);

  function ricarica() {
    richiesteRimborsoApi.list()
      .then((l) => { setLista(l); setErroreLista(''); })
      .catch((e) => setErroreLista(`Impossibile caricare le richieste di rimborso: ${motivoErrore(e)}`));
  }
  useEffect(ricarica, []);

  async function approva(r: RichiestaRimborso) {
    const ok = await conferma({
      titolo: 'Approvare il rimborso?',
      testo: <>PNR <b>{r.pnr}</b> ({formattaEuro(r.prenotazioneTotale)}): la prenotazione viene cancellata e i posti tornano disponibili, l'eventuale credito fedeltà maturato viene tolto e il cliente riceve un'email di conferma del rimborso.</>,
      conferma: 'Approva rimborso',
    });
    if (!ok) return;
    setInCorsoId(r.id);
    try {
      const { clienteAvvisato } = await richiesteRimborsoApi.approva(r.id);
      notifica(clienteAvvisato
        ? 'Rimborso approvato: il cliente è stato avvisato via email.'
        : "Rimborso approvato, ma l'email al cliente non è partita: avvisalo tu.", clienteAvvisato ? 'successo' : 'errore');
      ricarica();
    } catch (e) {
      notifica(`Approvazione non riuscita: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorsoId(null);
    }
  }
  async function rifiuta(r: RichiestaRimborso) {
    const motivo = await confermaConTesto({
      titolo: 'Rifiutare il rimborso?',
      testo: <>PNR <b>{r.pnr}</b>: la prenotazione resta valida e il cliente riceve un'email con il rifiuto.</>,
      conferma: 'Rifiuta rimborso',
      pericolosa: true,
      // Prima diceva "visibile solo internamente": ora il motivo finisce
      // nell'email al cliente, e chi lo scrive deve saperlo.
      campoTesto: { etichetta: "Motivo (facoltativo): lo legge il cliente nell'email", placeholder: 'es. richiesta arrivata oltre i termini' },
    });
    if (motivo === null) return;
    setInCorsoId(r.id);
    try {
      const { clienteAvvisato } = await richiesteRimborsoApi.rifiuta(r.id, motivo.trim() || undefined);
      notifica(clienteAvvisato
        ? 'Rimborso rifiutato: il cliente è stato avvisato via email.'
        : "Rimborso rifiutato, ma l'email al cliente non è partita: avvisalo tu.", clienteAvvisato ? 'successo' : 'errore');
      ricarica();
    } catch (e) {
      notifica(`Rifiuto non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setInCorsoId(null);
    }
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
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ maxWidth: 220 }} aria-label="Filtra per categoria">
            <option value="TUTTE">Tutte le categorie</option>
            {categorieDisponibili.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {erroreLista && (
        <div style={{ marginBottom: 16 }}>
          <p className="testo-intro" style={{ color: 'var(--pink)' }}>{erroreLista}</p>
          <button type="button" className="btn btn-ghost" onClick={ricarica}>Riprova</button>
        </div>
      )}
      {!erroreLista && lista === null && <p className="testo-intro">Carico…</p>}
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
                    <span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>
                      {formattaData(r.eventoData)}{r.eventoCategoria ? ` · ${r.eventoCategoria}` : ''}
                    </span>
                  </td>
                  <td>{r.clienteNome} {r.clienteCognome ?? ''}<br /><span style={{ color: 'var(--mist)', fontSize: 'var(--testo-sm)' }}>{r.clienteEmail}</span></td>
                  <td style={{ textAlign: 'right' }}><b>{formattaEuro(r.prenotazioneTotale)}</b></td>
                  <td style={{ maxWidth: 260 }}>{r.motivo || <span style={{ color: 'var(--mist)' }}>—</span>}</td>
                  <td>{formattaDataOra(r.richiestaIl)}</td>
                  <td>
                    <span className={`badge ${ETICHETTA_STATO[r.stato].classe}`}>{ETICHETTA_STATO[r.stato].testo}</span>
                    {r.stato === 'RIFIUTATA' && r.noteAdmin && <span style={{ display: 'block', color: 'var(--mist)', fontSize: 'var(--testo-sm)', marginTop: 4 }}>Motivo: {r.noteAdmin}</span>}
                  </td>
                  <td>
                    {r.stato === 'IN_ATTESA' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-primary btn-piccolo" disabled={!!inCorsoId} onClick={() => approva(r)}>{inCorsoId === r.id ? 'Attendi…' : 'Approva'}</button>
                        <button type="button" className="btn btn-ghost btn-piccolo" style={{ color: 'var(--pink)' }} disabled={!!inCorsoId} onClick={() => rifiuta(r)}>Rifiuta</button>
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
