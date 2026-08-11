import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { openPaths } from './app/document-actions';
import './styles/index.css';

/**
 * Subscribed here, at module scope, rather than in a component effect: a PDF
 * double-clicked in Explorer is handed over as soon as the page finishes
 * loading, which can be before React has mounted anything. `openPaths` works
 * straight off the store, so it needs no component to be alive.
 */
window.librarius.app.onOpenFiles((event) => void openPaths(event.paths));

const container = document.getElementById('root');
if (container === null) throw new Error('Renderer shell is missing its #root element.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
