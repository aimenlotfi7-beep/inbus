import { useEffect, useState } from 'react';
import { listaAttesaApi, type IscrizioneListaAttesa } from '../../../api/listaAttesa';
import { ErroreApi } from '../../../api/client';

export function ListaAttesaTab({ eventoId }: { eventoId: string }) {
  const [partecipanti, setPartecipanti] = useState<number | null>(null);
  const [lista, setLista] = useState<IscrizioneListaAttesa[]>([]);
  const [caricamento, setCaricamento] = useState(true);

  function ricarica() {
    setCaricamento(true);
    Promise.all([
      listaAttesaApi.contaPartecipanti(eventoId),
      listaAttesaApi.listByEvento(eventoId),
    ]).then(([c, l]) => {
      setPartecipanti(c.partecipanti);
      setLista(l);
    }).finally(() => setCaricamento(false));
  }
  useEffect(ricarica, [eventoId]);

  async function promuovi(riga: IscrizioneListaAttesa) {
    if (!confirm(`Promuovere ${riga.nome} ${riga.cognome ?? ''}? Le manderemo un'email con il link per completare la prenotazione.`)) return;
    try {
      const r = await listaAttesaApi.promuovi(riga.id);
      if (!r.emailInviata) {
        alert(`Email non configurata: copia questo link e mandalo a mano al cliente:\n\n${r.link}`);
      }
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Errore: ${e.message}` : 'Errore di rete.');
    }
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;

  return (
    <div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <p className="section-label" style={{ marginBottom: 4 }}>Partecipanti confermati</p>
        <p style={{ fontFamily: "'Anton',sans-serif", fontSize: 26 }}>{partecipanti ?? 0}</p>
      </div>

      <p className="section-label" style={{ marginBottom: 10 }}>Lista d'attesa</p>
      {lista.length === 0 && <p className="testo-intro">Nessuna iscrizione alla lista d'attesa per questo evento.</p>}

      {lista.map((riga) => (
        <div key={riga.id} className="riga-cliccabile" style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span className="riga-titolo">
            {riga.nome} {riga.cognome ?? ''} · {riga.passeggeri} passeggero/i
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
