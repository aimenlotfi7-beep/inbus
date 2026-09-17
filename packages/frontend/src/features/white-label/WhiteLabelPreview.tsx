import type { WhiteLabelTheme } from '../../api/whiteLabel';
import { fontTitoli, piePagina, stilePulsante, stileRiquadro, testoPulsante, titoloVetrina, sottotitoloVetrina } from './tema';

interface DatiEventoPreview {
  artista: string;
  data: string;
  luogo: string;
  citta: string;
  descrizione?: string | null;
}

/**
 * Rendering della vetrina White Label a partire da un tema — QUESTO
 * componente è la fonte di verità unica di "come appare il widget".
 * L'anteprima nel gestionale e la pagina vera del link (/w/:id) usano
 * la STESSA funzione di rendering, mai due copie separate — altrimenti
 * l'anteprima "mentirebbe" rispetto a cosa vede davvero il cliente sul
 * sito dell'organizzatore. Gli stili arrivano tutti da tema.ts.
 * (public/embed.js ne è la copia in JavaScript puro per il codice da
 * incollare: quando cambia qualcosa qui, va aggiornato anche lì.)
 */
export function WhiteLabelPreview({ tema, evento, larghezza = 360, onCtaClick }: { tema: WhiteLabelTheme; evento: DatiEventoPreview; larghezza?: number; onCtaClick?: () => void }) {
  const { branding, colori, tipografia, stile, layout, elementiVisibili } = tema;
  const dataFormattata = new Date(evento.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const sottotitolo = sottotitoloVetrina(tema);
  const nota = piePagina(tema);
  const spazio = stile.spaziaturaPx;

  return (
    <div style={{ ...stileRiquadro(tema), width: larghezza, overflow: 'hidden' }}>
      {elementiVisibili.logo && branding.logoUrl && (
        <div style={{
          display: 'flex',
          justifyContent: branding.posizioneLogo === 'in-alto-al-centro' ? 'center' : branding.posizioneLogo === 'in-alto-a-destra' ? 'flex-end' : 'flex-start',
          marginBottom: spazio * 0.6,
        }}>
          <img src={branding.logoUrl} alt="" style={{ height: branding.dimensioneLogoPx, maxWidth: '100%', display: 'block' }} />
        </div>
      )}

      {elementiVisibili.immagine && (branding.immaginePrincipaleUrl || branding.heroImageUrl || layout.tipo === 'hero') && (
        <div style={{
          width: '100%',
          aspectRatio: layout.tipo === 'hero' ? '16/9' : '4/3',
          background: branding.immaginePrincipaleUrl || branding.heroImageUrl
            ? `url("${layout.tipo === 'hero' ? branding.heroImageUrl ?? branding.immaginePrincipaleUrl : branding.immaginePrincipaleUrl ?? branding.heroImageUrl}") center/cover`
            : colori.bordi,
          borderRadius: stile.borderRadiusPx * 0.7,
          marginBottom: spazio * 0.6,
        }} />
      )}

      {elementiVisibili.titolo && (
        <h3 style={{
          fontFamily: fontTitoli(tema), fontSize: tipografia.dimensioneTitoloPx, margin: `0 0 ${spazio * 0.3}px`,
          fontWeight: 800, lineHeight: 1.15, color: colori.testoPrincipale,
        }}>
          {titoloVetrina(tema, evento.artista)}
        </h3>
      )}
      {sottotitolo && (
        <p style={{ fontSize: tipografia.dimensioneTestoPx, color: colori.testoSecondario, margin: `0 0 ${spazio * 0.4}px`, lineHeight: 1.45 }}>
          {sottotitolo}
        </p>
      )}

      <div style={{ fontSize: tipografia.dimensioneTestoPx, color: colori.testoSecondario, marginBottom: spazio * 0.5, lineHeight: 1.5 }}>
        {elementiVisibili.data && <div>{dataFormattata}</div>}
        {elementiVisibili.percorso && <div>{evento.luogo}, {evento.citta}</div>}
      </div>

      {elementiVisibili.descrizione && evento.descrizione && (
        <p style={{ fontSize: tipografia.dimensioneTestoPx * 0.95, color: colori.testoSecondario, marginBottom: spazio * 0.6, lineHeight: 1.5 }}>
          {evento.descrizione.length > 120 ? `${evento.descrizione.slice(0, 120)}…` : evento.descrizione}
        </p>
      )}

      {elementiVisibili.fermate && (
        <div style={{ fontSize: tipografia.dimensioneTestoPx * 0.9, color: colori.testoSecondario, marginBottom: spazio * 0.3 }}>
          Scegli la tua fermata di partenza
        </div>
      )}
      {elementiVisibili.disponibilita && (
        <div style={{ fontSize: tipografia.dimensioneTestoPx * 0.9, color: colori.testoSecondario, marginBottom: spazio * 0.6 }}>
          Posti disponibili
        </div>
      )}

      {elementiVisibili.prezzo && (
        <div style={{ marginBottom: spazio * 0.6 }}>
          <span style={{ fontFamily: fontTitoli(tema), fontSize: tipografia.dimensioneTitoloPx * 0.75, fontWeight: 800, color: colori.accento }}>da 30,00 €</span>
        </div>
      )}

      {elementiVisibili.cta && (
        <button type="button" style={{ ...stilePulsante(tema), cursor: onCtaClick ? 'pointer' : 'default' }} disabled={!onCtaClick} onClick={onCtaClick}>
          {testoPulsante(tema)}
        </button>
      )}

      {elementiVisibili.informazioni && nota && (
        <p style={{ fontSize: tipografia.dimensioneTestoPx * 0.8, color: colori.testoSecondario, marginTop: spazio * 0.5, marginBottom: 0, textAlign: 'center' }}>
          {nota}
        </p>
      )}
    </div>
  );
}
