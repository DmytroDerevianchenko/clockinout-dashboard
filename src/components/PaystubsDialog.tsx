// Several paystubs in ONE PDF.
//
// "Send us all your paystubs for the year" — a bank, a landlord, a tax office
// all ask for it, and it used to mean opening and saving each period on its
// own. Here: pick the person, tick the pay periods, and the server builds one
// file with a page per period, oldest first (POST /generate-paystubs — the
// same builder as a single paystub, so the pages are identical to it).
//
// The list is the person's periods that HAVE calculated payroll; loading a
// year runs the same calculation the Payroll page does, so nothing is missing
// just because nobody had opened that period yet. Ticks survive a change of
// year: a pay year often starts with a period from late December.
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { payroll, money, hours, periodLabel, type PayPeriod } from '../api/payroll';
import type { RosterUser } from '../api/team';
import { useAuth } from '../auth';
import Dialog from './Dialog';
import { SkeletonLines } from './Skeleton';
import { tx, txn } from '../i18n';

export default function PaystubsDialog({ people, years, defaultPerson, defaultYear, onClose }: {
    people: RosterUser[]; years: number[]; defaultPerson?: number; defaultYear: number; onClose: () => void;
}) {
    const { session, org } = useAuth();
    const [person, setPerson] = useState<number | ''>(defaultPerson ?? '');
    const [year, setYear] = useState(defaultYear);
    const [periods, setPeriods] = useState<PayPeriod[] | null>(null);
    const [picked, setPicked] = useState<Set<number>>(new Set());
    const [building, setBuilding] = useState(false);
    const [result, setResult] = useState<{ url: string; count: number; skipped: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // the chosen year's periods (this also calculates any payroll not yet run)
    useEffect(() => {
        if (!session || !org) return;
        let stale = false;
        setPeriods(null); setError(null);
        payroll.periods(session.userId, org.organization_id, year)
            .then(r => { if (!stale) setPeriods([...r.payPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date))); })
            .catch(e => { if (!stale) { setPeriods([]); setError(e instanceof ApiError ? e.message : tx('Could not load payroll')); } });
        return () => { stale = true; };
    }, [session, org, year]);

    // this person's periods with something to print
    const rows = useMemo(() => {
        if (!periods || person === '') return [];
        return periods.flatMap(p => {
            const b = p.userBalances.find(x => x.userId === person);
            return b && b.hasPayrollRun ? [{ p, b }] : [];
        });
    }, [periods, person]);

    // a new person starts from "everything in view"; a new year adds its periods to the ticks
    useEffect(() => { setPicked(new Set()); setResult(null); }, [person]);
    useEffect(() => {
        if (rows.length === 0) return;
        setPicked(prev => { const next = new Set(prev); rows.forEach(r => next.add(r.p.id)); return next; });
    }, [rows]);

    const toggle = (id: number) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const setVisible = (on: boolean) => setPicked(prev => { const next = new Set(prev); rows.forEach(r => on ? next.add(r.p.id) : next.delete(r.p.id)); return next; });
    const elsewhere = [...picked].filter(id => !rows.some(r => r.p.id === id)).length;

    async function build() {
        if (!org || person === '' || picked.size === 0) return;
        setBuilding(true); setError(null); setResult(null);
        try {
            const r = await payroll.paystubs(person, org.organization_id, [...picked]);
            if (!r.pdf_url) throw new Error('no file');   // falls to the generic message below
            setResult({ url: r.pdf_url, count: r.count ?? picked.size, skipped: r.skipped?.length ?? 0 });
            window.open(r.pdf_url, '_blank', 'noopener');
        } catch (e) { setError(e instanceof ApiError ? e.message : tx('Could not build the file')); }
        finally { setBuilding(false); }
    }

    return (
        <Dialog title={tx('Several paystubs in one PDF')} wide onClose={onClose}
            subtitle={tx('One file with a page per pay period, oldest first — for a bank, a landlord or a tax office that asks for the whole year.')}
            footer={<>
                <button className="btn" onClick={onClose}>{tx('Close')}</button>
                <button className="btn btn-primary" disabled={building || person === '' || picked.size === 0} onClick={build}>
                    {building ? tx('Building…') : txn(picked.size, 'Open {n} paystub as one PDF', 'Open {n} paystubs as one PDF')}
                </button>
            </>}>
            <div className="grid-2">
                <label className="field"><span>{tx('Person')}</span>
                    <select value={person} onChange={e => setPerson(e.target.value === '' ? '' : Number(e.target.value))} autoFocus>
                        <option value="">{tx('Choose a person')}</option>
                        {people.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select></label>
                <label className="field"><span>{tx('Year')}</span>
                    <select value={year} onChange={e => setYear(Number(e.target.value))}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select></label>
            </div>

            {person !== '' && (periods === null ? <SkeletonLines n={6} /> : rows.length === 0
                ? <p className="muted">{tx('No calculated pay periods for this person in {0}.', year)}</p>
                : <>
                    <div className="toolbar" style={{ margin: '4px 0' }}>
                        <button className="btn btn-sm" onClick={() => setVisible(true)}>{tx('Select all')}</button>
                        <button className="btn btn-sm" onClick={() => setVisible(false)}>{tx('Clear')}</button>
                        {elsewhere > 0 && <span className="faint small">{txn(elsewhere, '+ {n} period ticked in another year', '+ {n} periods ticked in other years')}</span>}
                    </div>
                    {rows.map(({ p, b }) => (
                        <label key={p.id} className="check">
                            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                            <span><strong>{periodLabel(p)}</strong> <span className="muted small">· {hours(b.totalHours)} · {tx('net {0}', money(b.netAmount))}</span></span>
                        </label>
                    ))}
                </>)}

            {result && <p className="small">
                <a href={result.url} target="_blank" rel="noopener noreferrer">{txn(result.count, 'Open the PDF ({n} paystub)', 'Open the PDF ({n} paystubs)')}</a>
                {result.skipped > 0 && <span className="caution"> · {txn(result.skipped, '{n} period had no payroll yet and was left out', '{n} periods had no payroll yet and were left out')}</span>}
            </p>}
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
