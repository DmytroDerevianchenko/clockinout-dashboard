// A modal sheet: the web's version of the phone's editor sheet. Escape and
// the backdrop close it; Save is the caller's, so the footer is generic.
import { useEffect, type ReactNode } from 'react';

export default function Dialog({ title, subtitle, onClose, children, footer, wide }: {
    title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
                <div className="modal-head">
                    <h2>{title}</h2>
                    {subtitle && <p className="muted">{subtitle}</p>}
                </div>
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-foot">{footer}</div>}
            </div>
        </div>
    );
}

/** The usual Cancel / Save pair. */
export function SaveFooter({ onCancel, onSave, saving, label = 'Save', disabled }: {
    onCancel: () => void; onSave: () => void; saving?: boolean; label?: string; disabled?: boolean;
}) {
    return (
        <>
            <button className="btn" type="button" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={onSave} disabled={saving || disabled}>{saving ? 'Saving…' : label}</button>
        </>
    );
}
