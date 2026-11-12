// Skeletons: while a page loads it shows its own SHAPE — the table, the
// cards, the record — in quiet shimmering blocks, so the content lands where
// the eye already is instead of replacing the word "Loading…".
import type { CSSProperties } from 'react';
import { tx } from '../i18n';

const WIDTHS = ['72%', '48%', '60%', '36%', '54%', '42%', '66%'];
export function Sk({ w = '100%', h = 12, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
    return <span className="sk" style={{ width: w, height: h, ...style }} />;
}

/** A table's worth of rows. `bare` = already inside a card. */
export function SkeletonTable({ rows = 6, cols = 5, bare }: { rows?: number; cols?: number; bare?: boolean }) {
    const table = (
        <table className="table" role="status" aria-label={tx("Loading")}>
            <thead><tr>{Array.from({ length: cols }, (_, c) => <th key={c}><Sk w={c === 0 ? 70 : 48} h={8} /></th>)}</tr></thead>
            <tbody>
                {Array.from({ length: rows }, (_, r) => (
                    <tr key={r}>{Array.from({ length: cols }, (_, c) => <td key={c}><Sk w={c === 0 ? WIDTHS[r % WIDTHS.length] : WIDTHS[(r + c * 2) % WIDTHS.length]} /></td>)}</tr>
                ))}
            </tbody>
        </table>
    );
    return bare ? table : <div className="card card-flush">{table}</div>;
}

export function SkeletonCards({ n = 3 }: { n?: number }) {
    return <div className="cards" role="status" aria-label={tx("Loading")}>{Array.from({ length: n }, (_, i) => <div key={i} className="card"><Sk w={90} h={10} /><Sk w="55%" h={28} style={{ marginTop: 12 }} /><Sk w="70%" h={10} style={{ marginTop: 12 }} /></div>)}</div>;
}

/** A record: grouped label / value rows. */
export function SkeletonRecord({ groups = 2, rows = 4 }: { groups?: number; rows?: number }) {
    return (
        <div className="groups" role="status" aria-label={tx("Loading")}>
            {Array.from({ length: groups }, (_, g) => (
                <div key={g} className="card card-flush">
                    <div className="eyebrow"><Sk w={80} h={8} /></div>
                    {Array.from({ length: rows }, (_, r) => <div key={r} className="rrow"><Sk w={110} /><Sk w={WIDTHS[(r + g) % WIDTHS.length]} /><span /></div>)}
                </div>
            ))}
        </div>
    );
}

/** A stack of collapsed cards (pay periods). */
export function SkeletonList({ n = 4 }: { n?: number }) {
    return <div className="periods" role="status" aria-label={tx("Loading")}>{Array.from({ length: n }, (_, i) => <div key={i} className="card"><Sk w="32%" h={14} /><Sk w="20%" h={10} style={{ marginTop: 10 }} /></div>)}</div>;
}

/** A few lines of text, for the inside of a dialog. */
export function SkeletonLines({ n = 3 }: { n?: number }) {
    return <div role="status" aria-label={tx("Loading")} style={{ display: 'grid', gap: 12, padding: '6px 0 10px' }}>{Array.from({ length: n }, (_, i) => <Sk key={i} w={WIDTHS[i % WIDTHS.length]} />)}</div>;
}
