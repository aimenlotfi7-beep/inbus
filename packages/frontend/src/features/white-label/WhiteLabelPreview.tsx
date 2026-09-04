import type { WhiteLabelTheme } from '../../api/whiteLabel';

interface DatiEventoPreview {
  artista: string;
  data: string;
  luogo: string;
  citta: string;
  descrizione?: string | null;
}

/**
 * Rendering del widget White Label a partire da un tema — QUESTO
 * componente è la fonte di verità unica di "come appare il widget".
 * L'anteprima nel gestionale e il widget incorporato vero (quando sarà
 * costruito) devono chiamare la STESSA funzione di rendering, mai due
 * copie separate — altrimenti l'anteprima "mentirebbe" rispetto a
 * cosa vede davvero il cliente sul sito dell'organizzatore.
 */
export function WhiteLabelPreview({ tema, evento, larghezza = 360, onCtaClick }: { tema: WhiteLabelTheme; evento: DatiEventoPreview; larghezza?: number; onCtaClick?: () => void }) {
  const { branding, colori, tipografia, stile, layout, elementiVisibili } = tema;

  const stilePulsante: React.CSSProperties = {
    height: stile.altezzaPulsantePx,
    borderRadius: stile.stilePulsanti === 'arrotondato' ? 999 : stile.borderRadiusPx,
    background: stile.stilePulsanti === 'contorno' ? 'transparent' : colori.cta,
    color: stile.stilePulsanti === 'contorno' ? colori.cta : colori.testoCta,
    border: stile.stilePulsanti === 'contorno' ? `1.5px solid ${colori.cta}` : 'none',
    fontFamily: tipografia.font,
    fontWeight: 700,
    fontSize: tipografia.dimensioneTestoPx,
    width: '100%',
    cursor: onCtaClick ? 'pointer' : 'default',
  };

  const dataFormattata = new Date(evento.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div
      style={{
        width: larghezza,
        background: colori.superficie,
        borderRadius: stile.borderRadiusPx,
        border: `1px solid ${colori.bordi}`,
        padding: stile.spaziaturaPx,
        fontFamily: tipografia.font,
        color: colori.testoPrincipale,
        overflow: 'hidden',
      }}
    >
      {elementiVisibili.logo && branding.logoUrl && (
        <div style={{
          display: 'flex',
          justifyContent: branding.posizioneLogo === 'in-alto-al-centro' ? 'center' : branding.posizioneLogo === 'in-alto-a-destra' ? 'flex-end' : 'flex-start',
          marginBottom: stile.spaziaturaPx * 0.6,
        }}>
          <img src={branding.logoUrl} alt="" style={{ height: branding.dimensioneLogoPx, display: 'block' }} />
        </div>
      )}

      {elementiVisibili.immagine && (branding.immaginePrincipaleUrl || layout.tipo === 'hero') && (
        <div style={{
          width: '100%',
          aspectRatio: layout.tipo === 'hero' ? '16/9' : '4/3',
          background: branding.immaginePrincipaleUrl ? `url(${branding.immaginePrincipaleUrl}) center/cover` : colori.bordi,
          borderRadius: stile.borderRadiusPx * 0.7,
          marginBottom: stile.spaziaturaPx * 0.6,
        }} />
      )}

      {elementiVisibili.titolo && (
        <h3 style={{ fontSize: tipografia.dimensioneTitoloPx, margin: `0 0 ${stile.spaziaturaPx * 0.3}px`, fontWeight: 800, lineHeight: 1.15 }}>
          {evento.artista}
        </h3>
      )}

      <div style={{ fontSize: tipografia.dimensioneTestoPx, color: colori.testoSecondario, marginBottom: stile.spaziaturaPx * 0.5, lineHeight: 1.5 }}>
        {elementiVisibili.data && <div>📅 {dataFormattata}</div>}
        {elementiVisibili.percorso && <div>📍 {evento.luogo}, {evento.citta}</div>}
      </div>

      {elementiVisibili.descrizione && evento.descrizione && (
        <p style={{ fontSize: tipografia.dimensioneTestoPx * 0.95, color: colori.testoSecondario, marginBottom: stile.spaziaturaPx * 0.6, lineHeight: 1.5 }}>
          {evento.descrizione.length > 120 ? evento.descrizione.slice(0, 120) + '…' : evento.descrizione}
        </p>
      )}

      {elementiVisibili.fermate && (
        <div style={{ fontSize: tipografia.dimensioneTestoPx * 0.9, color: colori.testoSecondario, marginBottom: stile.spaziaturaPx * 0.3 }}>
          Scegli la tua fermata di partenza
        </div>
      )}
      {elementiVisibili.disponibilita && (
        <div style={{ fontSize: tipografia.dimensioneTestoPx * 0.9, color: colori.testoSecondario, marginBottom: stile.spaziaturaPx * 0.6 }}>
          Posti disponibili
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: stile.spaziaturaPx * 0.6 }}>
        {elementiVisibili.prezzo && (
          <span style={{ fontSize: tipografia.dimensioneTitoloPx * 0.75, fontWeight: 800 }}>da €30,00</span>
        )}
      </div>

      {elementiVisibili.cta && (
        <button style={stilePulsante} disabled={!onCtaClick} onClick={onCtaClick}>Prenota ora</button>
      )}

      {elementiVisibili.informazioni && (
        <p style={{ fontSize: tipografia.dimensioneTestoPx * 0.8, color: colori.testoSecondario, marginTop: stile.spaziaturaPx * 0.5, textAlign: 'center' }}>
          Viaggio organizzato da OnWay
        </p>
      )}
    </div>
  );
}
