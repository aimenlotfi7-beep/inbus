import { useEffect, useState } from 'react';
import { tourLeaderApi, type TourLeader, type CandidaturaInput } from '../../api/tourleader';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { Modale } from '../shared/Modale';
import { CampoCopiabile } from '../shared/CampoCopiabile';

const ETICHETTE: Record<TourLeader['stato'], string> = { CANDIDATO: 'Candidato', ATTIVO: 'Attivo', ARCHIVIATO: 'Archiviato' };

const VUOTO: CandidaturaInput & { stato: TourLeader['stato'] } = {
  nome: '', cognome: '', email: '', telefono: '', citta: '', lingue: '', disponibilita: '', esperienza: '', note: '', stato: 'ATTIVO',
};

export function TourLeaderScreen() {
  const [lista, setLista] = useState<TourLeader[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [linkCopiato, setLinkCopiato] = useState(false);
  const [formAperto, setFormAperto] = useState(false);
  const [credenzialiGenerate, setCredenzialiGenerate] = useState<{ nomeCompleto: string; email: string; password: string } | null>(null);
  const [form, setForm] = useState(VUOTO);

  function ricarica() { tourLeaderApi.list().then(setLista); }
  useEffect(ricarica, []);

  const linkCandidatura = `${window.location.origin}/tour-leader`;

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(linkCandidatura);
      setLinkCopiato(true);
      setTimeout(() => setLinkCopiato(false), 2500);
    } catch {
      window.prompt('Copia questo link:', linkCandidatura);
    }
  }

  const listaFiltrata = ricerca.trim()
    ? lista.filter((t) => `${t.nome} ${t.cognome} ${t.email} ${t.citta ?? ''}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : lista;

  async function cambiaStato(t: TourLeader, stato: TourLeader['stato']) {
    await tourLeaderApi.update(t.id, { stato });
    ricarica();
  }
  async function elimina(t: TourLeader) {
    if (!confirm(`Eliminare ${t.nome} ${t.cognome}?`)) return;
    await tourLeaderApi.remove(t.id);
    ricarica();
  }

  async function attivaAccesso(t: TourLeader) {
    if (!confirm(`Generare (o rigenerare) le credenziali di accesso alla scansione per ${t.nome} ${t.cognome}? Se ne aveva già, quelle vecchie smettono di funzionare.`)) return;
    try {
      const { email, password } = await tourLeaderApi.attivaAccesso(t.id);
      setCredenzialiGenerate({ nomeCompleto: `${t.nome} ${t.cognome}`, email, password });
    } catch (e) {
      alert(e instanceof ErroreApi ? `Non riuscito: ${e.message}` : 'Non riuscito: errore di rete.');
    }
  }

  function apriNuovo() { setForm(VUOTO); setFormAperto(true); }

  async function salva() {
    if (!form.nome.trim() || !form.cognome.trim() || !form.email.trim()) {
      alert('Compila almeno nome, cognome ed email.');
      return;
    }
    try {
      await tourLeaderApi.create(form);
      setFormAperto(false);
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    }
  }

  if (formAperto) {
    return (
      <PaginaSezione titolo="Censisci tour leader" onIndietro={() => setFormAperto(false)}>
        <p className="testo-intro">
          Registra qui direttamente un tour leader che conosci già — non deve passare dal modulo pubblico di
          autocandidatura. Parte come "Attivo", puoi cambiare stato in qualsiasi momento dall'elenco.
        </p>
        <div className="form-grid">
          <label>Nome <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
          <label>Cognome <input value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} /></label>
          <label>Email <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Telefono <input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
          <label>Città <input value={form.citta ?? ''} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
          <label>Lingue parlate <input value={form.lingue ?? ''} onChange={(e) => setForm({ ...form, lingue: e.target.value })} placeholder="es. Italiano, Inglese" /></label>
        </div>
        <div className="campo"><label>Disponibilità</label><input value={form.disponibilita ?? ''} onChange={(e) => setForm({ ...form, disponibilita: e.target.value })} /></div>
        <div className="campo"><label>Esperienza</label><input value={form.esperienza ?? ''} onChange={(e) => setForm({ ...form, esperienza: e.target.value })} /></div>
        <div className="campo">
          <label>Stato</label>
          <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as TourLeader['stato'] })}>
            {Object.entries(ETICHETTE).map(([valore, etichetta]) => <option key={valore} value={valore}>{etichetta}</option>)}
          </select>
        </div>
        <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva}>Salva tour leader</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead
        titolo="Tour Leader"
        azione={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={copiaLink}>{linkCopiato ? '✓ Link copiato' : '🔗 Copia link candidatura'}</button>
            <button className="btn btn-primary" onClick={apriNuovo}>+ Censisci tour leader</button>
          </div>
        }
      />
      <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 6 }}>
        Le candidature arrivano anche dal form pubblico di autocandidatura. Cambia lo stato per approvarle o archiviarle.
      </p>
      <p style={{ color: 'var(--mist)', fontSize: 12.5, marginBottom: 16 }}>
        Modulo pubblico: <code style={{ color: 'var(--paper)' }}>{linkCandidatura}</code>
      </p>
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <CampoCopiabile etichetta="Link di accesso per i tour leader già censiti" valore={`${window.location.origin}/scansione/accedi`} />
      </div>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o città..." />
      <TabellaGenerica
        righe={listaFiltrata}
        colonne={[
          { etichetta: 'Nome', render: (t) => <b>{t.nome} {t.cognome}</b> },
          { etichetta: 'Contatti', render: (t) => `${t.email}${t.telefono ? ' · ' + t.telefono : ''}` },
          { etichetta: 'Città', render: (t) => t.citta ?? '—' },
          {
            etichetta: 'Stato',
            render: (t) => (
              <select value={t.stato} onChange={(e) => cambiaStato(t, e.target.value as TourLeader['stato'])} style={{ background: 'var(--night)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', color: 'var(--paper)' }}>
                {Object.entries(ETICHETTE).map(([valore, etichetta]) => (
                  <option key={valore} value={valore}>{etichetta}</option>
                ))}
              </select>
            ),
          },
          {
            etichetta: 'Accesso scansione',
            render: (t) => (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => attivaAccesso(t)}>
                {t.passwordAttiva ? 'Rigenera credenziali' : '🔑 Attiva accesso'}
              </button>
            ),
          },
        ]}
        onElimina={elimina}
      />

      {credenzialiGenerate && (
        <Modale titolo={`Credenziali per ${credenzialiGenerate.nomeCompleto}`} onClose={() => setCredenzialiGenerate(null)}>
          <p className="testo-intro" style={{ marginBottom: 16 }}>
            Comunicale tu stesso (via messaggio/email) — non verranno mostrate di nuovo: solo di generarne di nuove,
            se le perdi.
          </p>
          <CampoCopiabile etichetta="Pagina di accesso" valore={`${window.location.origin}/scansione/accedi`} />
          <CampoCopiabile etichetta="Email" valore={credenzialiGenerate.email} />
          <CampoCopiabile etichetta="Password" valore={credenzialiGenerate.password} />
        </Modale>
      )}
    </div>
  );
}
