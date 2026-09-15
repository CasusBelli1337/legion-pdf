import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { openPaths } from './app/document-actions';
import { queueCombineFiles } from './features/combine';
import './styles/index.css';

/**
 * Subscribed here, at module scope, rather than in a component effect: a PDF
 * double-clicked in Explorer is handed over as soon as the page finishes
 * loading, which can be before React has mounted anything. Both handlers work
 * straight off a store, so neither needs a component to be alive.
 *
 * `intent: 'combine'` is Explorer's "Combine in Legion PDF" verb: those files
 * go into the Combine Files list instead of opening a tab each.
 */
window.librarius.app.onOpenFiles((event) => {
  if (event.intent === 'combine') queueCombineFiles(event.paths);
  else void openPaths(event.paths);
});

const container = document.getElementById('root');
if (container === null) throw new Error('Renderer shell is missing its #root element.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
