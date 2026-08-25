import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { whiteLabelApi, type WhiteLabelPubblica } from '../api/whiteLabel';
import { WhiteLabelPreview } from '../features/white-label/WhiteLabelPreview';
import { ErroreApi } from '../api/client';

export function WidgetPubblicoPage() {
  const { publicWidgetId } = useParams<{ publicWidgetId: string }>();
  const navigate = useNavigate();
  const [dati, setDati] = useState<WhiteLabelPubblica | null>(null);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!publicWidgetId) return;
    whiteLabelApi.getPubblica(publicWidgetId)
      .then(setDati)
      .catch((e) => setErrore(e instanceof ErroreApi ? e.message : 'Impossibile caricare questa pagina.'));
  }, [publicWidgetId]);

  if (errore) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#14121f', color: '#a99fc2' }}>
        <p>{errore}</p>
      </div>
    );
  }

  if (!dati) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#14121f', color: '#a99fc2' }}>
        <p>Carico...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: dati.tema.colori.sfondo, padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <WhiteLabelPreview
          tema={dati.tema}
          evento={dati.evento}
          larghezza={400}
          onCtaClick={dati.attiva ? () => navigate(`/eventi/${dati.evento.slug}`) : undefined}
        />
      </div>

      {!dati.attiva && (
        <p style={{ color: dati.tema.colori.testoSecondario, fontSize: 13, marginBottom: 12 }}>
          Questo viaggio non è al momento disponibile per l'acquisto.
        </p>
      )}
    </div>
  );
}
