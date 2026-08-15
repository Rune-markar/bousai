import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './footer.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({
  immediate: true,
  onOfflineReady() { window.dispatchEvent(new CustomEvent('sonae-offline-ready')); },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
