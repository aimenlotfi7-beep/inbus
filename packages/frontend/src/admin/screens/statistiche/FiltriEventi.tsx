import { SENZA_CATEGORIA, statisticheApi, type FiltroEventi, type OpzioniFiltri } from '../../../api/statistiche';
import { chiaveNome } from '../../../shared/nomi';
import { useDati } from './comuni';
import { formattaGiorno } from './periodo';

/** Statistiche: quali eventi contare (proprietario, ottobre 2026: «poter
 *  filtrare per evento, per categorie»). Categoria, genere, città dell'evento,
 *  tour e un evento solo; valgono per tutte le schede. Le voci arrivano dal
 *  server, solo quelle con almeno un evento. */

export const filtriAttivi = (f: FiltroEventi) => Boolean(f.categoria || f.genere || f.citta || f.tourId || f.eventoId);

const nomeEvento = (e: OpzioniFiltri['eventi'][number]) => `${e.artista} · ${e.citta} · ${formattaGiorno(e.data)}`;

/** Le voci di un elenco più quella scelta, se non c'è più (evento cancellato,
 *  genere tolto): resta visibile e si può togliere. */
function conScelta(voci: string[], scelta: string | undefined): string[] {
  if (!scelta || voci.some((v) => chiaveNome(v) === chiaveNome(scelta))) return voci;
  return [scelta, ...voci];
}

export function useOpzioniFiltri() {
  return useDati(() => statisticheApi.opzioniFiltri(), 'opzioni-filtri');
}

export function FiltriEventi({ valore, opzioni, onCambia }: {
  valore: FiltroEventi;
  opzioni: OpzioniFiltri | null;
  onCambia: (f: FiltroEventi) => void;
}) {
  const imposta = (campo: keyof FiltroEventi, v: string) => onCambia({ ...valore, [campo]: v || undefined });
  const o = opzioni;
  const scegliDa = (voci: string[], scelta: string | undefined) => conScelta(voci, scelta).map((v) => <option key={v} value={v}>{v}</option>);

  return (
    <div className="stat-filtri stat-filtri-eventi">
      <label className="stat-campo">
        <span>Categoria</span>
        <select value={valore.categoria ?? ''} onChange={(e) => imposta('categoria', e.target.value)} disabled={!o}>
          <option value="">Tutte</option>
          {scegliDa(o?.categorie ?? [], valore.categoria === SENZA_CATEGORIA ? undefined : valore.categoria)}
          {(o?.senzaCategoria || valore.categoria === SENZA_CATEGORIA) && <option value={SENZA_CATEGORIA}>Senza categoria</option>}
        </select>
      </label>
      <label className="stat-campo">
        <span>Genere</span>
        <select value={valore.genere ?? ''} onChange={(e) => imposta('genere', e.target.value)} disabled={!o}>
          <option value="">Tutti</option>
          {scegliDa(o?.generi ?? [], valore.genere)}
        </select>
      </label>
      <label className="stat-campo">
        <span>Città dell'evento</span>
        <select value={valore.citta ?? ''} onChange={(e) => imposta('citta', e.target.value)} disabled={!o}>
          <option value="">Tutte</option>
          {scegliDa(o?.citta ?? [], valore.citta)}
        </select>
      </label>
      {((o?.tour.length ?? 0) > 0 || valore.tourId) && (
        <label className="stat-campo">
          <span>Tour</span>
          <select value={valore.tourId ?? ''} onChange={(e) => imposta('tourId', e.target.value)} disabled={!o}>
            <option value="">Tutti</option>
            {valore.tourId && !o?.tour.some((t) => t.id === valore.tourId) && <option value={valore.tourId}>Tour non più attivo</option>}
            {o?.tour.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
      )}
      <label className="stat-campo stat-campo-evento">
        <span>Evento</span>
        <select value={valore.eventoId ?? ''} onChange={(e) => imposta('eventoId', e.target.value)} disabled={!o}>
          <option value="">Tutti gli eventi</option>
          {valore.eventoId && !o?.eventi.some((e) => e.id === valore.eventoId) && <option value={valore.eventoId}>Evento non più presente</option>}
          {o?.eventi.map((e) => <option key={e.id} value={e.id}>{nomeEvento(e)}</option>)}
        </select>
      </label>
    </div>
  );
}

/** "Festival · Rock · Roma": cosa si sta guardando, in parole. */
export function testoFiltri(f: FiltroEventi, o: OpzioniFiltri | null): string {
  const evento = f.eventoId ? o?.eventi.find((e) => e.id === f.eventoId) : undefined;
  return [
    f.categoria === SENZA_CATEGORIA ? 'senza categoria' : f.categoria,
    f.genere,
    f.citta,
    f.tourId ? `tour ${o?.tour.find((t) => t.id === f.tourId)?.nome ?? ''}`.trim() : undefined,
    f.eventoId ? (evento ? nomeEvento(evento) : 'un evento') : undefined,
  ].filter(Boolean).join(' · ');
}
