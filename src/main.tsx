import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyTheme, storedTheme } from './theme';
import { loadLang, storedLang } from './i18n';

// Before the first paint, so a reload never flashes the wrong palette.
applyTheme(storedTheme());

// The dictionary BEFORE the app: App is imported only once the language is
// loaded, so every module — including text kept in module-level constants
// (menus, option lists) — is evaluated already translated.
loadLang(storedLang()).then(async () => {
    const { default: App } = await import('./App');
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
});
