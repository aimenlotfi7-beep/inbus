import { useState } from 'react';
import type { WhiteLabel, WhiteLabelTheme } from '../../api/whiteLabel';
import { whiteLabelApi } from '../../api/whiteLabel';
import { WhiteLabelPreview } from './WhiteLabelPreview';

type Dispositivo = 'desktop' | 'tablet' | 'mobile';
const LARGHEZZE: Record<Dispositivo, number> = { desktop: 380, tablet: 320, mobile: 280 };

interface DatiEvento { artista: string; data: string; luogo: string; citta: string; descrizione?: string | null }

export function WhiteLabelEditor({ whiteLabel, evento, onSalvato }: { whiteLabel: WhiteLabel; evento: DatiEvento; onSalvato: (wl: WhiteLabel) => void }) {
  const [tema, setTema] = useState<WhiteLabelTheme>(whiteLabel.tema);
  const [dispositivo, setDispositivo] = useState<Dispositivo>('desktop');
  const [salvando, setSalvando] = useState(false);
  const [domini, setDomini] = useState(whiteLabel.dominiAutorizzati.join('\n'));

  function aggiorna<K extends keyof WhiteLabelTheme>(sezione: K, campo: keyof WhiteLabelTheme[K], valore: unknown) {
    setTema((t) => ({ ...t, [sezione]: { ...t[sezione], [campo]: valore } }));
  }

  async function salva() {
    setSalvando(true);
    try {
      const dominiPuliti = domini.split('\n').map((d) => d.trim()).filter(Boolean);
      const aggiornata = await whiteLabelApi.update(whiteLabel.id, { tema, dominiAutorizzati: dominiPuliti });
      onSalvato(aggiornata);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 24, alignItems: 'start' }}>
      <div>
        <p className="section-label" style={{ marginBottom: 10 }}>Branding</p>
        <div className="campo"><label>Logo (URL)</label><input value={tema.branding.logoUrl ?? ''} onChange={(e) => aggiorna('branding', 'logoUrl', e.target.value || null)} /></div>
        <div className="campo"><label>Immagine principale (URL)</label><input value={tema.branding.immaginePrincipaleUrl ?? ''} onChange={(e) => aggiorna('branding', 'immaginePrincipaleUrl', e.target.value || null)} /></div>
        <div className="campo">
          <label>Posizione logo</label>
          <select value={tema.branding.posizioneLogo} onChange={(e) => aggiorna('branding', 'posizioneLogo', e.target.value)}>
            <option value="in-alto-a-sinistra">In alto a sinistra</option>
            <option value="in-alto-al-centro">In alto al centro</option>
            <option value="in-alto-a-destra">In alto a destra</option>
          </select>
        </div>

        <p className="section-label" style={{ margin: '18px 0 10px' }}>Colori</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(['sfondo', 'superficie', 'testoPrincipale', 'testoSecondario', 'cta', 'testoCta', 'bordi'] as const).map((campo) => (
            <div className="campo" key={campo}>
              <label>{campo}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="color" value={tema.colori[campo]} onChange={(e) => aggiorna('colori', campo, e.target.value)} style={{ width: 40, padding: 2 }} />
                <input value={tema.colori[campo]} onChange={(e) => aggiorna('colori', campo, e.target.value)} />
              </div>
            </div>
          ))}
        </div>

        <p className="section-label" style={{ margin: '18px 0 10px' }}>Tipografia</p>
        <div className="campo"><label>Font</label><input value={tema.tipografia.font} onChange={(e) => aggiorna('tipografia', 'font', e.target.value)} /></div>

        <p className="section-label" style={{ margin: '18px 0 10px' }}>Stile e layout</p>
        <div className="campo">
          <label>Layout</label>
          <select value={tema.layout.tipo} onChange={(e) => aggiorna('layout', 'tipo', e.target.value)}>
            <option value="card">Card</option>
            <option value="hero">Hero</option>
            <option value="horizontal">Orizzontale</option>
          </select>
        </div>
        <div className="campo">
          <label>Stile pulsanti</label>
          <select value={tema.stile.stilePulsanti} onChange={(e) => aggiorna('stile', 'stilePulsanti', e.target.value)}>
            <option value="pieno">Pieno</option>
            <option value="contorno">Contorno</option>
            <option value="arrotondato">Arrotondato (pillola)</option>
          </select>
        </div>

        <p className="section-label" style={{ margin: '18px 0 10px' }}>Elementi visibili</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(Object.keys(tema.elementiVisibili) as (keyof WhiteLabelTheme['elementiVisibili'])[]).map((campo) => (
            <label key={campo} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={tema.elementiVisibili[campo]} onChange={(e) => aggiorna('elementiVisibili', campo, e.target.checked)} />
              {campo}
            </label>
          ))}
        </div>

        <p className="section-label" style={{ margin: '18px 0 10px' }}>Domini autorizzati</p>
        <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 6 }}>Uno per riga, es. https://www.sitoorganizzatore.it — controllo aggiuntivo, non l'unico meccanismo di sicurezza.</p>
        <textarea value={domini} onChange={(e) => setDomini(e.target.value)} rows={3} style={{ width: '100%' }} />

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={salva} disabled={salvando}>
          {salvando ? 'Salvataggio...' : 'Salva White Label'}
        </button>
      </div>

      <div style={{ position: 'sticky', top: 20 }}>
        <div className="mini-tabs" style={{ marginBottom: 14 }}>
          <button type="button" className={`mini-tab${dispositivo === 'desktop' ? ' active' : ''}`} onClick={() => setDispositivo('desktop')}>Desktop</button>
          <button type="button" className={`mini-tab${dispositivo === 'tablet' ? ' active' : ''}`} onClick={() => setDispositivo('tablet')}>Tablet</button>
          <button type="button" className={`mini-tab${dispositivo === 'mobile' ? ' active' : ''}`} onClick={() => setDispositivo('mobile')}>Mobile</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20, background: 'var(--night)', borderRadius: 12 }}>
          <WhiteLabelPreview tema={tema} evento={evento} larghezza={LARGHEZZE[dispositivo]} />
        </div>
      </div>
    </div>
  );
}
