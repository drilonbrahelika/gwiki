import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyBrand, loadConfig } from './config';
import { DEFAULT_MESSAGES } from './messages';
import { applyTheme } from './lib/theme';
import '@fontsource-variable/inter';
import './styles.css';

applyTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
const root = createRoot(container);

loadConfig().then(
  config => {
    applyBrand(config);
    root.render(<StrictMode><App config={config} /></StrictMode>);
  },
  (error: Error) => {
    // Without a valid config there is no copy to load, so this screen uses the defaults.
    root.render(
      <main className="page" style={{ maxWidth: 560, marginTop: '15vh' }}>
        <h1 className="title">{DEFAULT_MESSAGES.notConfiguredTitle}</h1>
        <div className="alert" role="alert">{error.message}</div>
        <p className="muted">{DEFAULT_MESSAGES.notConfiguredBody}</p>
      </main>,
    );
  },
);
