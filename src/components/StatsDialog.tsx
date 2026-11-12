// Statistics dialogs — one per page, one shape: the year's headline figures
// as tiles, then ranked bars (who, which client, which month), each bar with
// its value printed beside it so nothing depends on hovering. One hue for
// magnitude (the accent); state colours only where they mean their state.
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { statsApi, type TeamStats, type PayrollStats, type PaymentStats, type InvoiceStats, type JobStats } from '../api/stats';
import { money, employmentLabel, dateOnly } from '../api/team';
import { methodLabel } from '../api/payments';
import { useAuth } from '../auth';
import Dialog from './Dialog';
import { SkeletonCards, SkeletonLines } from './Skeleton';
import { useToast } from './Toast';

const hrs = (v: number) => `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;

function Tiles({ items }: { items: { label: string; value: string; tone?: 'danger' | 'caution' }[] }) {
    return <div className="tiles">{items.map(i => <div key={i.label} className="tile"><div className="stat-label">{i.label}</div><div className={'stat stat-sm' + (i.tone ? ` ${i.tone}` : '')}>{i.value}</div></div>)}</div>;
}

/** Ranked horizontal bars: label, bar to scale, value. */
function Bars({ title, rows, empty }: { title: string; rows: { key: string | number; label: string; sub?: string; value: number; text: string }[]; empty: string }) {
    const max = Math.max(0, ...rows.map(r => r.value));
    return (
        <>
            <div className="eyebrow nopad">{title}</div>
            {rows.length === 0 ? <p className="muted small">{empty}</p> : (
                <div className="bars">
                    {rows.map(r => (
                        <div key={r.key} className="bar-row">
                            <div className="bar-label"><span>{r.label}</span>{r.sub && <span className="faint small">{r.sub}</span>}</div>
                            <div className="bar-track"><div className="bar-fill" style={{ width: `${max > 0 ? Math.max(1.5, (r.value / max) * 100) : 0}%` }} /></div>
                            <div className="bar-value">{r.text}</div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

/** Twelve columns for the months of the year. */
function Months({ title, rows }: { title: string; rows: { month: number; label: string; total: number }[] }) {
    const max = Math.max(0, ...rows.map(r => r.total));
    return (
        <>
            <div className="eyebrow nopad">{title}</div>
            <div className="cols" role="img" aria-label={`${title}: ${rows.map(r => `${r.label} ${money(r.total)}`).join(', ')}`}>
                {rows.map(r => (
                    <div key={r.month} className="col" title={`${r.label}: ${money(r.total)}`}>
                        <div className="col-track"><div className="col-fill" style={{ height: `${max > 0 ? (r.total / max) * 100 : 0}%` }} /></div>
                        <div className="col-label">{r.label.slice(0, 3)}</div>
                    </div>
                ))}
            </div>
            <p className="faint small">Highest month: {rows.length ? money(max) : '—'}. Point at a column for its amount.</p>
        </>
    );
}

/** The shared frame: loads by year, shows the year picker and the exports. */
function useYearStats<T extends { year: number; available_years: number[] }>(load: (year?: number) => Promise<T>) {
    const { session, org } = useAuth();
    const [year, setYear] = useState<number | undefined>(undefined);
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!session || !org) return;
        let stale = false;
        setData(null); setError(null);
        load(year).then(r => { if (!stale) setData(r); }).catch(e => { if (!stale) setError(e instanceof ApiError ? e.message : 'Could not load the statistics'); });
        return () => { stale = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, org, year]);
    return { data, error, year: data?.year ?? year, setYear };
}

function Frame({ title, onClose, years, year, onYear, exports, error, loading, children }: {
    title: string; onClose: () => void; years?: number[]; year?: number; onYear?: (y: number) => void;
    exports?: { label: string; run: () => Promise<string | undefined> }[]; error: string | null; loading: boolean; children: ReactNode;
}) {
    const toast = useToast();
    const [busy, setBusy] = useState<string | null>(null);
    return (
        <Dialog title={title} wide onClose={onClose}
            footer={<>
                {exports?.map(x => (
                    <button key={x.label} className="btn" disabled={busy === x.label || loading} onClick={async () => {
                        setBusy(x.label);
                        try { const url = await x.run(); if (url) window.open(url, '_blank', 'noopener'); else toast('Nothing to export', 'error'); }
                        catch (e) { toast(e instanceof ApiError ? e.message : 'Could not export', 'error'); }
                        finally { setBusy(null); }
                    }}>{busy === x.label ? 'Preparing…' : x.label}</button>
                ))}
                <button className="btn btn-primary" onClick={onClose}>Close</button>
            </>}>
            {years && years.length > 0 && onYear && (
                <label className="field inline" style={{ marginBottom: 12 }}><span>Year</span>
                    <select value={year ?? ''} onChange={e => onYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
            )}
            {error ? <p className="error-line">{error}</p> : loading ? <><SkeletonCards n={3} /><SkeletonLines n={5} /></> : children}
        </Dialog>
    );
}

export function TeamStatsDialog({ onClose }: { onClose: () => void }) {
    const { session, org } = useAuth();
    const { data, error, year, setYear } = useYearStats<TeamStats>(y => statsApi.team(session!.userId, org!.organization_id, y));
    return (
        <Frame title="Team statistics" onClose={onClose} years={data?.available_years} year={year} onYear={setYear} error={error} loading={!data}
            exports={session && org ? [
                { label: 'CSV', run: async () => (await statsApi.teamCsv(session.userId, org.organization_id, year)).csv_url },
                { label: 'PDF', run: async () => { const r = await statsApi.teamPdf(session.userId, org.organization_id, year); return r.pdf_url ?? r.pdfUrl; } },
            ] : []}>
            {data && <>
                <Tiles items={[{ label: 'Hours worked', value: hrs(data.totals.hours) }, { label: 'Earned', value: money(data.totals.earned) }, { label: 'Shifts', value: String(data.totals.shifts) }, { label: 'Active members', value: String(data.totals.active_members) }]} />
                <Bars title="Hours by person" empty="No hours this year." rows={data.leaderboard.map(p => ({ key: p.user_id, label: p.full_name, sub: `${employmentLabel(p.employment_type)} · ${p.shifts} ${p.shifts === 1 ? 'shift' : 'shifts'} · ${money(p.earned)}`, value: p.hours, text: hrs(p.hours) }))} />
                <Bars title="Headcount by employment type" empty="Nobody on the team yet." rows={data.headcount.map(h => ({ key: h.employment_type, label: h.employment_type === 'unspecified' ? 'Not set' : employmentLabel(h.employment_type), value: h.count, text: String(h.count) }))} />
            </>}
        </Frame>
    );
}

export function PayrollStatsDialog({ onClose }: { onClose: () => void }) {
    const { session, org } = useAuth();
    const { data, error, year, setYear } = useYearStats<PayrollStats>(y => statsApi.payroll(session!.userId, org!.organization_id, y));
    const t = data?.tax_components;
    const taxes = t ? [['Income tax', t.income_tax], ['CPP', t.cpp], ['EI', t.ei], ['Social Security', t.ss], ['Medicare', t.medicare], ['Other deductions', t.other]].filter(([, v]) => Number(v) > 0.004) as [string, number][] : [];
    return (
        <Frame title="Payroll statistics" onClose={onClose} years={data?.available_years} year={year} onYear={setYear} error={error} loading={!data}
            exports={session && org ? [{ label: 'PDF', run: async () => { const r = await statsApi.payrollPdf(session.userId, org.organization_id, year); return r.pdf_url ?? r.pdfUrl; } }] : []}>
            {data && <>
                <Tiles items={[{ label: 'Gross', value: money(data.totals.gross) }, { label: 'Withheld', value: money(data.totals.withheld) }, { label: 'Net', value: money(data.totals.net) }, { label: 'Paid out', value: money(data.totals.paid) }]} />
                <Bars title="Where the withholding went" empty="Nothing was withheld this year." rows={taxes.map(([label, v]) => ({ key: label, label, value: v, text: money(v) }))} />
                <Bars title={`Gross by person (${data.totals.employees})`} empty="No payroll this year." rows={data.employees.map(e => ({ key: e.user_id, label: e.full_name, sub: `net ${money(e.net)} · paid ${money(e.paid)}`, value: e.gross, text: money(e.gross) }))} />
            </>}
        </Frame>
    );
}

export function PaymentStatsDialog({ onClose }: { onClose: () => void }) {
    const { session, org } = useAuth();
    const { data, error, year, setYear } = useYearStats<PaymentStats>(y => statsApi.payments(session!.userId, org!.organization_id, y));
    return (
        <Frame title="Payment statistics" onClose={onClose} years={data?.available_years} year={year} onYear={setYear} error={error} loading={!data}
            exports={session && org ? [{ label: 'PDF', run: async () => { const r = await statsApi.paymentsPdf(session.userId, org.organization_id, year); return r.pdf_url ?? r.pdfUrl; } }] : []}>
            {data && <>
                <Tiles items={[{ label: 'Paid out', value: money(data.totals.paid) }, { label: 'Payments', value: String(data.totals.count) }, { label: 'Average payment', value: money(data.totals.count ? data.totals.paid / data.totals.count : 0) }]} />
                <Months title="By month" rows={data.monthly} />
                <Bars title="By method" empty="No payments this year." rows={data.methods.map(m => ({ key: m.method, label: methodLabel(m.method), sub: `${m.count} ${m.count === 1 ? 'payment' : 'payments'}`, value: m.total, text: money(m.total) }))} />
            </>}
        </Frame>
    );
}

export function InvoiceStatsDialog({ onClose }: { onClose: () => void }) {
    const { session, org } = useAuth();
    const { data, error, year, setYear } = useYearStats<InvoiceStats>(y => statsApi.invoices(session!.userId, org!.organization_id, y));
    return (
        <Frame title="Invoice statistics" onClose={onClose} years={data?.available_years} year={year} onYear={setYear} error={error} loading={!data}>
            {data && <>
                <Tiles items={[{ label: 'Billed', value: money(data.totals.billed) }, { label: 'Paid', value: money(data.totals.paid) }, { label: 'Outstanding', value: money(data.totals.outstanding) }, { label: 'Overdue', value: money(data.totals.overdue), tone: data.totals.overdue > 0.004 ? 'danger' : undefined }]} />
                <Bars title={`Billed by client (${data.totals.invoice_count} ${data.totals.invoice_count === 1 ? 'invoice' : 'invoices'})`} empty="Nothing billed this year." rows={data.by_client.map(c => ({ key: c.client_name, label: c.client_name, sub: `${c.count} ${c.count === 1 ? 'invoice' : 'invoices'}`, value: c.total, text: money(c.total) }))} />
            </>}
        </Frame>
    );
}

export function JobStatsDialog({ jobId, onClose }: { jobId: number; onClose: () => void }) {
    const { session, org } = useAuth();
    const [data, setData] = useState<JobStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!session || !org) return;
        let stale = false;
        statsApi.job(session.userId, org.organization_id, jobId).then(r => { if (!stale) setData(r); }).catch(e => { if (!stale) setError(e instanceof ApiError ? e.message : 'Could not load the statistics'); });
        return () => { stale = true; };
    }, [session, org, jobId]);
    return (
        <Frame title={data ? `${data.job_name} · statistics` : 'Job statistics'} onClose={onClose} error={error} loading={!data}
            exports={session && org ? [{ label: 'PDF', run: async () => { const r = await statsApi.jobPdf(session.userId, org.organization_id, jobId); return r.pdf_url ?? r.pdfUrl; } }] : []}>
            {data && <>
                <Tiles items={[{ label: 'Hours', value: hrs(data.totals.hours) }, { label: 'Labour cost', value: money(data.totals.earned) }, { label: 'Shifts', value: String(data.totals.shifts) }, { label: 'People', value: String(data.totals.workers) }]} />
                <Bars title="Hours by person" empty="Nobody has worked on this job yet." rows={data.workers.map(w => ({ key: w.user_id, label: w.full_name, sub: `${w.shifts} ${w.shifts === 1 ? 'shift' : 'shifts'} · ${money(w.earned)}${w.last_worked ? ` · last ${dateOnly(w.last_worked)}` : ''}`, value: w.hours, text: hrs(w.hours) }))} />
            </>}
        </Frame>
    );
}
