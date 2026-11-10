import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme, storedTheme } from './theme';

// Before the first paint, so a reload never flashes the wrong palette.
applyTheme(storedTheme());

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
