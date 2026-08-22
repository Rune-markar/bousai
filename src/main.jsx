import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './footer.css';
import { registerSW } from 'virtual:pwa-register';
import { APP_ENVIRONMENT } from './appEnvironment.js';

document.documentElement.dataset.appEnvironment = APP_ENVIRONMENT.id;
if (APP_ENVIRONMENT.isDemo) document.title = `デモ | ${document.title}`;

registerSW({
  immediate: true,
  onOfflineReady() { window.dispatchEvent(new CustomEvent('sonae-offline-ready')); },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
