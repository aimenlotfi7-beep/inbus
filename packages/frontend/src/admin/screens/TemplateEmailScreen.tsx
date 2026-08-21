import { useEffect, useRef, useState } from 'react';
import { templateEmailApi, type TemplateEmail } from '../../api/templateEmail';
import { ErroreApi } from '../../api/client';
import { PanelHead } from '../shared/PanelHead';
import { CaricaFile } from '../shared/CaricaFile';

/** Modifica del testo delle email automatiche (conferma prenotazione,
 *  promemoria saldo, biglietto, promozione lista d'attesa) — invece di
 *  essere scritto fisso nel codice, vive nel database ed è modificabile
 *  da qui. I segnaposto tipo {{nome}} vengono sostituiti automaticamente
 *  con il dato vero al momento dell'invio. */
export function TemplateEmailScreen() {
  const [lista, setLista] = useState<TemplateEmail[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [selezionato, setSelezionato] = useState<TemplateEmail | null>(null);
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const areaCorpoRef = useRef<HTMLTextAreaElement>(null);

  function ricarica() {
    setCaricamento(true);
    setErrore('');
    templateEmailApi.list()
      .then((l) => {
        setLista(l);
        // Se stavo già modificando un modello, aggiorno anche la selezione
        // (per riflettere l'orario di salvataggio aggiornato).
        setSelezionato((sel) => sel ? (l.find((t) => t.chiave === sel.chiave) ?? null) : null);
      })
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare i modelli email. Controlla i tuoi permessi o riprova.'))
      .finally(() => setCaricamento(false));
  }
  useEffect(ricarica, []);

  function apri(t: TemplateEmail) {
    setSelezionato(t);
    setOggetto(t.oggetto);
    setCorpo(t.corpo);
  }

  async function salva() {
    if (!selezionato) return;
    if (!oggetto.trim() || !corpo.trim()) { alert('Oggetto e corpo non possono essere vuoti.'); return; }
    setSalvando(true);
    try {
      await templateEmailApi.aggiorna(selezionato.chiave, { oggetto, corpo });
      ricarica();
    } catch (e) {
      alert(e instanceof ErroreApi ? `Salvataggio non riuscito: ${e.message}` : 'Salvataggio non riuscito: errore di rete.');
    } finally {
      setSalvando(false);
    }
  }

  /** Inserisce il tag <img> per un link incollato, nel punto dove si
   *  trovava il cursore nel testo — così si possono aggiungere immagini
   *  (es. un logo) senza dover scrivere l'HTML a mano. */
  function inserisciTagImmagine(url: string) {
    const area = areaCorpoRef.current;
    const tag = `<img src="${url}" alt="" style="max-width:100%;" />`;
    if (area) {
      const inizio = area.selectionStart;
      const fine = area.selectionEnd;
      const nuovoTesto = corpo.slice(0, inizio) + tag + corpo.slice(fine);
      setCorpo(nuovoTesto);
      // Rimetto il focus subito dopo il tag appena inserito.
      setTimeout(() => { area.focus(); area.selectionStart = area.selectionEnd = inizio + tag.length; }, 0);
    } else {
      setCorpo((c) => c + tag);
    }
  }

  function inserisciImmagineDaLink() {
    const url = prompt('Incolla il link (URL) dell\'immagine da inserire:');
    if (!url?.trim()) return;
    inserisciTagImmagine(url.trim());
  }

  function inserisciSegnaposto(chiave: string) {
    const area = areaCorpoRef.current;
    const tag = `{{${chiave}}}`;
    if (area) {
      const inizio = area.selectionStart;
      const fine = area.selectionEnd;
      setCorpo(corpo.slice(0, inizio) + tag + corpo.slice(fine));
      setTimeout(() => { area.focus(); area.selectionStart = area.selectionEnd = inizio + tag.length; }, 0);
    } else {
      setCorpo((c) => c + tag);
    }
  }

  if (caricamento) return <p className="testo-intro">Carico...</p>;
  if (errore) return <p className="testo-intro" style={{ color: 'var(--pink)' }}>{errore}</p>;

  return (
    <div>
      <PanelHead titolo="Testo delle email automatiche" />
      <p className="testo-intro" style={{ marginBottom: 16 }}>
        Modifica il testo che i clienti ricevono via email. I segnaposto tra doppie graffe (es. <code>{'{{nome}}'}</code>)
        vengono sostituiti automaticamente con il dato vero al momento dell'invio — non toglierli, altrimenti quel
        punto resterebbe vuoto.
      </p>

      {lista.length === 0 && (
        <p className="testo-intro">
          Nessun modello trovato — probabilmente il server non ha ancora creato quelli di base. Riprova tra un
          minuto (potrebbe essere ancora in fase di avvio), o ricarica la pagina.
        </p>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map((t) => (
            <button
              key={t.chiave}
              type="button"
              onClick={() => apri(t)}
              className="riga-cliccabile"
              style={{ textAlign: 'left', border: 'none', width: '100%', cursor: 'pointer', background: selezionato?.chiave === t.chiave ? 'var(--dusk-2)' : undefined }}
            >
              <span className="riga-titolo" style={{ fontSize: 13.5 }}>{t.nome}</span>
            </button>
          ))}
        </div>

        {selezionato && (
          <div className="section-card" style={{ flex: 1, minWidth: 320 }}>
            <p className="section-label" style={{ marginBottom: 4 }}>{selezionato.nome}</p>
            <p className="testo-intro" style={{ fontSize: 11.5, marginBottom: 14 }}>
              Segnaposto disponibili qui:{' '}
              {selezionato.segnaposto.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => inserisciSegnaposto(s)}
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '2px 8px', marginRight: 4, marginBottom: 4 }}
                  title="Clicca per inserirlo nel testo"
                >
                  {'{{' + s + '}}'}
                </button>
              ))}
            </p>

            <div className="campo">
              <label>Oggetto dell'email</label>
              <input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
            </div>

            <div className="campo">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ marginBottom: 0 }}>Corpo (HTML)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={inserisciImmagineDaLink}>
                    + Immagine (link)
                  </button>
                  <CaricaFile onCaricato={inserisciTagImmagine} etichetta="+ Carica immagine" />
                </div>
              </div>
              <textarea
                ref={areaCorpoRef}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={14}
                style={{ fontFamily: "'Space Mono',monospace", fontSize: 12.5 }}
              />
            </div>

            <button className="btn btn-primary" onClick={salva} disabled={salvando}>
              {salvando ? 'Salvo...' : 'Salva'}
            </button>

            <div style={{ marginTop: 20 }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Anteprima</p>
              <div
                style={{ background: '#fff', color: '#111', border: '1px solid var(--line)', borderRadius: 8, padding: 16, fontSize: 14 }}
                dangerouslySetInnerHTML={{ __html: corpo }}
              />
            </div>
          </div>
        )}

        {!selezionato && (
          <p className="testo-intro">Scegli un'email dalla lista a sinistra per modificarla.</p>
        )}
      </div>
    </div>
  );
}
