import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { CarrelloProvider } from './features/carrello/CarrelloContext';
import './styles/sito.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CarrelloProvider>
        <App />
      </CarrelloProvider>
    </BrowserRouter>
  </StrictMode>
);
