import type { TragittoInput, FermataInput } from '../../../api/eventi';
import type { FermataAnagrafica } from '../../../api/fermateAnagrafica';
import { CampoNumero } from '../../shared/CampoNumero';
import { OrarioInput } from '../../shared/OrarioInput';
import { InfoTooltip } from '../../shared/InfoTooltip';
import { TOOLTIP_DEFAULT } from '../../tooltipDefaults';

/** La card di UN tragitto nella scheda evento: nome, servizio, fermate
 *  (anagrafica, riordino, prezzi, orari), arrivo. Estratta da
 *  SchedaEventoModale (che la disegnava dentro un map da 240 righe con
 *  tutto lo stato del genitore a portata di mano): qui riceve SOLO i
 *  dati del suo tragitto e le azioni già "chiuse" sul suo indice — non
 *  può toccare per sbaglio un altro tragitto, e chi legge vede in una
 *  firma tutto quello che questa card può fare. Lo stato di
 *  trascinamento/indirizzo-espanso resta nel genitore perché attraversa
 *  più card (si trascina da una, si può lasciare su un'altra). */
export function TragittoCard({
  tragitto, idxTragitto, espansa, onToggleAperto,
  serviziAssegnabili, fermateAnagrafica,
  trascinata, setTrascinata, onDropSu, indirizzoEspansoMobile, setIndirizzoEspansoMobile,
  cittaBloccata, nomeTragittoBloccante, daArrivoPerTutti, mappaTooltip,
  onAggiorna, onAggiornaFermata, onAggiungiFermata, onRimuoviFermata, onSelezionaAnagrafica, onRimuoviTragitto,
  salvaRapido,
}: {
  tragitto: TragittoInput;
  idxTragitto: number;
  espansa: boolean;
  onToggleAperto: () => void;
  /** Vuoto = nessuna scelta di servizio da mostrare (modalità "un solo servizio"). */
  serviziAssegnabili: { key: string; nome: string }[];
  fermateAnagrafica: FermataAnagrafica[];
  trascinata: { tragitto: number; fermata: number } | null;
  setTrascinata: (v: { tragitto: number; fermata: number } | null) => void;
  onDropSu: (idxFermata: number) => void;
  indirizzoEspansoMobile: string | null;
  setIndirizzoEspansoMobile: (v: string | null) => void;
  /** Città di arrivo dell'evento se stabilita da UN ALTRO tragitto: il campo si blocca su questa. */
  cittaBloccata: string | undefined;
  nomeTragittoBloccante: string;
  daArrivoPerTutti: boolean;
  /** Testi dei tooltip, caricati UNA volta dal genitore (un hook qui sarebbe una chiamata API per card). */
  mappaTooltip: Record<string, string>;
  onAggiorna: (campo: keyof TragittoInput, valore: string | number | boolean) => void;
  onAggiornaFermata: (idxFermata: number, campo: keyof FermataInput, valore: string | boolean) => void;
  onAggiungiFermata: () => void;
  onRimuoviFermata: (idxFermata: number) => void;
  onSelezionaAnagrafica: (idxFermata: number, anagraficaId: string) => void;
  onRimuoviTragitto: () => void;
  /** Solo in modifica di un evento esistente (in creazione il salvataggio è l'ultimo passo del wizard). */
  salvaRapido?: { onSalva: () => void; salvando: boolean };
}) {
  const disattivato = tragitto.attivo === false;
  return (
    <div key={idxTragitto} className="section-card" style={disattivato ? { opacity: .55, background: 'repeating-linear-gradient(135deg, var(--dusk), var(--dusk) 10px, var(--dusk-2) 10px, var(--dusk-2) 20px)' } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={onToggleAperto}>
          {/* Un vero pulsante (raggiungibile da tastiera, area di tocco
              decente) invece di una freccina da 13px in un div cliccabile. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleAperto(); }}
            aria-expanded={espansa}
            aria-label={espansa ? 'Chiudi il tragitto' : 'Apri il tragitto'}
            style={{ background: 'none', border: 'none', color: 'var(--mist)', fontSize: 14, padding: '6px 8px', margin: '-6px 0 -6px -8px', cursor: 'pointer', lineHeight: 1 }}
          >
            {espansa ? '▾' : '▸'}
          </button>
          <div style={{ flex: 1 }}>
            <input
              value={tragitto.nome}
              onChange={(e) => onAggiorna('nome', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Tragitto senza nome"
              style={{ background: 'none', border: 'none', padding: 0, margin: 0, fontWeight: 700, fontSize: 'inherit', color: 'inherit', width: '100%', cursor: 'text' }}
            />
            {disattivato && <span className="badge attenzione" style={{ marginLeft: 8 }}>Disattivato</span>}
            {!espansa && (
              <p className="section-sub" style={{ margin: '2px 0 0' }}>
                {tragitto.fermate.length} fermat{tragitto.fermate.length === 1 ? 'a' : 'e'}
                {tragitto.fermate.some((f) => f.citta) && ` — ${tragitto.fermate.filter((f) => f.citta).map((f) => `${f.citta}${f.orario ? ` (${f.orario})` : ''}`).join(', ')}`}
              </p>
            )}
          </div>
        </div>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mist)', cursor: 'pointer', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
          title="Disattivato: resta configurato, ma non è più prenotabile sul sito"
        >
          <input
            type="checkbox"
            checked={!disattivato}
            onChange={(e) => onAggiorna('attivo', e.target.checked)}
            style={{ width: 'auto' }}
          />
          Attivo
        </label>
        <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', fontSize: 12.5, flexShrink: 0 }} onClick={onRimuoviTragitto}>Rimuovi tragitto</button>
      </div>

      {/* Solo qui, nella tab "Tragitti liberi" — un modo diretto per
          organizzarli dentro un servizio vero, senza doverli
          ricreare da zero (utile qualunque sia la causa per cui un
          tragitto è finito qui invece che in un servizio con nome). */}
      {serviziAssegnabili.length > 0 && !tragitto.servizioId && (
        <div style={{ marginBottom: 10 }}>
          <select
            value=""
            onChange={(e) => { if (e.target.value) onAggiorna('servizioId', e.target.value); }}
            style={{ fontSize: 12.5, maxWidth: 260 }}
          >
            <option value="" disabled>↳ Sposta in un servizio...</option>
            {serviziAssegnabili.map((v) => <option key={v.key} value={v.key}>{v.nome || 'Senza nome'}</option>)}
          </select>
        </div>
      )}

      {espansa && (
      <>
      <p className="section-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center' }}>
        Fermate
        <InfoTooltip>{mappaTooltip.fermate_orario_intro ?? TOOLTIP_DEFAULT.fermate_orario_intro}</InfoTooltip>
      </p>

      <p style={{ fontSize: 11.5, color: 'var(--mist)', marginBottom: 6 }}>Trascina una fermata per riordinarla.</p>
      {tragitto.fermate.map((f, idxFermata) => (
        <div key={idxFermata} style={{ marginBottom: 6 }}>
          {idxFermata === 0 && (
            <p style={{ marginBottom: 4, fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>Partenza</p>
          )}
          <div
            className="riga-fermata"
            draggable
            onDragStart={() => setTrascinata({ tragitto: idxTragitto, fermata: idxFermata })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropSu(idxFermata)}
            onDragEnd={() => setTrascinata(null)}
            style={{
              display: 'grid', gridTemplateColumns: '16px 1fr 1fr 68px auto auto', gap: 6, alignItems: 'center',
              opacity: trascinata?.tragitto === idxTragitto && trascinata.fermata === idxFermata ? 0.4 : 1, cursor: 'grab',
            }}
          >
            <span style={{ color: 'var(--mist)', fontSize: 14, textAlign: 'center' }} title="Trascina per riordinare">⠿</span>
            {/* !== null da solo non basta — dati salvati prima che
                il controllo qui sotto intercettasse "__manuale__"
                potrebbero avere quella stringa letterale scritta
                nel campo (invece di null), che il menu riconosce
                come opzione valida e mostra selezionata — nascondendo
                la città vera dietro quella scritta, invece di
                mostrare il campo manuale come dovrebbe. */}
            {f.fermataAnagraficaId !== '__manuale__' && !(f.fermataAnagraficaId == null && f.citta) ? (
              // Di default (e finché non si sceglie "scrivi
              // manualmente") si parte da qui — un elenco leggibile,
              // non un'iconcina minuscola. La città arriva
              // dall'anagrafica; l'indirizzo (qui accanto, stessa
              // riga) resta comunque modificabile anche partendo
              // da quello suggerito.
              <select
                value={f.fermataAnagraficaId ?? ''}
                onChange={(e) => onSelezionaAnagrafica(idxFermata, e.target.value)}
              >
                <option value="" disabled>— Scegli una fermata dall'anagrafica —</option>
                {fermateAnagrafica.map((fa) => {
                  // Non ha senso la stessa fermata due volte nello
                  // stesso tragitto (es. "Milano" scelta sia come
                  // fermata 1 che come fermata 3) — disabilitata se
                  // già usata da UN'ALTRA riga qui sotto (non questa
                  // stessa, che deve restare selezionabile/invariata).
                  const usataAltrove = tragitto.fermate.some((altra, i) => i !== idxFermata && altra.fermataAnagraficaId === fa.id);
                  return (
                    <option key={fa.id} value={fa.id} disabled={usataAltrove}>
                      {fa.nome === fa.citta ? fa.nome : `${fa.nome} — ${fa.citta}`}{usataAltrove ? ' (già in questo tragitto)' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input placeholder="Città" value={f.citta} onChange={(e) => onAggiornaFermata(idxFermata, 'citta', e.target.value)} />
            )}
            {/* Indirizzo sulla stessa riga della città, sempre
                visibile su desktop. Su mobile — la riga è
                trascinabile per riordinare le fermate, quindi una
                pressione prolungata qui confliggerebbe col gesto
                di trascinamento — resta chiuso di default e si
                apre con un tocco normale sul pulsante "Indirizzo"
                qui sotto (className diverso da quello del campo,
                sempre visibile, per non nascondere anche il modo
                di aprirlo), si richiude togliendo il focus dal
                campo (onBlur). */}
            <div style={{ position: 'relative' }}>
              <input
                className={`indirizzo-fermata-riga${indirizzoEspansoMobile === `${idxTragitto}-${idxFermata}` ? ' espansa' : ''}`}
                value={f.indirizzo ?? ''}
                onChange={(e) => onAggiornaFermata(idxFermata, 'indirizzo', e.target.value)}
                onBlur={() => setIndirizzoEspansoMobile(null)}
                placeholder="Indirizzo"
                aria-label="Indirizzo della fermata"
              />
              <button
                type="button"
                className="apri-indirizzo-mobile"
                onClick={() => setIndirizzoEspansoMobile(`${idxTragitto}-${idxFermata}`)}
                title="Modifica indirizzo"
              >
                {f.indirizzo ? `Indirizzo: ${f.indirizzo}` : '+ Indirizzo'}
              </button>
            </div>
            <div
              style={{ width: 68 }}
              title="Soglia minima partecipanti (facoltativa) — sotto questo numero la fermata non viene considerata raggiunta"
              draggable
              onDragStart={(e) => e.stopPropagation()}
            >
              {/* "Min." da solo non diceva di cosa: il suggerimento al passaggio
                  del mouse non esiste su telefono/tablet. */}
              <CampoNumero
                aria-label="Soglia minima partecipanti (facoltativa)"
                placeholder="Min. pers."
                value={f.sogliaMinima ?? undefined}
                onChange={(v) => onAggiornaFermata(idxFermata, 'sogliaMinima', v !== undefined ? String(v) : '')}
              />
            </div>
            <label
              title={f.attivo === false ? 'Fermata esclusa — non compare più nelle Linee né sul sito' : 'Fermata attiva — clicca per escluderla (es. per scarse adesioni), senza doverla rimuovere del tutto'}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: f.attivo === false ? 'var(--pink)' : 'var(--mist)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <input type="checkbox" checked={f.attivo !== false} onChange={(e) => onAggiornaFermata(idxFermata, 'attivo', e.target.checked)} style={{ width: 'auto' }} />
              <span className="etichetta-attiva-fermata">{f.attivo === false ? 'Esclusa' : 'Attiva'}</span>
            </label>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)', padding: '4px 8px' }} onClick={() => onRimuoviFermata(idxFermata)} title="Rimuovi fermata">✕</button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => onAggiungiFermata()}>+ Aggiungi fermata</button>

      {/* Blu, non rosso: il rosso nel gestionale vuol dire errore/attenzione. */}
      <p style={{ marginTop: 14, marginBottom: 4, fontSize: 15, fontWeight: 700, color: 'var(--blue)' }}>Arrivo</p>
      {(() => {
        // Solo uno stile diverso (leggermente oscurato) per far
        // capire da dove viene il valore — il campo resta
        // comunque modificabile cliccandoci, come richiesto: chi
        // vuole un'eccezione per UN tragitto specifico può
        // scriverci sopra senza dover prima disattivare il flag.
        const stileOscurato = daArrivoPerTutti ? { opacity: .6, background: 'var(--night)' } : undefined;
        // Blocco vero (non un avviso) — questo tragitto non è
        // quello che ha stabilito l'arrivo dell'evento, il campo
        // città diventa fisso su quel valore. L'indirizzo/orario
        // restano modificabili (stesso punto di arrivo può avere
        // un orario diverso per fermata/tragitto).
        const cittaBloccataQui = cittaBloccata;
        return (
      <div className="form-grid" style={{ marginBottom: 10, gridTemplateColumns: '1fr 1fr 110px' }}>
        <label>Città di arrivo
          <input
            style={cittaBloccataQui ? { opacity: .6, background: 'var(--night)', cursor: 'not-allowed' } : stileOscurato}
            value={cittaBloccataQui ?? tragitto.arrivoCitta ?? ''}
            disabled={!!cittaBloccataQui}
            title={cittaBloccataQui ? `Stessa città di arrivo di tutto l'evento — per cambiarla ovunque, modificala su "${nomeTragittoBloccante}".` : undefined}
            onChange={(e) => onAggiorna('arrivoCitta', e.target.value)}
            placeholder="es. Roma"
          />
        </label>
        <label>Indirizzo di arrivo
          <input
            style={stileOscurato}
            value={tragitto.arrivoIndirizzo ?? ''}
            onChange={(e) => onAggiorna('arrivoIndirizzo', e.target.value)}
            placeholder="es. Piazzale Clodio, Roma"
          />
        </label>
        <label>Orario
          <OrarioInput style={stileOscurato} value={tragitto.arrivoOrario ?? ''} onChange={(v) => onAggiorna('arrivoOrario', v)} />
        </label>
      </div>
        );
      })()}
      {/* Solo in modifica di un evento già esistente — in
          creazione questa sezione è uno dei quattro step del
          wizard (vedi più sotto "Vista CREAZIONE"), non ha senso
          proporre "Crea evento" da qui, a metà, prima che gli
          altri step siano stati anche solo visti. */}
      {salvaRapido && (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
        <button className="btn btn-primary" onClick={salvaRapido.onSalva} disabled={salvaRapido.salvando}>
          {salvaRapido.salvando ? 'Salvo...' : 'Salva modifica'}
        </button>
      </div>
      )}
      </>
      )}
    </div>
  );
}
