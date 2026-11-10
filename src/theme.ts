// Theme: System (follow the device), Light, Dark, or Book — the same four the
// phones offer, with the same palettes (index.css). The choice lives in this
// browser only. It is applied to <html data-theme> BEFORE React renders, so a
// reload never flashes the wrong palette.
export type ThemeChoice = 'system' | 'light' | 'dark' | 'book';
const KEY = 'cio.theme';

export function storedTheme(): ThemeChoice {
    try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'book') return v; } catch { /* private mode */ }
    return 'system';
}

export function applyTheme(choice: ThemeChoice) {
    const root = document.documentElement;
    if (choice === 'system') delete root.dataset.theme; else root.dataset.theme = choice;
}

export function setTheme(choice: ThemeChoice) {
    try { if (choice === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { /* still applies for this visit */ }
    applyTheme(choice);
}
