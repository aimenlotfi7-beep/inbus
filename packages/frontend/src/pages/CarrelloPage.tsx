import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrello } from '../features/carrello/CarrelloContext';
import { clienteAuthApi, type DatiCliente } from '../api/clienteAuth';
import { prenotazioniApi } from '../api/prenotazioni';
import { clienteLoggato } from '../features/clienteSessione';

/** Il carrello vero e proprio — elenco articoli, quantità modificabile,
 *  e il checkout finale che manda TUTTO insieme in un'unica richiesta
 *  al server (che ricalcola ogni prezzo da zero e crea tutto in
 *  un'unica transazione atomica: o va tutto a buon fine, o niente). */
export function CarrelloPage() {
  const { articoli, rimuovi, aggiornaPasseggeri, svuota, totaleStimato } = useCarrello();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<DatiCliente | null>(null);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState<{ pnr: string }[] | null>(null);

  useEffect(() => {
    if (clienteLoggato()) clienteAuthApi.me().then(setCliente).catch(() => {});
  }, []);

  async function completaAcquisto() {
    if (!clienteLoggato()) {
      navigate('/accedi?dopo=/carrello');
      return;
    }
    if (!cliente) return;
    setInviando(true);
    setErrore('');
    try {
      const risultato = await prenotazioniApi.creaOrdine(
        articoli.map((a) => ({
          eventoId: a.eventoId,
          tragittoId: a.tragittoId,
          fermataId: a.fermataId,
          passeggeri: a.passeggeri,
          tipoPagamento: 'COMPLETO' as const,
          metodoPagamento: 'CARTA' as const,
          cliente: { email: cliente.email, nome: cliente.nome ?? '', cognome: cliente.cognome ?? '', telefono: cliente.telefono ?? '' },
          // Semplificazione di questa prima versione: i passeggeri
          // oltre al richiedente prendono lo stesso nome — chi vuole
          // indicare nomi diversi persona per persona può ancora usare
          // il checkout diretto di un singolo evento (con il modulo
          // passeggeri completo), raggiungibile dalla pagina evento.
          partecipanti: Array.from({ length: a.passeggeri - 1 }, () => ({ nome: cliente.nome ?? '', cognome: cliente.cognome ?? '' })),
        }))
      );
      setFatto(risultato.prenotazioni.map((p) => ({ pnr: p.pnr })));
      svuota();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Acquisto non riuscito. Riprova.');
    } finally {
      setInviando(false);
    }
  }

  if (fatto) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24 }}>🎉 Ordine completato!</h1>
        <p style={{ color: 'var(--mist)', marginBottom: 20 }}>
          Hai prenotato {fatto.length} biglietto{fatto.length === 1 ? '' : 'i'} — trovi tutto nel tuo account, con i PDF pronti da scaricare.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/account">Vai ai miei biglietti</Link>
          <Link className="btn btn-ghost" to="/">Torna al sito</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Il tuo carrello</h1>

      {articoli.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ color: 'var(--mist)', marginBottom: 16 }}>Il carrello è vuoto.</p>
          <Link className="btn btn-primary" to="/#eventi">Scopri gli eventi</Link>
        </div>
      )}

      {articoli.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {articoli.map((a) => (
              <div key={a.id} className="ticket" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <b>{a.eventoArtista}</b>
                  <p style={{ fontSize: 13, color: 'var(--mist)', margin: '4px 0 0' }}>
                    {a.fermataCitta}{a.fermataOrario ? ` · ore ${a.fermataOrario}` : ''} · {new Date(a.eventoData).toLocaleDateString('it-IT')}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => aggiornaPasseggeri(a.id, a.passeggeri - 1)}>−</button>
                  <b>{a.passeggeri}</b>
                  <button type="button" className="btn btn-ghost" onClick={() => aggiornaPasseggeri(a.id, a.passeggeri + 1)}>+</button>
                  <b style={{ minWidth: 70, textAlign: 'right' }}>€{(a.prezzoStimato * a.passeggeri).toFixed(2)}</b>
                  <button type="button" className="btn btn-ghost" style={{ color: 'var(--pink)' }} onClick={() => rimuovi(a.id)} aria-label="Rimuovi">✕</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '1px solid var(--line)', marginBottom: 20 }}>
            <span>Totale stimato</span>
            <b style={{ fontSize: 20 }}>€{totaleStimato.toFixed(2)}</b>
          </div>
          <p style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 16 }}>
            Il totale definitivo viene sempre ricalcolato al momento del pagamento (coupon, offerte e disponibilità vengono verificati di nuovo in quel preciso istante).
          </p>

          {errore && <p className="errore" style={{ marginBottom: 12 }}>{errore}</p>}

          {!clienteLoggato() && (
            <p style={{ fontSize: 13.5, marginBottom: 12 }}>
              <Link to="/accedi?dopo=/carrello" style={{ textDecoration: 'underline' }}>Accedi o registrati</Link> per completare l'acquisto.
            </p>
          )}

          <button type="button" className="search-cta" onClick={completaAcquisto} disabled={inviando}>
            {inviando ? 'Sto elaborando...' : `Completa l'acquisto — €${totaleStimato.toFixed(2)}`}
          </button>
        </>
      )}
    </div>
  );
}
