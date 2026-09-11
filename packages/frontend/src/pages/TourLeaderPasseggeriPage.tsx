import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { controlloAccessiApi, tokenTourLeader, type BusAssegnato } from '../api/tourLeaderAuth';
import type { PasseggeroBus } from '../api/eventi';
import { TourLeaderLayout } from '../features/TourLeaderLayout';
import { formattaData, formattaDataOra } from '../shared/formato';

const colori = { testo: '#1f2430', tenue: '#6b7280', bordo: '#e3e5ea', primario: '#2563eb', errore: '#A31414', verde: '#15803d' };

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

  const pulsante = (primario: boolean) => ({
    padding: '8px 14px', borderRadius: 8, fontSize: 'var(--testo-md)', fontWeight: 600, cursor: 'pointer',
    border: primario ? 'none' : `1px solid ${colori.bordo}`, background: primario ? colori.primario : '#fff', color: primario ? '#fff' : colori.testo,
  });

  return (
    <TourLeaderLayout vocedAttiva="eventi">
      <button type="button" onClick={() => navigate('/scansione')} style={{ background: 'none', border: 'none', color: colori.primario, padding: 0, marginBottom: 10, cursor: 'pointer', fontSize: 'var(--testo-md)' }}>← I tuoi eventi</button>
      <h1 style={{ fontSize: 'var(--testo-3xl)', fontWeight: 700, color: colori.testo, margin: '0 0 4px' }}>Passeggeri</h1>
      <p style={{ color: colori.tenue, fontSize: 'var(--testo-base)', margin: '0 0 16px' }}>
        {bus ? `${bus.eventoArtista} · ${formattaData(bus.eventoData)} · Bus ${bus.riferimento}` : 'Il tuo bus'}
      </p>

      {errore && <p role="alert" style={{ color: colori.errore, marginBottom: 12 }}>{errore}</p>}
      {!dati && !errore && <p style={{ color: colori.tenue }}>Carico…</p>}

      {dati && !dati.disponibile && (
        <div style={{ background: '#fff', border: `1px solid ${colori.bordo}`, borderRadius: 12, padding: 16 }}>
          <p style={{ margin: 0, fontWeight: 600, color: colori.testo }}>La lista non è ancora pronta</p>
          <p style={{ margin: '6px 0 0', color: colori.tenue }}>
            I passeggeri vengono smistati sui bus per età il giorno prima della partenza{dati.disponibileDal ? `: la lista sarà qui dal ${formattaDataOra(dati.disponibileDal)}` : ''}.
          </p>
        </div>
      )}

      {dati?.disponibile && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 'var(--testo-lg)', fontWeight: 600, color: colori.testo }}>
              Saliti <span style={{ color: saliti === passeggeri.length && passeggeri.length > 0 ? colori.verde : colori.testo }}>{saliti}</span> su {passeggeri.length}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={pulsante(false)} onClick={() => navigate(`/scansione/bus/${busId}`)}>Scansiona biglietti</button>
              <button type="button" style={pulsante(true)} disabled={scaricando} onClick={scaricaPdf}>{scaricando ? 'Preparo il PDF…' : 'Scarica PDF'}</button>
            </div>
          </div>

          <input
            type="search" value={ricerca} onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca per nome, PNR o fermata" aria-label="Cerca un passeggero"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${colori.bordo}`, fontSize: 'var(--testo-base)', marginBottom: 12 }}
          />

          {passeggeri.length === 0 ? (
            <p style={{ color: colori.tenue }}>Nessun passeggero su questo bus.</p>
          ) : (
            <div style={{ background: '#fff', border: `1px solid ${colori.bordo}`, borderRadius: 12, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--testo-base)', color: colori.testo }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: colori.tenue, fontSize: 'var(--testo-sm)' }}>
                    <th style={{ padding: '10px 12px', width: 64 }}>Salito</th>
                    <th style={{ padding: '10px 12px' }}>Passeggero</th>
                    <th style={{ padding: '10px 12px' }}>Fermata</th>
                    <th style={{ padding: '10px 12px' }}>Telefono</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map((p) => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${colori.bordo}`, background: p.salito ? '#f0fdf4' : undefined }}>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="checkbox" checked={p.salito} disabled={inSalvataggio === p.id}
                          onChange={() => alternaSalito(p)}
                          aria-label={`${p.nome} ${p.cognome} è salito`}
                          style={{ width: 24, height: 24, cursor: 'pointer', accentColor: colori.verde }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontWeight: 600 }}>{p.cognome} {p.nome}</span>
                        <span style={{ display: 'block', color: colori.tenue, fontSize: 'var(--testo-sm)' }}>{p.pnr}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {p.fermata}
                        {p.orario && <span style={{ display: 'block', color: colori.tenue, fontSize: 'var(--testo-sm)' }}>{p.orario}</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {p.telefono ? <a href={`tel:${p.telefono}`} style={{ color: colori.primario }}>{p.telefono}</a> : <span style={{ color: colori.tenue }}>—</span>}
                      </td>
                    </tr>
                  ))}
                  {filtrati.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '12px', color: colori.tenue }}>Nessun passeggero corrisponde alla ricerca.</td></tr>
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
