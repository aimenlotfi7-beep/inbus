import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { controlloAccessiApi, type EsitoScansione, tokenTourLeader } from '../api/tourLeaderAuth';

const TESTO_ESITO: Record<EsitoScansione['esito'], string> = {
  valido: '✓ VALIDO',
  gia_a_bordo: '✓ GIÀ A BORDO',
  bus_sbagliato: '✕ BUS SBAGLIATO',
  non_valido: '✕ NON VALIDO',
};
const COLORE_ESITO: Record<EsitoScansione['esito'], string> = {
  valido: '#16a34a',
  gia_a_bordo: '#16a34a',
  bus_sbagliato: 'var(--ow-danger-ink, #A31414)',
  non_valido: 'var(--ow-danger-ink, #A31414)',
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
        setErrore('Impossibile accedere alla fotocamera — controlla di aver dato il permesso al browser.');
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

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', position: 'relative', fontFamily: "'Poppins',sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#14121f' }}>
        <button onClick={() => navigate('/scansione')} style={{ background: 'none', border: 'none', color: '#a99fc2', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>← Bus</button>
        {contatore && (
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
            {contatore.saliti} / {contatore.totale} <span style={{ color: '#a99fc2', fontWeight: 400 }}>saliti — Bus {contatore.riferimento}</span>
          </p>
        )}
      </div>

      {errore && <p style={{ color: 'var(--ow-danger-ink, #A31414)', padding: 20, textAlign: 'center' }}>{errore}</p>}

      <div style={{ position: 'relative' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {risultato && (
          <div
            style={{
              position: 'absolute', inset: 0, background: COLORE_ESITO[risultato.esito],
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Poppins',sans-serif",
            }}
          >
            <p style={{ fontSize: 36, fontWeight: 800, margin: 0, textAlign: 'center' }}>{TESTO_ESITO[risultato.esito]}</p>
            {'nome' in risultato && <p style={{ fontSize: 22, marginTop: 10 }}>{risultato.nome}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
