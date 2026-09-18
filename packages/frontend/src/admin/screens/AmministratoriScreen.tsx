import { useEffect, useState } from 'react';
import { formattaDataOra } from '../../shared/formato';
import { motivoErrore } from '../shared/errori';
import { azioneConfermata, conferma } from '../shared/conferma';
import { notifica } from '../shared/notifiche';
import { amministratoriApi, type Amministratore, type AmministratoreInput, type LogRiga, type EccezionePermesso } from '../../api/amministratori';
import { haPermesso } from '../../api/auth';
import { ruoliApi, type Ruolo, type Permesso } from '../../api/ruoli';
import { PanelHead } from '../shared/PanelHead';
import { RicercaSezione } from '../shared/RicercaSezione';
import { TabellaGenerica } from '../shared/TabellaGenerica';
import { PaginaSezione } from '../shared/PaginaSezione';
import { CampoCopiabile } from '../shared/CampoCopiabile';
import { Modale } from '../shared/Modale';
import { useSessione } from '../shared/SessioneContext';
import { TOOLTIP_DEFAULT } from '../tooltipDefaults';
import { useMappaTooltip } from '../shared/useMappaTooltip';

const VUOTO: AmministratoreInput = { nome: '', email: '', password: '', ruoloId: '' };

type StatoPermesso = 'ruolo' | 'extra' | 'negato' | 'nessuno';

export function AmministratoriScreen() {
  const mappaTooltip = useMappaTooltip();
  const sessione = useSessione();
  const puoCreare = haPermesso(sessione, 'utenze.crea');
  const [linkNonInviato, setLinkNonInviato] = useState<{ nome: string; link: string } | null>(null);
  const [admin, setAdmin] = useState<Amministratore[]>([]);
  const [log, setLog] = useState<LogRiga[]>([]);
  const [ruoliAssegnabili, setRuoliAssegnabili] = useState<Ruolo[]>([]);
  const [permessiAssegnabili, setPermessiAssegnabili] = useState<Permesso[]>([]);
  const [inModifica, setInModifica] = useState<Amministratore | null>(null);
  const [form, setForm] = useState<AmministratoreInput>(VUOTO);
  const [modaleAperta, setModaleAperta] = useState(false);

  const [permessiUtenza, setPermessiUtenza] = useState<Amministratore | null>(null);
  const [permessiRuolo, setPermessiRuolo] = useState<string[]>([]);
  const [ruoloOwnerTarget, setRuoloOwnerTarget] = useState(false);
  const [collaboratoreTarget, setCollaboratoreTarget] = useState(false);
  const [statoPermessi, setStatoPermessi] = useState<Record<string, StatoPermesso>>({});
  const [ricerca, setRicerca] = useState('');
  const [salvando, setSalvando] = useState(false);

  function ricarica() {
    amministratoriApi.list().then(setAdmin);
    amministratoriApi.log().then(setLog);
    ruoliApi.assegnabili().then((lista) => {
      setRuoliAssegnabili(lista);
      setForm((f) => (f.ruoloId ? f : { ...f, ruoloId: lista[0]?.id ?? '' }));
    });
    ruoliApi.permessiAssegnabili().then(setPermessiAssegnabili);
  }
  useEffect(ricarica, []);

  function nomeRuolo(ruoloId: string) {
    return ruoliAssegnabili.find((r) => r.id === ruoloId)?.nome ?? '—';
  }
  // Il ruolo di sistema dei collaboratori (lo crea il server) non ha permessi
  // suoi: si ottiene con la casella, non scegliendolo dall'elenco.
  const ruoliVeri = ruoliAssegnabili.filter((r) => r.nome !== 'Collaboratore');

  const adminFiltrati = ricerca.trim()
    ? admin.filter((a) => `${a.nome} ${a.email} ${nomeRuolo(a.ruoloId)}`.toLowerCase().includes(ricerca.trim().toLowerCase()))
    : admin;

  function apriNuovo() { setInModifica(null); setForm({ ...VUOTO, ruoloId: ruoliVeri[0]?.id ?? '' }); setModaleAperta(true); }
  function cambiaCollaboratore(attivo: boolean) {
    // Togliendo la casella a un collaboratore serve un ruolo vero, da scegliere.
    const ruoloValido = ruoliVeri.some((r) => r.id === form.ruoloId);
    setForm({ ...form, soloEventiAssegnati: attivo, ruoloId: attivo || ruoloValido ? form.ruoloId : '' });
  }
  function apriModifica(a: Amministratore) { setInModifica(a); setForm({ nome: a.nome, email: a.email, ruoloId: a.ruoloId, attivo: a.attivo, soloEventiAssegnati: a.soloEventiAssegnati }); setModaleAperta(true); }

  async function salva() {
    if (salvando) return;
    const senzaRuolo = !form.soloEventiAssegnati && !form.ruoloId;
    if (!form.nome.trim() || !form.email.trim() || senzaRuolo || (!inModifica && !form.password)) {
      notifica(inModifica ? 'Compila nome, email e ruolo.' : 'Compila nome, email, password e ruolo.', 'errore');
      return;
    }
    setSalvando(true);
    try {
      if (inModifica) await amministratoriApi.update(inModifica.id, form);
      else await amministratoriApi.create(form);
      setModaleAperta(false);
      notifica(inModifica ? 'Amministratore salvato.' : 'Amministratore creato: comunicagli la password, potrà cambiarla con «Password dimenticata?».', 'successo');
      ricarica();
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  /** Disattivato: non entra più e perde subito tutti i permessi; dati e
   *  registro restano, e si riattiva quando serve. */
  async function cambiaAttivo(a: Amministratore) {
    const disattiva = a.attivo;
    const ok = await conferma({
      titolo: disattiva ? `Disattivare ${a.nome}?` : `Riattivare ${a.nome}?`,
      testo: disattiva
        ? 'Non potrà più entrare nel gestionale e perde subito i permessi. I suoi dati restano: puoi riattivarlo quando vuoi.'
        : 'Potrà entrare di nuovo nel gestionale, con il suo ruolo.',
      conferma: disattiva ? 'Disattiva' : 'Riattiva',
      pericolosa: disattiva,
    });
    if (!ok) return;
    try {
      await amministratoriApi.update(a.id, { attivo: !disattiva });
      notifica(disattiva ? `${a.nome} disattivato.` : `${a.nome} riattivato.`, 'successo');
      ricarica();
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }

  async function mandaLinkPassword(a: Amministratore) {
    const ok = await conferma({
      titolo: `Mandare a ${a.nome} il link per una nuova password?`,
      testo: `Riceve a ${a.email} un'email con il link per scegliere la password, valido 24 ore. Quella attuale resta valida finché non ne sceglie una nuova.`,
      conferma: 'Manda il link',
    });
    if (!ok) return;
    try {
      const esito = await amministratoriApi.linkPassword(a.id);
      if (esito.emailInviata) notifica(`Link per la password inviato a ${esito.email}.`, 'successo');
      else {
        notifica(`L'email a ${esito.email} non è partita: manda tu il link.`, 'errore');
        setLinkNonInviato({ nome: a.nome, link: esito.link });
      }
    } catch (e) {
      notifica(`Azione non riuscita: ${motivoErrore(e)}`, 'errore');
    }
  }
  async function elimina(a: Amministratore) {
    if (await azioneConfermata({
      titolo: `Eliminare l'amministratore "${a.nome}"?`, testo: 'Non potrà più accedere al gestionale.', conferma: 'Elimina', pericolosa: true,
      esegui: () => amministratoriApi.remove(a.id), fatto: 'Amministratore eliminato.',
    })) ricarica();
  }

  async function apriPermessi(a: Amministratore) {
    try {
      const dati = await amministratoriApi.permessi(a.id);
      if (dati.ruoloOwner) {
        notifica('Questa utenza ha il ruolo proprietario: ha già tutti i permessi, non servono eccezioni personali.', 'info');
        return;
      }
      setPermessiUtenza(a);
      setRuoloOwnerTarget(dati.ruoloOwner);
      setCollaboratoreTarget(dati.collaboratore);
      setPermessiRuolo(dati.permessiRuolo);
      const stato: Record<string, StatoPermesso> = {};
      // Un collaboratore: solo le voci operative, che ha tutte di serie.
      for (const p of permessiAssegnabili.filter((x) => !dati.collaboratore || dati.permessiRuolo.includes(x.chiave))) {
        const daRuolo = dati.permessiRuolo.includes(p.chiave);
        const eccezione = dati.eccezioni.find((e) => e.chiave === p.chiave);
        if (eccezione) stato[p.chiave] = eccezione.concesso ? 'extra' : 'negato';
        else stato[p.chiave] = daRuolo ? 'ruolo' : 'nessuno';
      }
      setStatoPermessi(stato);
    } catch (e) {
      notifica(`Impossibile aprire i permessi: ${motivoErrore(e)}`, 'errore');
    }
  }

  function ciclaStato(chiave: string) {
    const daRuolo = permessiRuolo.includes(chiave);
    setStatoPermessi((s) => {
      const attuale = s[chiave];
      let prossimo: StatoPermesso;
      if (daRuolo) prossimo = attuale === 'ruolo' ? 'negato' : 'ruolo';
      else prossimo = attuale === 'nessuno' ? 'extra' : 'nessuno';
      return { ...s, [chiave]: prossimo };
    });
  }

  async function salvaPermessi() {
    if (!permessiUtenza) return;
    const eccezioni: EccezionePermesso[] = [];
    for (const [chiave, stato] of Object.entries(statoPermessi)) {
      if (stato === 'extra') eccezioni.push({ chiave, concesso: true });
      if (stato === 'negato') eccezioni.push({ chiave, concesso: false });
    }
    try {
      await amministratoriApi.salvaPermessi(permessiUtenza.id, eccezioni);
      setPermessiUtenza(null);
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    }
  }

  // Per un collaboratore solo le voci operative (le sole che il server gli lascia).
  const permessiVisibili = collaboratoreTarget ? permessiAssegnabili.filter((p) => permessiRuolo.includes(p.chiave)) : permessiAssegnabili;
  const moduli = Array.from(new Set(permessiVisibili.map((p) => p.modulo)));

  const ETICHETTA_STATO: Record<StatoPermesso, string> = {
    ruolo: collaboratoreTarget ? 'Attivo' : 'Dal ruolo',
    extra: 'Concesso in più',
    negato: 'Tolto',
    nessuno: 'Non attivo',
  };
  const CLASSE_STATO: Record<StatoPermesso, string> = {
    ruolo: 'dal-ruolo', extra: 'concesso-extra', negato: 'negato', nessuno: 'non-attivo',
  };

  if (modaleAperta) {
    return (
      <PaginaSezione titolo={inModifica ? 'Modifica amministratore' : 'Nuovo amministratore'} onIndietro={() => setModaleAperta(false)}>
        <div className="campo"><label>Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        {!inModifica && <div className="campo"><label>Password</label><input type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
        {/* Collaboratori (proprietario, settembre 2026): la casella dà i
            permessi operativi al posto del ruolo, e il server la applica a
            ogni funzione. Mai sulla propria utenza. */}
        {inModifica?.id !== sessione?.id && (
          <label className="scelta-collaboratore">
            <input type="checkbox" checked={!!form.soloEventiAssegnati} onChange={(e) => cambiaCollaboratore(e.target.checked)} />
            <span>
              <b>Collaboratore: vede solo gli eventi di cui è responsabile</b>
              <small>
                Per chi fa la parte operativa: in Eventi, Partenze e Calendario trova solo gli eventi che gli assegni (e
                quelli che crea lui), e ha già tutti i permessi per gestirli, senza scegliere un ruolo. Prenotazioni, lista
                d'attesa, comunicazioni ai clienti, statistiche, promoter, White Label, coupon e impostazioni restano al team
                OnWay. Gli eventi si assegnano in Eventi («Assegna un responsabile» sulla card) o in Compensi collaboratori.
              </small>
            </span>
          </label>
        )}
        {form.soloEventiAssegnati ? (
          <p className="testo-secondario" style={{ margin: '-6px 0 18px' }}>
            Ruolo: Collaboratore. Se vuoi togliergli qualcosa (per esempio creare eventi nuovi), dopo il salvataggio usa
            «Personalizza» nella sua riga.
          </p>
        ) : (
          <div className="campo">
            <label>Ruolo</label>
            <select value={form.ruoloId} onChange={(e) => setForm({ ...form, ruoloId: e.target.value })}>
              {!form.ruoloId && <option value="">Scegli un ruolo…</option>}
              {ruoliVeri.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
            {ruoliVeri.length === 0 && (
              <p className="testo-intro" style={{ fontSize: 'var(--testo-md)', marginTop: 6, marginBottom: 0 }}>
                Nessun ruolo assegnabile trovato: vai in "Ruoli" e crea prima un ruolo con permessi tuoi o inferiori.
              </p>
            )}
          </div>
        )}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={salva} disabled={salvando}>{salvando ? 'Salvo…' : 'Salva amministratore'}</button>
        {inModifica && inModifica.attivo && (
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => mandaLinkPassword(inModifica)}>
            Manda link per una nuova password
          </button>
        )}
      </PaginaSezione>
    );
  }

  if (permessiUtenza && !ruoloOwnerTarget) {
    return (
      <PaginaSezione larga titolo={`Permessi personali di ${permessiUtenza.nome}`} onIndietro={() => setPermessiUtenza(null)} info={mappaTooltip.permessi_personali_intro ?? TOOLTIP_DEFAULT.permessi_personali_intro}>
        <p className="testo-intro">
          {collaboratoreTarget
            ? 'È un collaboratore: di serie ha tutta la parte operativa dei suoi eventi. Tocca una voce per togliergliela (o ridargliela). Prenotazioni, clienti, statistiche e il resto restano al team OnWay.'
            : `Di base questa utenza ha i permessi del ruolo "${nomeRuolo(permessiUtenza.ruoloId)}".`}
        </p>
        {/* I moduli stanno affiancati: prima era un elenco unico lunghissimo
            da scorrere, con metà schermo vuoto a destra. */}
        <div className="griglia-schede">
        {moduli.map((modulo) => (
          <div key={modulo} className="gruppo-modulo">
            <p className="section-label">{modulo}</p>
            {permessiVisibili.filter((p) => p.modulo === modulo).map((p) => {
              const stato = statoPermessi[p.chiave] ?? 'nessuno';
              return (
                <button key={p.chiave} type="button" onClick={() => ciclaStato(p.chiave)} className="riga-cliccabile">
                  <span className="riga-titolo">{p.etichetta}</span>
                  <span className={`badge ${CLASSE_STATO[stato]}`}>{ETICHETTA_STATO[stato]}</span>
                </button>
              );
            })}
          </div>
        ))}
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={salvaPermessi}>Salva permessi personali</button>
      </PaginaSezione>
    );
  }

  return (
    <div>
      <PanelHead titolo="Amministratori" azione={puoCreare ? <button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo amministratore</button> : undefined} />
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <CampoCopiabile etichetta="Link di accesso al gestionale (per tutti, inclusi i Collaboratori)" valore={`${window.location.origin}/admin.html`} link />
      </div>
      <RicercaSezione valore={ricerca} onChange={setRicerca} placeholder="Cerca per nome, email o ruolo…" />
      <TabellaGenerica
        righe={adminFiltrati}
        colonne={[
          { etichetta: 'Nome', render: (a) => <b>{a.nome}</b> },
          { etichetta: 'Email', render: (a) => a.email },
          { etichetta: 'Ruolo', render: (a) => <>{nomeRuolo(a.ruoloId)}{a.soloEventiAssegnati && <><br /><span className="testo-secondario">solo i suoi eventi</span></>}</> },
          {
            etichetta: 'Stato',
            render: (a) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className={`badge ${a.attivo ? 'badge-stato-verde' : 'badge-stato-rosso'}`}>{a.attivo ? 'Attivo' : 'Disattivo'}</span>
                {/* La propria utenza non si disattiva: si resterebbe fuori. */}
                {a.id !== sessione?.id && (
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 'var(--testo-xs)', padding: '2px 8px', ...(a.attivo && { color: 'var(--pink)' }) }} onClick={() => cambiaAttivo(a)}>
                    {a.attivo ? 'Disattiva' : 'Riattiva'}
                  </button>
                )}
              </div>
            ),
          },
          { etichetta: 'Permessi extra', render: (a) => <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 'var(--testo-md)' }} onClick={() => apriPermessi(a)}>Personalizza</button> },
        ]}
        onModifica={apriModifica}
        onElimina={elimina}
      />

      <h3 style={{ fontSize: 'var(--testo-xl)', margin: '30px 0 14px' }}>Log attività recenti</h3>
      <TabellaGenerica
        righe={log.map((l) => ({ ...l, id: l.id }))}
        colonne={[
          { etichetta: 'Azione', render: (l) => <b>{l.azione}</b> },
          { etichetta: 'Dettaglio', render: (l) => l.dettaglio ?? '—' },
          { etichetta: 'Quando', render: (l) => formattaDataOra(l.data) },
        ]}
      />

      {linkNonInviato && (
        <Modale titolo={`Link per ${linkNonInviato.nome}`} onClose={() => setLinkNonInviato(null)}>
          <p className="testo-intro" style={{ marginBottom: 16 }}>
            L'email non è partita: manda tu questo link (per messaggio). Serve a scegliere la password ed è valido 24 ore.
          </p>
          <CampoCopiabile etichetta="Link per la password" valore={linkNonInviato.link} />
        </Modale>
      )}
    </div>
  );
}
