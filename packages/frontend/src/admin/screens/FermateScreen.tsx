import { useEffect, useState } from 'react';
import { fermateAnagraficaApi, type FermataAnagrafica, type FermataAnagraficaInput } from '../../api/fermateAnagrafica';
import { percorsiSalvatiApi } from '../../api/percorsiSalvati';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { Modale } from '../shared/Modale';
import { EtichettaTooltip } from '../shared/EtichettaTooltip';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';
import { geocodifica } from '../shared/geo';
import { MappaPuntiFermate, type CategoriaTesta } from '../shared/MappaPuntiFermate';

const VUOTA: FermataAnagraficaInput = { nome: '', citta: '', indirizzo: '', lat: undefined, lng: undefined, note: '', link: '' };

/**
 * L'anagrafica delle fermate: il luogo fisico, a se' stante da come
 * viene poi usato in un tragitto. Una voce qui si sceglie da un
 * elenco componendo un tragitto in un evento, invece di riscrivere
 * ogni volta citta'/indirizzo/coordinate, e resta riutilizzabile su
 * quanti eventi vuoi. Modificarla qui non tocca mai i tragitti che la
 * usano gia' (tengono la propria copia dei dati, presa al momento
 * della scelta).
 */
export function FermateScreen() {
  const mappaTooltip = useMappaTooltip();
  const [tab, setTab] = useState<'elenco' | 'cartina'>('elenco');
  const [fermate, setFermate] = useState<FermataAnagrafica[]>([]);
  // Serve solo per la cartina — capire se una fermata è Testa sempre/
  // mai/a volte richiede di guardare TUTTI i Percorsi Salvati che la
  // usano, non ha senso caricarli finché non si apre quella tab.
  const [percorsiSalvati, setPercorsiSalvati] = useState<Awaited<ReturnType<typeof percorsiSalvatiApi.list>> | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [inModifica, setInModifica] = useState<FermataAnagrafica | null>(null);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [form, setForm] = useState<FermataAnagraficaInput>(VUOTA);
  const [salvando, setSalvando] = useState(false);

  function ricarica() {
    fermateAnagraficaApi.list().then(setFermate);
  }
  useEffect(ricarica, []);
  useEffect(() => {
    if (tab === 'cartina' && percorsiSalvati === null) percorsiSalvatiApi.list().then(setPercorsiSalvati);
  }, [tab, percorsiSalvati]);

  function apriNuova() {
    setInModifica(null);
    setForm(VUOTA);
    setModaleAperta(true);
  }
  function apriModifica(f: FermataAnagrafica) {
    setInModifica(f);
    setForm({ nome: f.nome, citta: f.citta, indirizzo: f.indirizzo, lat: f.lat, lng: f.lng, note: f.note ?? '', link: f.link ?? '' });
    setModaleAperta(true);
  }

  async function salva() {
    if (!form.nome.trim() || !form.citta.trim() || !form.indirizzo.trim()) {
      alert('Nome, citta e indirizzo sono obbligatori.');
      return;
    }
    setSalvando(true);
    try {
      // Se non sono già state scritte a mano, le calcolo da sole prima
      // di salvare — evita fermate senza coordinate per distrazione
      // (il problema trovato con "Piacenza Sud": creata senza, poi
      // sparita dal punto giusto sulla cartina). Se la ricerca non
      // trova nulla, si salva comunque senza — meglio una fermata
      // senza coordinate che bloccare il salvataggio.
      let formDaSalvare = form;
      if (form.lat == null || form.lng == null) {
        const risultato = await geocodifica(`${form.indirizzo}, ${form.citta}`);
        if (risultato.coordinate) formDaSalvare = { ...form, lat: risultato.coordinate.lat, lng: risultato.coordinate.lng };
      }
      if (inModifica) await fermateAnagraficaApi.update(inModifica.id, formDaSalvare);
      else await fermateAnagraficaApi.create(formDaSalvare);
      setModaleAperta(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : 'Impossibile salvare. Riprova.');
    } finally {
      setSalvando(false);
    }
  }

  async function elimina(f: FermataAnagrafica) {
    if (!confirm('Eliminare "' + f.nome + '"?')) return;
    try {
      await fermateAnagraficaApi.remove(f.id);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? e.message : 'Impossibile eliminare. Riprova.');
    }
  }

  const fermateFiltrate = ricerca.trim()
    ? fermate.filter((f) => (f.nome + ' ' + f.citta + ' ' + f.indirizzo).toLowerCase().includes(ricerca.trim().toLowerCase()))
    : fermate;

  // Per ogni fermata dell'anagrafica: guarda TUTTI i Percorsi Salvati
  // che la usano — se compare SEMPRE come Testa (prima o ultima
  // posizione), SEMPRE come intermedia, o A VOLTE l'una a volte
  // l'altra (usata in percorsi diversi con ruoli diversi). Una
  // fermata mai usata in nessun percorso finisce nella stessa
  // categoria "mai" — non ha nessuna occorrenza da Testa, appunto.
  const usoPerFermata = new Map<string, { testa: boolean; intermedia: boolean }>();
  if (percorsiSalvati) {
    for (const p of percorsiSalvati) {
      p.fermate.forEach((f, idx) => {
        if (!f.fermataAnagraficaId) return;
        const eTesta = idx === 0 || idx === p.fermate.length - 1;
        const stato = usoPerFermata.get(f.fermataAnagraficaId) ?? { testa: false, intermedia: false };
        if (eTesta) stato.testa = true; else stato.intermedia = true;
        usoPerFermata.set(f.fermataAnagraficaId, stato);
      });
    }
  }
  function categoriaDi(id: string): CategoriaTesta {
    const stato = usoPerFermata.get(id);
    if (!stato) return 'mai';
    if (stato.testa && stato.intermedia) return 'a-volte';
    return stato.testa ? 'sempre' : 'mai';
  }

  return (
    <div>
      <PanelHead
        titolo="Fermate"
        info={mappaTooltip.fermate_intro ?? TOOLTIP_DEFAULT.fermate_intro}
        azione={tab === 'elenco' && <button className="btn btn-primary" onClick={apriNuova}>+ Nuova fermata</button>}
      />
      <div className="mini-tabs" style={{ marginBottom: 18 }}>
        <button type="button" className={`mini-tab${tab === 'elenco' ? ' active' : ''}`} onClick={() => setTab('elenco')}>Elenco</button>
        <button type="button" className={`mini-tab${tab === 'cartina' ? ' active' : ''}`} onClick={() => setTab('cartina')}>Cartina</button>
      </div>

      {tab === 'cartina' ? (
        percorsiSalvati === null ? (
          <p style={{ color: 'var(--mist)' }}>Carico i percorsi per capire quali fermate sono Testa...</p>
        ) : (
          <MappaPuntiFermate
            punti={fermate.map((f) => ({
              id: f.id, etichetta: `${f.nome} — ${f.citta}`, citta: f.citta, indirizzo: f.indirizzo,
              lat: f.lat, lng: f.lng, categoria: categoriaDi(f.id),
            }))}
          />
        )
      ) : (
      <>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, città o indirizzo..." />

      {fermateFiltrate.length === 0 ? (
        <p className="testo-intro">
          {ricerca ? 'Nessuna fermata trovata.' : 'Nessuna fermata in anagrafica ancora.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fermateFiltrate.map((f) => (
            <button
              key={f.id}
              type="button"
              className="riga-cliccabile"
              style={{ textAlign: 'left', border: 'none', width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
              onClick={() => apriModifica(f)}
            >
              <span>
                <span className="riga-titolo">{f.nome}</span>
                <span style={{ color: 'var(--mist)', fontSize: 12.5, marginLeft: 10 }}>{f.citta} · {f.indirizzo}</span>
                {f.link && <span style={{ color: 'var(--blue)', fontSize: 12, marginLeft: 10 }}>🔗</span>}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); elimina(f); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); elimina(f); } }}
                style={{ fontSize: 11, color: 'var(--pink)', flexShrink: 0 }}
              >
                Elimina
              </span>
            </button>
          ))}
        </div>
      )}
      </>
      )}

      {modaleAperta && (
        <Modale titolo={inModifica ? 'Modifica — ' + inModifica.nome : 'Nuova fermata'} onClose={() => setModaleAperta(false)}>
          <div className="campo">
            <label><EtichettaTooltip testo="Nome" chiave="fermata_nome_campo" mappaTooltip={mappaTooltip} /></label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="form-grid">
            <label>Città
              <input value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} />
            </label>
            <label>Indirizzo
              <input value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} />
            </label>
          </div>
          <div className="form-grid">
            <label>Latitudine (facoltativa)
              <input
                type="number"
                step="any"
                value={form.lat ?? ''}
                onChange={(e) => setForm({ ...form, lat: e.target.value ? Number(e.target.value) : null })}
                placeholder="es. 45.4642"
              />
            </label>
            <label>Longitudine (facoltativa)
              <input
                type="number"
                step="any"
                value={form.lng ?? ''}
                onChange={(e) => setForm({ ...form, lng: e.target.value ? Number(e.target.value) : null })}
                placeholder="es. 9.1900"
              />
            </label>
          </div>
          <div className="campo">
            <label><EtichettaTooltip testo="Link" chiave="fermata_link_campo" mappaTooltip={mappaTooltip} /></label>
            <input type="url" placeholder="https://..." value={form.link ?? ''} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          </div>
          <div className="campo">
            <label>Note (facoltative)</label>
            <textarea rows={2} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={salvando} onClick={salva}>
            {salvando ? 'Salvo...' : 'Salva'}
          </button>
        </Modale>
      )}
    </div>
  );
}
