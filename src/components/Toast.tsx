// Toasts: the short confirmation after something was done ("Saved", "Added 5
// shifts to Alex") or a failure that has no dialog left to show itself in.
// One provider at the top; any page calls useToast() and then
// toast(message) or toast(message, 'error').
// They stack at the bottom, announce themselves to screen readers, and leave
// on their own — an error stays a little longer.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'error';
type Item = { id: number; message: string; kind: Kind };
const Ctx = createContext<(message: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<Item[]>([]);
    const next = useRef(1);
    const toast = useCallback((message: string, kind: Kind = 'ok') => {
        const id = next.current++;
        setItems(list => [...list.slice(-2), { id, message, kind }]);      // at most three on screen
        window.setTimeout(() => setItems(list => list.filter(i => i.id !== id)), kind === 'error' ? 6500 : 3800);
    }, []);
    return (
        <Ctx.Provider value={toast}>
            {children}
            <div className="toasts" aria-live="polite">
                {items.map(i => (
                    <div key={i.id} className={'toast' + (i.kind === 'error' ? ' error' : '')} role={i.kind === 'error' ? 'alert' : 'status'}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {i.kind === 'error' ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></> : <path d="m5 12.5 4.5 4.5L19 7.5" />}
                        </svg>
                        <span>{i.message}</span>
                    </div>
                ))}
            </div>
        </Ctx.Provider>
    );
}

export const useToast = () => useContext(Ctx);
