import { useEffect, useState } from 'react';
import { notifica } from '../shared/notifiche';
import { conferma, azioneConfermata } from '../shared/conferma';
import { motivoErrore } from '../shared/errori';
import { tourLeaderApi, type TourLeader, type CandidaturaInput } from '../../api/tourleader';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { Modale } from '../shared/Modale';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';
import { CampoCopiabile } from '../shared/CampoCopiabile';

const ETICHETTE: Record<TourLeader['stato'], string> = { CANDIDATO: 'Candidato', ATTIVO: 'Attivo', ARCHIVIATO: 'Archiviato' };

const VUOTO: CandidaturaInput & { stato: TourLeader['stato'] } = {
  nome: '', cognome: '', email: '', telefono: '', citta: '', lingue: '', disponibilita: '', esperienza: '', note: '', stato: 'ATTIVO',
};

export function TourLeaderScreen() {
  const mappaTooltip = useMappaTooltip();
  const [lista, setLista] = useState<TourLeader[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [linkCopiato, setLinkCopiato] = useState(false);
  const [formAperto, setFormAperto] = useState(false);
  const [linkNonInviato, setLinkNonInviato] = useState<{ nomeCompleto: string; link: string } | null>(null);
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
      // Il browser ha bloccato la copia automatica: il link resta selezionabile nel messaggio.
      notifica(`Copia il link a mano: ${linkCandidatura}`, 'info');
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
    if (await azioneConfermata({
      titolo: `Eliminare ${t.nome} ${t.cognome}?`, testo: 'Non potrà più accedere alla scansione.', conferma: 'Elimina', pericolosa: true,
      esegui: () => tourLeaderApi.remove(t.id), fatto: 'Tour leader eliminato.',
    })) ricarica();
  }

  /** Email al tour leader con il link per scegliere la password: nessuna
   *  password in chiaro da comunicare a mano. */
  async function attivaAccesso(t: TourLeader) {
    const nomeCompleto = `${t.nome} ${t.cognome}`;
    const ok = await conferma({
      titolo: `Mandare a ${nomeCompleto} il link per la password?`,
      testo: `Riceve a ${t.email} un'email con il link per scegliere la password della scansione, valido 72 ore.${t.passwordAttiva ? ' La password attuale resta valida finché non ne sceglie una nuova.' : ''}`,
      conferma: 'Manda il link',
    });
    if (!ok) return;
    try {
      const esito = await tourLeaderApi.attivaAccesso(t.id);
      if (esito.emailInviata) notifica(`Link per la password inviato a ${esito.email}.`, 'successo');
      else {
        notifica(`L'email a ${esito.email} non è partita: manda tu il link.`, 'errore');
        setLinkNonInviato({ nomeCompleto, link: esito.link });
      }
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  function apriNuovo() { setForm(VUOTO); setFormAperto(true); }

  const [salvando, setSalvando] = useState(false);
  async function salva() {
    if (salvando) return;
    if (!form.nome.trim() || !form.cognome.trim() || !form.email.trim()) {
      notifica('Compila almeno nome, cognome ed email.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      await tourLeaderApi.create(form);
      setFormAperto(false);
      ricarica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  if (formAperto) {
    return (
      <PaginaSezione titolo="Censisci tour leader" onIndietro={() => setFormAperto(false)} info={mappaTooltip.tourleader_censisci_intro ?? TOOLTIP_DEFAULT.tourleader_censisci_intro}>
        <div className="form-grid">
          <label>Nome <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
          <label>Cognome <input value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} /></label>
          <label>Email <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Telefono <input value={form.telefono ?? ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
          <label>Città <input value={form.citta ?? ''} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
          <label>Lingue parlate <input value={form.lingue ?? ''} onChange={(e) => setForm({ ...form, lingue: e.target.value })} placeholder="es. Italiano, Inglese" /></label>
          <label>Disponibilità <input value={form.disponibilita ?? ''} onChange={(e) => setForm({ ...form, disponibilita: e.target.value })} /></label>
          <label>Esperienza <input value={form.esperienza ?? ''} onChange={(e) => setForm({ ...form, esperienza: e.target.value })} /></label>
          <label>Stato
            <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as TourLeader['stato'] })}>
              {Object.entries(ETICHETTE).map(([valore, etichetta]) => <option key={valore} value={valore}>{etichetta}</option>)}
            </select>
          </label>
        </div>
        <div className="campo"><label>Note</label><input value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva tour leader'}</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead
        titolo="Tour Leader"
        azione={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={copiaLink}>{linkCopiato ? '✓ Link copiato' : 'Copia link candidatura'}</button>
            <button className="btn btn-primary" onClick={apriNuovo}>+ Censisci tour leader</button>
          </div>
        }
      />
      <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)', marginBottom: 6 }}>
        Le candidature arrivano anche dal form pubblico di autocandidatura. Cambia lo stato per approvarle o archiviarle.
      </p>
      <p style={{ color: 'var(--mist)', fontSize: 'var(--testo-md)', marginBottom: 16 }}>
        Modulo pubblico: <code style={{ color: 'var(--paper)' }}>{linkCandidatura}</code>
      </p>
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <CampoCopiabile etichetta="Link di accesso per i tour leader già censiti" valore={`${window.location.origin}/scansione/accedi`} link />
      </div>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o città…" />
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
              <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-sm)', padding: '4px 10px' }} onClick={() => attivaAccesso(t)}>
                {t.passwordAttiva ? 'Manda link per nuova password' : 'Manda link per la password'}
              </button>
            ),
          },
        ]}
        onElimina={elimina}
      />

      {linkNonInviato && (
        <Modale titolo={`Link per ${linkNonInviato.nomeCompleto}`} onClose={() => setLinkNonInviato(null)}>
          <p className="testo-intro" style={{ marginBottom: 16 }}>
            L'email non è partita: manda tu questo link (per messaggio). Serve a scegliere la password ed è valido 72 ore.
          </p>
          <CampoCopiabile etichetta="Link per scegliere la password" valore={linkNonInviato.link} link />
        </Modale>
      )}
    </div>
  );
}
