import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Prima i fogli del sito, POI i componenti: Vite mette il CSS nel bundle
// nell'ordine in cui incontra gli import. Con App prima, i fogli d'area
// importati dalle pagine (account.css, promoter.css, tourleader.css,
// faq.css, pagina.css) finivano PRIMA di base.css e perdevano a parità
// di specificità. Ordine voluto: sito.css → onway-theme.css → aree.
import './styles/sito.css';
import './styles/onway-theme.css';
import { App } from './App';
import { CarrelloProvider } from './features/carrello/CarrelloContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* v7_relativeSplatPath attivato subito (toglie un avviso in console):
        nessuna rotta usa link relativi dentro la rotta "*", non cambia
        nulla. v7_startTransition NO: la ricerca dell'header è un campo
        controllato dall'indirizzo (?q=) e con gli aggiornamenti in
        transizione le lettere digitate potrebbero sparire e ricomparire. */}
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <CarrelloProvider>
        <App />
      </CarrelloProvider>
    </BrowserRouter>
  </StrictMode>
);
