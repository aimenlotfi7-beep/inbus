import type { WhiteLabelTheme } from '../../api/whiteLabel';
import { fontTitoli, stilePulsante, stileRiquadro, testoPrezzoDa, testoPulsante, titoloElenco } from './tema';

/** Un evento come card: quello che serve per sceglierlo. */
export interface DatiCard {
  id: string;
  artista: string;
  data: string;
  luogo: string;
  citta: string;
  immagineUrl: string | null;
  prezzoMinimo: number | null;
}

/**
 * Le card di una White Label con più eventi (proprietario, settembre 2026:
 * per esempio un'agenzia che vende più viaggi): il cliente vede tutti gli
 * eventi in vendita e sceglie. Stessa grafica della vetrina (tema.ts) e
 * stesse scelte di "Cosa mostrare"; la usano la pagina vera (link e codice
 * da incollare) e l'anteprima del gestionale.
 */
export function ElencoEventi({ tema, eventi, onScegli, larghezzaMassima = 1100, larghezzaCard = 240, senzaIntestazione = false }: {
  tema: WhiteLabelTheme;
  eventi: DatiCard[];
  /** Senza: anteprima, i pulsanti non fanno niente. */
  onScegli?: (eventoId: string) => void;
  larghezzaMassima?: number;
  /** Larghezza minima di una card: più stretta nell'anteprima del gestionale. */
  larghezzaCard?: number;
  /** Dentro il sito del cliente (codice da incollare): logo e titolo fuori
   *  dai riquadri starebbero sullo sfondo del suo sito, magari illeggibili;
   *  lì l'intestazione la dà la sua pagina. */
  senzaIntestazione?: boolean;
}) {
  const { branding, colori, tipografia, stile, elementiVisibili } = tema;
  const spazio = stile.spaziaturaPx;
  const allineamento = branding.posizioneLogo === 'in-alto-al-centro' ? 'center' : branding.posizioneLogo === 'in-alto-a-destra' ? 'flex-end' : 'flex-start';
  // Largo quanto le card (al massimo 300 px l'una), e al centro: con pochi
  // eventi niente colonne vuote a destra.
  const larghezza = Math.min(larghezzaMassima, eventi.length * 300 + Math.max(0, eventi.length - 1) * spazio);

  return (
    <div style={{ width: '100%', maxWidth: larghezza, margin: '0 auto', boxSizing: 'border-box' }}>
      {!senzaIntestazione && elementiVisibili.logo && branding.logoUrl && (
        <div style={{ display: 'flex', justifyContent: allineamento, marginBottom: spazio * 0.75 }}>
          <img src={branding.logoUrl} alt="" style={{ height: branding.dimensioneLogoPx, maxWidth: '100%', display: 'block' }} />
        </div>
      )}
      {!senzaIntestazione && elementiVisibili.titolo && (
        <h2 style={{
          fontFamily: fontTitoli(tema), fontSize: tipografia.dimensioneTitoloPx, fontWeight: 800, lineHeight: 1.15,
          color: colori.testoPrincipale, margin: `0 0 ${spazio}px`, textAlign: allineamento === 'center' ? 'center' : 'left',
        }}>
          {titoloElenco(tema)}
        </h2>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${larghezzaCard}px, 1fr))`, gap: spazio }}>
        {eventi.map((e) => <Card key={e.id} tema={tema} evento={e} onScegli={onScegli} />)}
      </div>
    </div>
  );
}

function Card({ tema, evento, onScegli }: { tema: WhiteLabelTheme; evento: DatiCard; onScegli?: (eventoId: string) => void }) {
  const { branding, colori, tipografia, stile, elementiVisibili } = tema;
  const spazio = stile.spaziaturaPx;
  // L'immagine dell'evento; senza, quella scelta nel tema; senza nemmeno quella, un riquadro pieno.
  const immagine = evento.immagineUrl ?? branding.immaginePrincipaleUrl;
  const prezzo = testoPrezzoDa(evento.prezzoMinimo);
  const data = new Date(evento.data).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <article style={{ ...stileRiquadro(tema), padding: spazio * 0.75, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {elementiVisibili.immagine && (
        <div style={{
          aspectRatio: '16/9', borderRadius: stile.borderRadiusPx * 0.7, marginBottom: spazio * 0.6,
          background: immagine ? `url("${immagine}") center/cover` : colori.bordi,
        }} />
      )}
      <h3 style={{
        fontFamily: fontTitoli(tema), fontSize: Math.max(tipografia.dimensioneTitoloPx * 0.8, tipografia.dimensioneTestoPx + 2),
        fontWeight: 800, lineHeight: 1.2, margin: `0 0 ${spazio * 0.3}px`, color: colori.testoPrincipale, overflowWrap: 'anywhere',
      }}>
        {evento.artista}
      </h3>
      <div style={{ fontSize: tipografia.dimensioneTestoPx, color: colori.testoSecondario, lineHeight: 1.5, marginBottom: spazio * 0.5 }}>
        {elementiVisibili.data && <div>{data}</div>}
        {elementiVisibili.percorso && <div>{[evento.luogo, evento.citta].filter(Boolean).join(', ')}</div>}
      </div>
      {elementiVisibili.prezzo && prezzo && (
        <div style={{ fontFamily: fontTitoli(tema), fontSize: tipografia.dimensioneTitoloPx * 0.7, fontWeight: 800, color: colori.accento, marginBottom: spazio * 0.6 }}>
          {prezzo}
        </div>
      )}
      <button
        type="button"
        style={{ ...stilePulsante(tema), marginTop: 'auto', cursor: onScegli ? 'pointer' : 'default' }}
        onClick={onScegli ? () => onScegli(evento.id) : undefined}
        aria-label={`${testoPulsante(tema)}: ${evento.artista}`}
      >
        {testoPulsante(tema)}
      </button>
    </article>
  );
}
