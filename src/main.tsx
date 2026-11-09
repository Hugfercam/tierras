import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fraunces/latin-500.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-500-italic.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import './styles/global.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el nodo raíz');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
