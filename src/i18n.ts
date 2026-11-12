// ============================================================
// i18n.ts — the dashboard in English, Spanish, French and Ukrainian
//
// THE RULE: the English sentence IS the key.
//     tx('Add member')                       → "Añadir miembro"
//     tx('Delete {0}?', job.name)            → "¿Eliminar Closson?"
//     txn(n, '{n} shift', '{n} shifts')      → "3 зміни" (one / few / many)
// A string with no translation simply shows its English, so a new screen
// never shows a broken key — and a brief that gives the exact English is
// automatically shared with the phones' catalogs (same rule the Mac uses).
//
// The dictionary for the chosen language is loaded BEFORE the app's modules
// run (see main.tsx), so even text held in module-level constants is
// translated. Changing the language reloads the page: once, on purpose —
// simpler and safer than re-rendering every cached label.
//
// What is NOT translated here: sentences that come from the server
// (refusals, validation messages) and the PDFs it prints. Those are English
// on the phones too, for now.
// ============================================================

export type Lang = 'en' | 'es' | 'fr' | 'uk';
export const LANGS: { id: Lang; label: string }[] = [
    { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }, { id: 'fr', label: 'Français' }, { id: 'uk', label: 'Українська' },
];
const KEY = 'cio.lang';

type Forms = Partial<Record<Intl.LDMLPluralRule, string>>;
type Locale = { strings: Record<string, string>; plurals: Record<string, Forms> };

let current: Lang = 'en';
let strings: Record<string, string> = {};
let plurals: Record<string, Forms> = {};
let rules = new Intl.PluralRules('en');

/** The saved choice; otherwise the browser's language when it is one of ours; otherwise English. */
export function storedLang(): Lang {
    try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'es' || v === 'fr' || v === 'uk') return v; } catch { /* private mode */ }
    const b = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return b === 'es' || b === 'fr' || b === 'uk' ? b : 'en';
}

const loaders = import.meta.glob<{ default: Locale }>('./locales/*.json');

export async function loadLang(l: Lang): Promise<void> {
    current = l;
    rules = new Intl.PluralRules(l);
    document.documentElement.lang = l;
    strings = {}; plurals = {};
    if (l === 'en') return;
    try {
        const mod = await loaders[`./locales/${l}.json`]?.();
        if (mod) { strings = mod.default.strings ?? {}; plurals = mod.default.plurals ?? {}; }
    } catch { /* the dictionary failed to load: English is a working fallback */ }
}

/** Save the choice and start over in it. */
export function setLang(l: Lang) {
    try { localStorage.setItem(KEY, l); } catch { /* applies after the reload only if it could be stored */ }
    window.location.reload();
}

/** The language in force — also the locale for dates, times and numbers. */
export const lang = (): Lang => current;

const fill = (s: string, args: unknown[]) => args.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : s;

/** Translate a sentence; {0}, {1}… are filled from the arguments. */
export function tx(text: string, ...args: unknown[]): string {
    return fill(strings[text] ?? text, args);
}

/** A count with its noun: {n} is the number; the form follows the language's plural rules. */
export function txn(n: number, one: string, other: string, ...args: unknown[]): string {
    const forms = plurals[other];
    const form = forms ? (forms[rules.select(n)] ?? forms.other ?? other) : (n === 1 ? one : other);
    return fill(form.replace(/\{n\}/g, String(n)), args);
}

// ── Units: one place, so "h" becomes "год" everywhere at once ────────────────
/** "8.5 h" */
export const hoursText = (v: number, digits = 1) => tx('{0} h', v.toFixed(digits));
/** "$32.00/h" from an already formatted amount */
export const perHour = (amount: string) => tx('{0}/h', amount);
