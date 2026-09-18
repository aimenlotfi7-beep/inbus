import { useEffect, useState } from 'react';
import { FONT_WHITE_LABEL, whiteLabelApi, type WhiteLabel, type WhiteLabelTheme } from '../../api/whiteLabel';
import { notifica } from '../../admin/shared/notifiche';
import { motivoErrore } from '../../admin/shared/errori';
import { CampoColore, CampoImmagine, CampoInterruttore, CampoMisura, CampoScelta, CampoTestoTema, SezioneEditor } from './campiTema';
import { caricaFontTema, piePagina, sfondoPagina, stileCampo, stilePulsante, stileRiquadro, testoPulsante, variabiliTema } from './tema';
import { WhiteLabelPreview } from './WhiteLabelPreview';

/** L'editor grafico di una White Label: a sinistra le scelte, a destra
 *  l'anteprima dal vivo di quello che vede il cliente finale (vetrina,
 *  accesso, checkout) su schermo grande o telefono.
 *
 *  Regola del proprietario (settembre 2026): la grafica la decide INBUS
 *  dal gestionale, e con alcuni clienti il cliente finale non deve
 *  accorgersi di essere su un'altra piattaforma — per questo c'è
 *  l'interruttore del marchio OnWay e si può cambiare tutto: sfondi,
 *  immagini, font, forme, colori di ogni parte e testi. */

type Dispositivo = 'grande' | 'telefono';
type Schermata = 'vetrina' | 'accesso' | 'checkout';
const LARGHEZZE: Record<Dispositivo, number> = { grande: 420, telefono: 300 };

interface DatiEvento { artista: string; data: string; luogo: string; citta: string; descrizione?: string | null }

const ETICHETTE_ELEMENTI: Record<keyof WhiteLabelTheme['elementiVisibili'], string> = {
  logo: 'Logo',
  immagine: 'Immagine',
  titolo: 'Titolo',
  data: 'Data',
  percorso: 'Luogo e città',
  fermate: 'Scritta sulle fermate',
  prezzo: 'Prezzo',
  disponibilita: 'Posti disponibili',
  descrizione: 'Descrizione',
  cta: 'Pulsante di prenotazione',
  informazioni: 'Nota in fondo',
};

export function WhiteLabelEditor({ whiteLabel, evento, onSalvato }: { whiteLabel: WhiteLabel; evento: DatiEvento; onSalvato: (wl: WhiteLabel) => void }) {
  const [tema, setTema] = useState<WhiteLabelTheme>(whiteLabel.tema);
  const [dispositivo, setDispositivo] = useState<Dispositivo>('grande');
  const [schermata, setSchermata] = useState<Schermata>('vetrina');
  const [salvando, setSalvando] = useState(false);
  const [domini, setDomini] = useState(whiteLabel.dominiAutorizzati.join('\n'));

  // I font scelti si caricano anche qui, altrimenti l'anteprima mostrerebbe
  // un font diverso da quello che vedrà il cliente.
  useEffect(() => { caricaFontTema(tema); }, [tema.tipografia.font, tema.tipografia.fontTitoli]); // eslint-disable-line react-hooks/exhaustive-deps

  function aggiorna<K extends keyof WhiteLabelTheme>(sezione: K, campo: keyof WhiteLabelTheme[K], valore: unknown) {
    setTema((t) => ({ ...t, [sezione]: { ...t[sezione], [campo]: valore } }));
  }

  async function salva() {
    setSalvando(true);
    try {
      const dominiPuliti = domini.split('\n').map((d) => d.trim()).filter(Boolean);
      const aggiornata = await whiteLabelApi.update(whiteLabel.id, { tema, dominiAutorizzati: dominiPuliti });
      notifica('Grafica salvata: è già online sul link e sul codice da incollare.', 'successo');
      onSalvato(aggiornata);
    } catch (e) {
      notifica(`Salvataggio non riuscito: ${motivoErrore(e)}`, 'errore');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="wl-editor">
      <div className="wl-scelte">
        <SezioneEditor titolo="Marca e immagini" aiuto="Logo e immagini del cliente. Le immagini si caricano dal computer oppure si incolla il loro indirizzo.">
          <CampoImmagine etichetta="Logo" aiuto="Compare in cima alla vetrina." valore={tema.branding.logoUrl} onCambia={(v) => aggiorna('branding', 'logoUrl', v)} />
          <CampoImmagine etichetta="Logo per telefono" aiuto="Facoltativo: se vuoto si usa il logo normale." valore={tema.branding.logoMobileUrl} onCambia={(v) => aggiorna('branding', 'logoMobileUrl', v)} />
          <CampoMisura etichetta="Altezza del logo" valore={tema.branding.dimensioneLogoPx} min={16} max={200} onCambia={(v) => aggiorna('branding', 'dimensioneLogoPx', v)} />
          <CampoScelta
            etichetta="Posizione del logo"
            valore={tema.branding.posizioneLogo}
            opzioni={[
              { valore: 'in-alto-a-sinistra', nome: 'In alto a sinistra' },
              { valore: 'in-alto-al-centro', nome: 'In alto al centro' },
              { valore: 'in-alto-a-destra', nome: 'In alto a destra' },
            ]}
            onCambia={(v) => aggiorna('branding', 'posizioneLogo', v)}
          />
          <CampoImmagine etichetta="Immagine dell'evento" aiuto="Quella dentro la vetrina." valore={tema.branding.immaginePrincipaleUrl} onCambia={(v) => aggiorna('branding', 'immaginePrincipaleUrl', v)} />
          <CampoImmagine etichetta="Immagine larga" aiuto="Usata quando la vetrina è in formato «immagine grande»." valore={tema.branding.heroImageUrl} onCambia={(v) => aggiorna('branding', 'heroImageUrl', v)} />
          <CampoImmagine etichetta="Sfondo della pagina" aiuto="Si vede dietro il riquadro, solo nel link e nella pagina intera." valore={tema.branding.sfondoImmagineUrl} onCambia={(v) => aggiorna('branding', 'sfondoImmagineUrl', v)} />
          {tema.branding.sfondoImmagineUrl && (
            <>
              <CampoScelta
                etichetta="Come si comporta lo sfondo"
                valore={tema.branding.sfondoImmagineModo}
                opzioni={[
                  { valore: 'copri', nome: 'Riempie tutto' },
                  { valore: 'fisso', nome: 'Riempie tutto e resta fermo' },
                  { valore: 'affianca', nome: 'Si ripete a piastrelle' },
                ]}
                onCambia={(v) => aggiorna('branding', 'sfondoImmagineModo', v)}
              />
              <CampoMisura etichetta="Velo sopra lo sfondo" aiuto="Più alto, più l'immagine si scurisce e il testo si legge." valore={tema.branding.sfondoVeloPercentuale} min={0} max={100} unita="%" onCambia={(v) => aggiorna('branding', 'sfondoVeloPercentuale', v)} />
            </>
          )}
          <CampoImmagine etichetta="Icona della scheda del browser" aiuto="Solo per il link diretto." valore={tema.branding.faviconUrl} onCambia={(v) => aggiorna('branding', 'faviconUrl', v)} />
        </SezioneEditor>

        <SezioneEditor titolo="Colori" aiuto="Ogni parte della pagina ha il suo colore: puoi farla sembrare in tutto e per tutto il sito del cliente.">
          <CampoColore etichetta="Sfondo della pagina" valore={tema.colori.sfondo} onCambia={(v) => aggiorna('colori', 'sfondo', v)} />
          <CampoColore etichetta="Riquadri" aiuto="Il fondo delle schede e dei moduli." valore={tema.colori.superficie} onCambia={(v) => aggiorna('colori', 'superficie', v)} />
          <CampoColore etichetta="Testo" valore={tema.colori.testoPrincipale} onCambia={(v) => aggiorna('colori', 'testoPrincipale', v)} />
          <CampoColore etichetta="Testo meno importante" valore={tema.colori.testoSecondario} onCambia={(v) => aggiorna('colori', 'testoSecondario', v)} />
          <CampoColore etichetta="Bordi e righe" valore={tema.colori.bordi} onCambia={(v) => aggiorna('colori', 'bordi', v)} />
          <CampoColore etichetta="Pulsante principale" valore={tema.colori.cta} onCambia={(v) => aggiorna('colori', 'cta', v)} />
          <CampoColore etichetta="Testo del pulsante principale" valore={tema.colori.testoCta} onCambia={(v) => aggiorna('colori', 'testoCta', v)} />
          <CampoColore etichetta="Pulsante secondario" aiuto="«Ho già un account», «Indietro»." valore={tema.colori.ctaSecondaria} onCambia={(v) => aggiorna('colori', 'ctaSecondaria', v)} />
          <CampoColore etichetta="Testo del pulsante secondario" valore={tema.colori.testoCtaSecondaria} onCambia={(v) => aggiorna('colori', 'testoCtaSecondaria', v)} />
          <CampoColore etichetta="Prezzi ed evidenze" valore={tema.colori.accento} onCambia={(v) => aggiorna('colori', 'accento', v)} />
          <CampoColore etichetta="Campi da compilare" valore={tema.colori.campoSfondo} onCambia={(v) => aggiorna('colori', 'campoSfondo', v)} />
          <CampoColore etichetta="Testo dentro i campi" valore={tema.colori.campoTesto} onCambia={(v) => aggiorna('colori', 'campoTesto', v)} />
        </SezioneEditor>

        <SezioneEditor titolo="Scritte" aiuto="I font arrivano da Google Fonts. «Di sistema» usa quello del telefono o del computer di chi guarda.">
          <CampoScelta
            etichetta="Font dei testi"
            valore={tema.tipografia.font}
            opzioni={FONT_WHITE_LABEL.map((f) => ({ valore: f as string, nome: f }))}
            onCambia={(v) => aggiorna('tipografia', 'font', v)}
          />
          <CampoScelta
            etichetta="Font dei titoli"
            aiuto="Lascia «Come i testi» per usarne uno solo."
            valore={tema.tipografia.fontTitoli ?? ''}
            opzioni={[{ valore: '', nome: 'Come i testi' }, ...FONT_WHITE_LABEL.map((f) => ({ valore: f as string, nome: f }))]}
            onCambia={(v) => aggiorna('tipografia', 'fontTitoli', v === '' ? null : v)}
          />
          <CampoMisura etichetta="Grandezza dei titoli" valore={tema.tipografia.dimensioneTitoloPx} min={12} max={64} onCambia={(v) => aggiorna('tipografia', 'dimensioneTitoloPx', v)} />
          <CampoMisura etichetta="Grandezza del testo" valore={tema.tipografia.dimensioneTestoPx} min={10} max={28} onCambia={(v) => aggiorna('tipografia', 'dimensioneTestoPx', v)} />
        </SezioneEditor>

        <SezioneEditor titolo="Forme" aiuto="Angoli, pulsanti e spazi: danno il «carattere» della pagina.">
          <CampoScelta
            etichetta="Forma dei pulsanti"
            valore={tema.stile.stilePulsanti}
            opzioni={[
              { valore: 'pieno', nome: 'Pieni' },
              { valore: 'contorno', nome: 'Solo contorno' },
              { valore: 'arrotondato', nome: 'A pillola' },
            ]}
            onCambia={(v) => aggiorna('stile', 'stilePulsanti', v)}
          />
          <CampoMisura etichetta="Angoli arrotondati" valore={tema.stile.borderRadiusPx} min={0} max={40} onCambia={(v) => aggiorna('stile', 'borderRadiusPx', v)} />
          <CampoMisura etichetta="Altezza dei pulsanti" valore={tema.stile.altezzaPulsantePx} min={28} max={80} onCambia={(v) => aggiorna('stile', 'altezzaPulsantePx', v)} />
          <CampoMisura etichetta="Spazio interno" valore={tema.stile.spaziaturaPx} min={4} max={48} onCambia={(v) => aggiorna('stile', 'spaziaturaPx', v)} />
          <CampoMisura etichetta="Larghezza del riquadro" aiuto="Quanto è largo il contenuto nella pagina del link." valore={tema.stile.larghezzaPx} min={280} max={1200} onCambia={(v) => aggiorna('stile', 'larghezzaPx', v)} />
          <CampoInterruttore etichetta="Ombra sotto i riquadri" valore={tema.stile.ombre} onCambia={(v) => aggiorna('stile', 'ombre', v)} />
          <CampoInterruttore etichetta="Bordo attorno ai riquadri" valore={tema.stile.mostraBordi} onCambia={(v) => aggiorna('stile', 'mostraBordi', v)} />
          <CampoScelta
            etichetta="Formato della vetrina"
            valore={tema.layout.tipo}
            opzioni={[
              { valore: 'card', nome: 'Scheda' },
              { valore: 'hero', nome: 'Immagine grande' },
              { valore: 'horizontal', nome: 'Orizzontale' },
            ]}
            onCambia={(v) => aggiorna('layout', 'tipo', v)}
          />
        </SezioneEditor>

        <SezioneEditor titolo="Testi" aiuto="Lascia vuoto per usare quello che scrive OnWay di suo (per esempio il nome dell'evento).">
          <CampoTestoTema etichetta="Titolo" segnaposto={evento.artista} valore={tema.testi.titolo} onCambia={(v) => aggiorna('testi', 'titolo', v)} />
          <CampoTestoTema etichetta="Sottotitolo" segnaposto="(nessuno)" valore={tema.testi.sottotitolo} onCambia={(v) => aggiorna('testi', 'sottotitolo', v)} />
          <CampoTestoTema etichetta="Testo del pulsante" segnaposto="Prenota ora" valore={tema.testi.pulsante} onCambia={(v) => aggiorna('testi', 'pulsante', v)} />
          <CampoTestoTema etichetta="Nota in fondo" segnaposto="(nessuna)" valore={tema.testi.piePagina} onCambia={(v) => aggiorna('testi', 'piePagina', v)} />
          <CampoTestoTema etichetta="Titolo della scheda del browser" aiuto="Solo per il link diretto; vuoto = nome dell'evento." segnaposto={evento.artista} valore={tema.branding.titoloPagina} onCambia={(v) => aggiorna('branding', 'titoloPagina', v)} />
        </SezioneEditor>

        <SezioneEditor titolo="Marchio OnWay" aiuto="Con alcuni clienti il cliente finale non deve accorgersi che dietro c'è OnWay.">
          <CampoInterruttore
            etichetta="Scrivi che il viaggio è organizzato da OnWay"
            aiuto="Spento: nella pagina non compare nessun riferimento a OnWay."
            valore={tema.marchio.mostraOnWay}
            onCambia={(v) => aggiorna('marchio', 'mostraOnWay', v)}
          />
        </SezioneEditor>

        <SezioneEditor titolo="Cosa mostrare nella vetrina">
          {(Object.keys(ETICHETTE_ELEMENTI) as (keyof WhiteLabelTheme['elementiVisibili'])[]).map((campo) => (
            <CampoInterruttore
              key={campo}
              etichetta={ETICHETTE_ELEMENTI[campo]}
              valore={tema.elementiVisibili[campo]}
              onCambia={(v) => aggiorna('elementiVisibili', campo, v)}
            />
          ))}
        </SezioneEditor>

        <SezioneEditor titolo="Siti autorizzati" aiuto="Uno per riga, per esempio https://www.sitodelcliente.it. È un controllo in più, non l'unico.">
          <div className="wl-campo-largo">
            <textarea value={domini} onChange={(e) => setDomini(e.target.value)} rows={3} style={{ width: '100%' }} aria-label="Siti autorizzati" />
          </div>
        </SezioneEditor>

        <div className="wl-salva">
          <button type="button" className="btn btn-primary" onClick={salva} disabled={salvando}>
            {salvando ? 'Salvataggio…' : 'Salva la grafica'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setTema(whiteLabel.tema)} disabled={salvando}>Annulla le modifiche</button>
        </div>
      </div>

      <div className="wl-anteprima">
        <div className="mini-tabs">
          <button type="button" className={`mini-tab${schermata === 'vetrina' ? ' active' : ''}`} onClick={() => setSchermata('vetrina')}>Vetrina</button>
          <button type="button" className={`mini-tab${schermata === 'accesso' ? ' active' : ''}`} onClick={() => setSchermata('accesso')}>Accesso</button>
          <button type="button" className={`mini-tab${schermata === 'checkout' ? ' active' : ''}`} onClick={() => setSchermata('checkout')}>Prenotazione</button>
        </div>
        <div className="mini-tabs">
          <button type="button" className={`mini-tab${dispositivo === 'grande' ? ' active' : ''}`} onClick={() => setDispositivo('grande')}>Schermo grande</button>
          <button type="button" className={`mini-tab${dispositivo === 'telefono' ? ' active' : ''}`} onClick={() => setDispositivo('telefono')}>Telefono</button>
        </div>
        <div className="wl-anteprima-schermo" style={{ ...sfondoPagina(tema), ...variabiliTema(tema) }}>
          {schermata === 'vetrina' && <WhiteLabelPreview tema={tema} evento={evento} larghezza={LARGHEZZE[dispositivo]} />}
          {schermata === 'accesso' && <AnteprimaAccesso tema={tema} larghezza={LARGHEZZE[dispositivo]} />}
          {schermata === 'checkout' && <AnteprimaCheckout tema={tema} larghezza={LARGHEZZE[dispositivo]} />}
        </div>
        <p className="wl-anteprima-nota">Anteprima dal vivo: è quello che vede il cliente finale. Le modifiche vanno online quando salvi.</p>
      </div>
    </div>
  );
}

/** Come vede l'accesso il cliente finale (stesso tema della pagina vera). */
function AnteprimaAccesso({ tema, larghezza }: { tema: WhiteLabelTheme; larghezza: number }) {
  return (
    <div style={{ ...stileRiquadro(tema), width: larghezza }}>
      <p style={{ fontWeight: 700, margin: `0 0 ${tema.stile.spaziaturaPx * 0.7}px`, fontSize: tema.tipografia.dimensioneTestoPx }}>Accedi o registrati per continuare</p>
      {/* Come nella pagina vera (Campo in WidgetPubblicoPage): etichetta sopra ogni campo. */}
      <span style={{ display: 'block', margin: '0 0 4px', fontSize: tema.tipografia.dimensioneTestoPx * 0.85, color: tema.colori.testoSecondario }}>Email</span>
      <input readOnly value="mario.rossi@email.it" aria-label="Email (esempio)" style={{ ...stileCampo(tema), marginBottom: 10 }} />
      <span style={{ display: 'block', margin: '0 0 4px', fontSize: tema.tipografia.dimensioneTestoPx * 0.85, color: tema.colori.testoSecondario }}>Password</span>
      <input readOnly type="password" value="password" aria-label="Password (esempio)" style={{ ...stileCampo(tema), marginBottom: 10 }} />
      <button type="button" style={stilePulsante(tema)} disabled>Accedi</button>
      <button type="button" style={{ ...stilePulsante(tema, 'secondario'), marginTop: 8 }} disabled>Creo un account nuovo</button>
      <NotaAnteprima tema={tema} />
    </div>
  );
}

/** Come vede la prenotazione: fermata, posti, totale e pulsante. */
function AnteprimaCheckout({ tema, larghezza }: { tema: WhiteLabelTheme; larghezza: number }) {
  const spazio = tema.stile.spaziaturaPx;
  return (
    <div style={{ ...stileRiquadro(tema), width: larghezza }}>
      <p style={{ fontWeight: 700, margin: `0 0 ${spazio * 0.6}px`, fontSize: tema.tipografia.dimensioneTestoPx }}>Fermata e posti</p>
      <div style={{ ...stileCampo(tema), marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>Milano, Piazza Duomo</span>
        <span style={{ color: tema.colori.testoSecondario }}>08:00</span>
      </div>
      <div style={{ ...stileCampo(tema), marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
        <span>Passeggeri</span>
        <span style={{ color: tema.colori.testoSecondario }}>2</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spazio * 0.6 }}>
        <span style={{ color: tema.colori.testoSecondario, fontSize: tema.tipografia.dimensioneTestoPx }}>Totale</span>
        <b style={{ color: tema.colori.accento, fontSize: tema.tipografia.dimensioneTitoloPx * 0.8 }}>60,00 €</b>
      </div>
      <button type="button" style={stilePulsante(tema)} disabled>{testoPulsante(tema)}</button>
      <NotaAnteprima tema={tema} />
    </div>
  );
}

function NotaAnteprima({ tema }: { tema: WhiteLabelTheme }) {
  const nota = piePagina(tema);
  if (!nota) return null;
  return (
    <p style={{ margin: `${tema.stile.spaziaturaPx * 0.5}px 0 0`, textAlign: 'center', fontSize: tema.tipografia.dimensioneTestoPx * 0.8, color: tema.colori.testoSecondario }}>
      {nota}
    </p>
  );
}
