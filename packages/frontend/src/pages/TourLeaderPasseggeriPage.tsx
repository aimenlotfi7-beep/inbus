import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { controlloAccessiApi, tokenTourLeader, type BusAssegnato } from '../api/tourLeaderAuth';
import type { PasseggeroBus } from '../api/eventi';
import { TourLeaderLayout } from '../features/TourLeaderLayout';
import { formattaData, formattaDataOra } from '../shared/formato';

/** La lista dei passeggeri del bus del tour leader: una tabella con una
 *  casella per segnare chi è salito (la stessa spunta della scansione del
 *  biglietto) e il PDF da scaricare o stampare. È disponibile dal giorno
 *  prima della partenza, quando i passeggeri sono già stati smistati sui
 *  bus per età: prima non si sa ancora chi viaggia su quale bus. */
export function TourLeaderPasseggeriPage() {
  const { busId = '' } = useParams();
  const navigate = useNavigate();
  const [bus, setBus] = useState<BusAssegnato | null>(null);
  const [dati, setDati] = useState<{ disponibile: boolean; disponibileDal: string | null; passeggeri: PasseggeroBus[] } | null>(null);
  const [errore, setErrore] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [inSalvataggio, setInSalvataggio] = useState<string | null>(null);
  const [scaricando, setScaricando] = useState(false);

  useEffect(() => {
    if (!tokenTourLeader()) { navigate('/scansione/accedi'); return; }
    controlloAccessiApi.busAssegnati()
      .then((elenco) => setBus(elenco.find((b) => b.busId === busId) ?? null))
      .catch(() => setBus(null));
    controlloAccessiApi.listaPasseggeri(busId)
      .then(setDati)
      .catch((e) => setErrore(e instanceof Error ? e.message : 'Impossibile caricare la lista dei passeggeri.'));
  }, [busId, navigate]);

  async function alternaSalito(p: PasseggeroBus) {
    if (!dati || inSalvataggio) return;
    const nuovo = !p.salito;
    // Spunta subito, così sul bus non si aspetta la rete; se non va a buon
    // fine si torna indietro e lo si dice.
    setDati({ ...dati, passeggeri: dati.passeggeri.map((x) => (x.id === p.id ? { ...x, salito: nuovo } : x)) });
    setInSalvataggio(p.id);
    setErrore('');
    try {
      const { salito } = await controlloAccessiApi.segnaSalito(busId, p.id, nuovo);
      setDati((d) => d && { ...d, passeggeri: d.passeggeri.map((x) => (x.id === p.id ? { ...x, salito } : x)) });
    } catch (e) {
      setDati((d) => d && { ...d, passeggeri: d.passeggeri.map((x) => (x.id === p.id ? { ...x, salito: p.salito } : x)) });
      setErrore(`Non sono riuscito a segnare ${p.nome} ${p.cognome}: ${e instanceof Error ? e.message : 'controlla la connessione e riprova.'}`);
    } finally {
      setInSalvataggio(null);
    }
  }

  async function scaricaPdf() {
    setScaricando(true);
    setErrore('');
    try {
      const file = await controlloAccessiApi.scaricaPdfPasseggeri(busId);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `passeggeri-${(bus?.riferimento ?? 'bus').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrore(`Download non riuscito: ${e instanceof Error ? e.message : 'controlla la connessione e riprova.'}`);
    } finally {
      setScaricando(false);
    }
  }

  const passeggeri = dati?.passeggeri ?? [];
  const testoRicerca = ricerca.trim().toLowerCase();
  const filtrati = testoRicerca
    ? passeggeri.filter((p) => `${p.nome} ${p.cognome} ${p.pnr} ${p.fermata}`.toLowerCase().includes(testoRicerca))
    : passeggeri;
  const saliti = passeggeri.filter((p) => p.salito).length;

  return (
    <TourLeaderLayout vocedAttiva="eventi">
      <button type="button" className="btn btn-tertiary tl-indietro" onClick={() => navigate('/scansione')}>← I tuoi eventi</button>
      <h1 className="page-title">Passeggeri</h1>
      <p className="tl-intro">
        {bus ? `${bus.eventoArtista} · ${formattaData(bus.eventoData)} · Bus ${bus.riferimento}` : 'Il tuo bus'}
      </p>

      {errore && <p className="avviso avviso-errore tl-errore" role="alert">{errore}</p>}
      {!dati && !errore && <p className="tl-nota" role="status">Carico…</p>}

      {dati && !dati.disponibile && (
        <div className="tl-card">
          <p className="tl-card-titolo">La lista non è ancora pronta</p>
          <p className="tl-nota">
            I passeggeri vengono smistati sui bus per età il giorno prima della partenza{dati.disponibileDal ? `: la lista sarà qui dal ${formattaDataOra(dati.disponibileDal)}` : ''}.
          </p>
        </div>
      )}

      {dati?.disponibile && (
        <>
          <div className="tl-azioni-testata">
            <p className="tl-contatore">
              Saliti <b className={saliti === passeggeri.length && passeggeri.length > 0 ? 'completo' : undefined}>{saliti}</b> su {passeggeri.length}
            </p>
            <div className="tl-azioni">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/scansione/bus/${busId}`)}>Scansiona biglietti</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={scaricando} onClick={scaricaPdf}>{scaricando ? 'Preparo il PDF…' : 'Scarica PDF'}</button>
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="tl-filtra">Cerca un passeggero</label>
            <input
              id="tl-filtra" className="campo-input" type="search" value={ricerca} onChange={(e) => setRicerca(e.target.value)}
              placeholder="Nome, PNR o fermata" autoComplete="off"
            />
          </div>

          {passeggeri.length === 0 ? (
            <p className="tl-nota">Nessun passeggero su questo bus.</p>
          ) : (
            <div className="tl-tabella-box">
              <table className="tl-tabella">
                <thead>
                  <tr>
                    <th>Salito</th>
                    <th>Passeggero</th>
                    <th>Fermata</th>
                    <th>Telefono</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map((p) => (
                    <tr key={p.id} className={p.salito ? 'salito' : undefined}>
                      <td>
                        <input
                          type="checkbox" className="tl-check" checked={p.salito} disabled={inSalvataggio === p.id}
                          onChange={() => alternaSalito(p)}
                          aria-label={`${p.nome} ${p.cognome} è salito`}
                        />
                      </td>
                      <td>
                        <b>{p.cognome} {p.nome}</b>
                        <span className="secondaria">{p.pnr}</span>
                      </td>
                      <td>
                        {p.fermata}
                        {p.orario && <span className="secondaria">{p.orario}</span>}
                      </td>
                      <td>
                        {p.telefono ? <a href={`tel:${p.telefono}`}>{p.telefono}</a> : <span className="secondaria">—</span>}
                      </td>
                    </tr>
                  ))}
                  {filtrati.length === 0 && (
                    <tr><td colSpan={4}><span className="secondaria">Nessun passeggero corrisponde alla ricerca.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </TourLeaderLayout>
  );
}
