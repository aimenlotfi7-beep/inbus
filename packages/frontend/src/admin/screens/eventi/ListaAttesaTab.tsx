import { useEffect, useState } from 'react';
import { listaAttesaApi, type IscrizioneListaAttesa } from '../../../api/listaAttesa';
import { ErroreApi } from '../../../api/client';

export function ListaAttesaTab({ eventoId, servizi }: { eventoId: string; servizi?: { key: string; nome: string }[] }) {
  const [lista, setLista] = useState<IscrizioneListaAttesa[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [ricerca, setRicerca] = useState('');
  const [filtroStato, setFiltroStato] = useState<'TUTTI' | 'IN_ATTESA' | 'PROMOSSA'>('TUTTI');
  const [servizioAttivo, setServizioAttivo] = useState<string | 'liberi'>(servizi?.[0]?.key ?? 'liberi');

  function ricarica() {
    setCaricamento(true);
    listaAttesaApi.listByEvento(eventoId).then(setLista).finally(() => setCaricamento(false));
  }
  useEffect(ricarica, [eventoId]);

  const [linkDaCopiare, setLinkDaCopiare] = useState<{ nome: string; link: string } | null>(null);
  const [linkCopiato, setLinkCopiato] = useState(false);

  async function promuovi(riga: IscrizioneListaAttesa) {
    if (!confirm(`Promuovere ${riga.nome} ${riga.cognome ?? ''}? Le manderemo un'email con il link per completare la prenotazione.`)) return;
    try {
      const r = await listaAttesaApi.promuovi(riga.id);
      if (!r.emailInviata) {
        setLinkDaCopiare({ nome: `${riga.nome} ${riga.cognome ?? ''}`, link: r.link });
      }
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  async function copiaLink() {
    if (!linkDaCopiare) return;
    try {
      await navigator.clipboard.writeText(linkDaCopiare.link);
      setLinkCopiato(true);
      setTimeout(() => setLinkCopiato(false), 2500);
    } catch {
      // Se il browser blocca la copia automatica (raro), il link resta
      // comunque visibile e selezionabile a mano nel riquadro qui sotto.
    }
  }

  async function promuoviTutte() {
    if (!confirm(`Promuovere tutte le ${inAttesa.length} iscrizioni in attesa? A ognuno arriverà un'email con il link per completare la prenotazione — chi trova i posti già esauriti nel frattempo resterà segnalato come non riuscito, senza bloccare gli altri.`)) return;
    try {
      const { promosse, fallite } = await listaAttesaApi.promuoviTutte(eventoId);
      alert(`Fatto — ${promosse} promosse${fallite > 0 ? `, ${fallite} non riuscite (probabilmente posti esauriti nel frattempo)` : ''}.`);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;

  // Se ci sono più servizi, ogni tab mostra solo le iscrizioni di quel
  // servizio (o quelle senza preferenza, sotto "Liberi") — stessa
  // logica delle Partenze: un badge segnala quante persone sono ancora
  // "in attesa" (da promuovere) per ciascuno, così si vede subito dove
  // serve intervenire senza doverle aprire una per una.
  const listaVisibile = servizi && servizi.length > 0
    ? lista.filter((r) => (servizioAttivo === 'liberi' ? !r.servizioId : r.servizioId === servizioAttivo))
    : lista;

  // Raggruppo per fermata (in attesa, non ancora promosse) — così si
  // vede subito quante persone aspettano e per quale città, senza
  // doverle contare a mano scorrendo l'elenco.
  const inAttesa = listaVisibile.filter((r) => r.stato === 'IN_ATTESA');
  const promosse = listaVisibile.filter((r) => r.stato === 'PROMOSSA').length;
  const confermate = listaVisibile.filter((r) => r.completata).length;

  const listaFiltrata = listaVisibile.filter((r) => {
    if (filtroStato !== 'TUTTI' && r.stato !== filtroStato) return false;
    const q = ricerca.trim().toLowerCase();
    if (q && !`${r.nome} ${r.cognome ?? ''} ${r.email}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const perFermata = new Map<string, { passeggeri: number; iscritti: number }>();
  for (const r of inAttesa) {
    const chiave = r.fermataCitta ?? 'Nessuna fermata scelta';
    const attuale = perFermata.get(chiave) ?? { passeggeri: 0, iscritti: 0 };
    perFermata.set(chiave, { passeggeri: attuale.passeggeri + r.passeggeri, iscritti: attuale.iscritti + 1 });
  }

  return (
    <div>
      {servizi && servizi.length > 0 && (
        <div className="mini-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {servizi.map((s) => {
            const inAttesaQui = lista.filter((r) => r.servizioId === s.key && r.stato === 'IN_ATTESA').length;
            return (
              <button key={s.key} type="button" className={`mini-tab${servizioAttivo === s.key ? ' active' : ''}`} onClick={() => setServizioAttivo(s.key)}>
                {s.nome}
                {inAttesaQui > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>
                    {inAttesaQui}
                  </span>
                )}
              </button>
            );
          })}
          {lista.some((r) => !r.servizioId) && (() => {
            const inAttesaLiberi = lista.filter((r) => !r.servizioId && r.stato === 'IN_ATTESA').length;
            return (
              <button type="button" className={`mini-tab${servizioAttivo === 'liberi' ? ' active' : ''}`} onClick={() => setServizioAttivo('liberi')}>
                Senza preferenza
                {inAttesaLiberi > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--pink)', color: '#fff', borderRadius: 999, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>
                    {inAttesaLiberi}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {linkDaCopiare && (
        <div className="section-card" style={{ marginBottom: 16, borderColor: 'var(--pink)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <p className="section-label" style={{ marginBottom: 8 }}>
              Email non configurata — invia questo link a {linkDaCopiare.nome} a mano
            </p>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 16, padding: '0 6px' }} onClick={() => setLinkDaCopiare(null)} title="Chiudi">✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              readOnly
              value={linkDaCopiare.link}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 10px', color: 'var(--paper)', fontSize: 13 }}
            />
            <button type="button" className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px', flexShrink: 0 }} onClick={copiaLink}>
              {linkCopiato ? '✓ Copiato' : 'Copia link'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="section-card" style={{ flex: 1, minWidth: 140 }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Lista d'attesa</p>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 26 }}>{lista.length}</p>
          <p className="testo-intro" style={{ fontSize: 11, marginTop: 2, marginBottom: 0 }}>iscrizioni totali</p>
        </div>
        <div className="section-card" style={{ flex: 1, minWidth: 140 }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Promosse</p>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--amber)' }}>{promosse}</p>
          <p className="testo-intro" style={{ fontSize: 11, marginTop: 2, marginBottom: 0 }}>link mandato in totale (comprese quelle già confermate)</p>
        </div>
        <div className="section-card" style={{ flex: 1, minWidth: 140 }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Confermate</p>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 26, color: 'var(--green)' }}>{confermate}</p>
          <p className="testo-intro" style={{ fontSize: 11, marginTop: 2, marginBottom: 0 }}>hanno completato davvero la prenotazione</p>
        </div>
      </div>

      {perFermata.size > 0 && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Richieste per fermata</p>
          {Array.from(perFermata.entries()).map(([citta, dati]) => (
            <div key={citta} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span>{citta}</span>
              <span style={{ color: 'var(--mist)' }}>{dati.passeggeri} passeggero/i · {dati.iscritti} iscrizione/i</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <p className="section-label" style={{ marginBottom: 0 }}>Lista d'attesa</p>
        {inAttesa.length > 0 && (
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={promuoviTutte}>
            Promuovi tutte ({inAttesa.length})
          </button>
        )}
      </div>

      {lista.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Cerca per nome o email..."
            className="campo-cerca-originale"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value as typeof filtroStato)} style={{ maxWidth: 180 }}>
            <option value="TUTTI">Tutti gli stati</option>
            <option value="IN_ATTESA">In attesa</option>
            <option value="PROMOSSA">Promosse</option>
          </select>
        </div>
      )}

      {lista.length === 0 && <p className="testo-intro">Nessuna iscrizione alla lista d'attesa per questo evento.</p>}
      {lista.length > 0 && listaFiltrata.length === 0 && <p className="testo-intro">Nessuna iscrizione per questi filtri.</p>}

      {listaFiltrata.map((riga) => (
        <div key={riga.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span className="riga-titolo">
            {riga.nome} {riga.cognome ?? ''} · {riga.passeggeri} passeggero/i
            {riga.fermataCitta && <> · <span style={{ color: 'var(--amber)' }}>{riga.fermataCitta}</span></>}
            <br />
            <span style={{ color: 'var(--mist)', fontSize: 12 }}>{riga.email}{riga.telefono ? ` · ${riga.telefono}` : ''}</span>
          </span>
          <span className="riga-meta">
            {riga.stato === 'PROMOSSA' ? (
              <span className={`badge ${riga.completata ? 'coperta' : 'dal-ruolo'}`}>
                {riga.completata ? 'Completata' : riga.emailInviata ? 'Promossa (email inviata)' : 'Promossa (email non inviata)'}
              </span>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => promuovi(riga)}>Promuovi</button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
