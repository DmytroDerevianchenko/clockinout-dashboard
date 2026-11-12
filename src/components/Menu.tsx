// RowMenu: the "⋯" at the end of a table row — the web's version of the
// phone's long-press menu. Everything a row can do that is not its one
// primary action lives here, so no row grows a wall of buttons and nothing
// the phone offers is left without a door.
//
// The list is rendered in a portal with position: fixed: a table inside a
// scrolling card would otherwise clip it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string } | null | false | undefined;

export default function RowMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const btn = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const shown = items.filter(Boolean) as Exclude<MenuItem, null | false | undefined>[];

    // Place the list under the button, right-aligned; flip above when it would leave the window.
    useLayoutEffect(() => {
        if (!open || !btn.current || !list.current) return;
        const b = btn.current.getBoundingClientRect(), m = list.current.getBoundingClientRect();
        const below = b.bottom + 6 + m.height <= window.innerHeight - 8;
        setPos({ top: below ? b.bottom + 6 : Math.max(8, b.top - 6 - m.height), left: Math.max(8, Math.min(b.right - m.width, window.innerWidth - m.width - 8)) });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        const onDown = (e: MouseEvent) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
    }, [open]);

    if (shown.length === 0) return null;
    return (
        <>
            <button ref={btn} type="button" className="btn btn-sm btn-icon" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(o => !o)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
            {open && createPortal(
                <div ref={list} className="menu" role="menu" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
                    {shown.map(i => (
                        <button key={i.label} type="button" role="menuitem" className={'menu-item' + (i.danger ? ' danger' : '')} disabled={i.disabled} title={i.hint}
                            onClick={() => { setOpen(false); i.onClick(); }}>
                            {i.label}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}
