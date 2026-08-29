import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/tourleader.css';
import { tourLeaderApi } from '../api/tourleader';
import { eventiApi } from '../api/eventi';
import type { Evento } from '../api/types';
import { ErroreApi } from '../api/client';
import { CookieBanner } from '../features/CookieBanner';

export function TourLeaderPage() {
  const [searchParams] = useSearchParams();
  const eventoId = searchParams.get('evento');
  const [eventoRif, setEventoRif] = useState<Evento | null>(null);

  const [form, setForm] = useState({
    nome: '', cognome: '', email: '', telefono: '', dataNascita: '', citta: '',
    lingue: '', disponibilita: '', esperienza: '', note: '',
  });
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (eventoId) eventiApi.getById(eventoId).then(setEventoRif).catch(() => {});
  }, [eventoId]);

  async function invia() {
    setErrore('');
    if (!form.nome.trim() || !form.cognome.trim()) { setErrore('Inserisci nome e cognome.'); return; }
    if (!form.email.includes('@')) { setErrore('Inserisci un indirizzo email valido.'); return; }
    try {
      await tourLeaderApi.candidatura({
        ...form,
        dataNascita: form.dataNascita || undefined,
        eventoRiferimento: eventoRif?.id,
      });
      setInviato(true);
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Impossibile contattare il server, riprova.');
    }
  }

  return (
    <>
      <header>
        <div className="logo">IN<span>BUS</span></div>
        <Link className="back-link" to="/">← Torna al sito</Link>
      </header>

      <main>
        <h1>Candidati come Tour Leader</h1>
        <p className="sub">Accompagni i nostri gruppi durante il viaggio: gestisci l'imbarco, sei il punto di riferimento per i passeggeri e per l'autista. Raccontaci qualcosa di te, ti ricontatteremo anche per i prossimi viaggi.</p>

        {eventoRif && (
          <div className="evento-context">
            Stai inviando la tua candidatura specificamente per: {eventoRif.artista} — {eventoRif.luogo}, {eventoRif.citta}
            {' '}({new Date(eventoRif.data).toLocaleDateString('it-IT')}).
          </div>
        )}

        {!inviato && (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-grid">
              <label>Nome <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
              <label>Cognome <input type="text" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} required /></label>
              <label>Email <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label>Telefono <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
              <label>Data di nascita <input type="date" value={form.dataNascita} onChange={(e) => setForm({ ...form, dataNascita: e.target.value })} /></label>
              <label>Città <input type="text" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} /></label>
              <label>Lingue parlate <input type="text" placeholder="Italiano, Inglese..." value={form.lingue} onChange={(e) => setForm({ ...form, lingue: e.target.value })} /></label>
              <label>Disponibilità <input type="text" placeholder="es. weekend, tutta l'estate..." value={form.disponibilita} onChange={(e) => setForm({ ...form, disponibilita: e.target.value })} /></label>
              <label className="full">Esperienza pregressa come tour leader / accompagnatore <textarea value={form.esperienza} onChange={(e) => setForm({ ...form, esperienza: e.target.value })} /></label>
              <label className="full">Altro che vuoi dirci <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            </div>
            <p className="errore">{errore}</p>
            <button type="button" className="btn-primary" onClick={invia}>Invia candidatura</button>
          </form>
        )}

        {inviato && (
          <div className="success-box">
            <h2>Candidatura ricevuta 🎉</h2>
            <p>Grazie! Il nostro staff esaminerà il tuo profilo e ti ricontatterà appena ci sarà un viaggio adatto a te.</p>
          </div>
        )}
      </main>
      <CookieBanner />
    </>
  );
}
