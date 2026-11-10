// The four themes as one small segmented control (sidebar foot).
import { useState, type ReactNode } from 'react';
import { setTheme, storedTheme, type ThemeChoice } from '../theme';

const svg = (children: ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const OPTIONS: { id: ThemeChoice; label: string; icon: ReactNode }[] = [
    { id: 'system', label: 'Match the device', icon: svg(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>) },
    { id: 'light', label: 'Light', icon: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) },
    { id: 'dark', label: 'Dark', icon: svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />) },
    { id: 'book', label: 'Book page', icon: svg(<><path d="M2 5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3v15a2 2 0 0 0-2-2H2z" /><path d="M22 5a2 2 0 0 0-2-2h-5a3 3 0 0 0-3 3v15a2 2 0 0 1 2-2h8z" /></>) },
];

export default function ThemeSwitch() {
    const [choice, setChoice] = useState<ThemeChoice>(storedTheme);
    return (
        <div className="seg" role="radiogroup" aria-label="Theme">
            {OPTIONS.map(o => (
                <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} title={o.label} aria-label={o.label}
                    className={'seg-btn' + (choice === o.id ? ' on' : '')} onClick={() => { setTheme(o.id); setChoice(o.id); }}>
                    {o.icon}
                </button>
            ))}
        </div>
    );
}
