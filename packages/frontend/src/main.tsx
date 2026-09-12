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
    <BrowserRouter>
      <CarrelloProvider>
        <App />
      </CarrelloProvider>
    </BrowserRouter>
  </StrictMode>
);
