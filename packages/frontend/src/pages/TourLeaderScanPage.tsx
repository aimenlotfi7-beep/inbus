import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { controlloAccessiApi, type EsitoScansione, tokenTourLeader } from '../api/tourLeaderAuth';
import { Icona } from '../features/Icone';
import '../styles/account.css';
import '../styles/tourleader.css';

const TESTO_ESITO: Record<EsitoScansione['esito'], string> = {
  valido: 'Valido',
  gia_a_bordo: 'Già a bordo',
  bus_sbagliato: 'Bus sbagliato',
  non_valido: 'Non valido',
};
const ESITO_POSITIVO: Record<EsitoScansione['esito'], boolean> = {
  valido: true,
  gia_a_bordo: true,
  bus_sbagliato: false,
  non_valido: false,
};

/** Pagina di scansione — inquadra il QR del biglietto con la fotocamera
 *  del telefono, controlla che sia valido per QUESTO bus specifico, e lo
 *  segna come "salito" (o conferma "già a bordo" se lo era già, utile
 *  per ricontare tranquillamente ad ogni sosta senza falsi allarmi). */
export function TourLeaderScanPage() {
  const { busId } = useParams<{ busId: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [errore, setErrore] = useState('');
  const [contatore, setContatore] = useState<{ totale: number; saliti: number; riferimento: string } | null>(null);
  const [risultato, setRisultato] = useState<EsitoScansione | null>(null);
  const inCooldown = useRef(false);

  const ricaricaContatore = useCallback(() => {
    if (!busId) return;
    controlloAccessiApi.stato(busId).then(setContatore).catch(() => {});
  }, [busId]);

  useEffect(() => {
    if (!tokenTourLeader()) { navigate('/scansione/accedi'); return; }
    ricaricaContatore();
  }, [navigate, ricaricaContatore]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animazione: number;

    async function avvia() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        ciclo();
      } catch {
        setErrore('Impossibile accedere alla fotocamera: controlla di aver dato il permesso al browser.');
      }
    }

    function ciclo() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const immagine = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const codice = jsQR(immagine.data, immagine.width, immagine.height);
          if (codice && !inCooldown.current) {
            gestisciScansione(codice.data);
          }
        }
      }
      animazione = requestAnimationFrame(ciclo);
    }

    avvia();
    return () => {
      cancelAnimationFrame(animazione);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busId]);

  async function gestisciScansione(contenuto: string) {
    if (!busId) return;
    // "INBUS:TICKET:PNR:token" (biglietti vecchi) o "ONWAY:TICKET:PNR:token"
    // (nuovi, dal rebrand) — accetta entrambi in lettura, il generatore
    // lato backend ora emette solo ONWAY.
    const parti = contenuto.split(':');
    if (parti.length < 4 || (parti[0] !== 'INBUS' && parti[0] !== 'ONWAY') || parti[1] !== 'TICKET') return; // non è un nostro QR, ignoro senza dare errore
    const token = parti.slice(3).join(':');

    inCooldown.current = true;
    try {
      const esito = await controlloAccessiApi.scansiona(busId, token);
      setRisultato(esito);
      ricaricaContatore();
    } catch {
      setRisultato({ esito: 'non_valido' });
    }
    setTimeout(() => {
      setRisultato(null);
      inCooldown.current = false;
    }, 2200);
  }

  const positivo = risultato ? ESITO_POSITIVO[risultato.esito] : false;

  return (
    <div className="tl-scan">
      <div className="tl-scan-barra">
        <button type="button" className="btn btn-tertiary" onClick={() => navigate('/scansione')}>← Eventi</button>
        {contatore && (
          <p className="tl-scan-conteggio">
            {contatore.saliti} / {contatore.totale} <span>saliti · Bus {contatore.riferimento}</span>
          </p>
        )}
      </div>

      {errore && <p className="avviso avviso-errore tl-scan-errore" role="alert">{errore}</p>}

      <div className="tl-scan-video">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />

        {risultato && (
          <div className={`tl-scan-esito ${positivo ? 'ok' : 'ko'}`} role="status" aria-live="assertive">
            <p className="tl-scan-esito-testo">
              <Icona nome={positivo ? 'spunta' : 'chiudi'} dimensione={40} strokeWidth={3} />
              {TESTO_ESITO[risultato.esito]}
            </p>
            {'nome' in risultato && <p className="tl-scan-esito-nome">{risultato.nome}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
