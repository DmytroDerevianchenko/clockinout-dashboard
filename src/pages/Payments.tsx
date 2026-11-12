// Payments: every disbursement, newest first — who, when, how much, how.
// Recording a payment stays on Payroll (it belongs to a period and a run);
// this page is where a payment is FOUND and corrected: mark a pending one
// paid, delete a wrong one (soft), restore it from "Show deleted".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { paymentsApi, methodLabel, type Payment } from '../api/payments';
import { money, dateOnly } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import RowMenu from '../components/Menu';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function Payments() {
    const { session, org } = useAuth();
    const toast = useToast();
    const thisYear = new Date().getFullYear();
    const [rows, setRows] = useState<Payment[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [year, setYear] = useState<number | ''>(thisYear);
    const [person, setPerson] = useState<number | ''>('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [confirm, setConfirm] = useState<Payment | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        if (!session || !org) return;
        paymentsApi.list(session.userId, org.organization_id, showDeleted)
            .then(r => { setRows(r.payments); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load payments'));
    }, [session, org, showDeleted]);
    useEffect(() => { setRows(null); load(); }, [load]);

    const people = useMemo(() => [...new Map((rows ?? []).map(p => [p.user_id, p.user_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
    const years = useMemo(() => [...new Set([thisYear, ...(rows ?? []).map(p => Number(p.payment_date.slice(0, 4)))])].sort((a, b) => b - a), [rows, thisYear]);
    const list = (rows ?? []).filter(p => (year === '' || p.payment_date.startsWith(String(year))) && (person === '' || p.user_id === person));
    const total = list.filter(p => !p.is_deleted).reduce((t, p) => t + p.amount_paid, 0);

    async function act(fn: () => Promise<unknown>, message: string) {
        setBusy(true);
        try { await fn(); toast(message); setConfirm(null); load(); }
        catch (e) { toast(e instanceof ApiError ? e.message : 'Could not do that', 'error'); }
        finally { setBusy(false); }
    }

    if (error && !rows) return <div className="card danger">{error}</div>;
    return (
        <>
            <div className="toolbar">
                <label className="field inline"><span>Year</span>
                    <select value={year} onChange={e => setYear(e.target.value === '' ? '' : Number(e.target.value))}><option value="">All years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
                <label className="field inline"><span>Person</span>
                    <select value={person} onChange={e => setPerson(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Everyone</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                <label className="check"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted</label>
                <span className="spacer" />
                <button className="btn" onClick={async () => {
                    if (!session || !org) return;
                    try { const r = await paymentsApi.csv(session.userId, org.organization_id, year === '' ? undefined : year); if (r.csv_url) window.open(r.csv_url, '_blank', 'noopener'); }
                    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not export', 'error'); }
                }}>Export CSV</button>
            </div>
            <div className="card card-flush">
                <div className="eyebrow">{list.filter(p => !p.is_deleted).length} {list.filter(p => !p.is_deleted).length === 1 ? 'payment' : 'payments'} · {money(total)}</div>
                {!rows ? <SkeletonTable bare rows={6} cols={6} /> : list.length === 0 ? <div className="empty">No payments match. Payments are recorded from Payroll.</div> : (
                    <table className="table table-hover">
                        <thead><tr><th>Date</th><th>Person</th><th>Amount</th><th>Method</th><th>Status</th><th>Note</th><th></th></tr></thead>
                        <tbody>
                            {list.map(p => (
                                <tr key={p.id} className={p.is_deleted ? 'muted' : ''}>
                                    <td>{dateOnly(p.payment_date)}</td>
                                    <td><strong>{p.user_name}</strong><div className="faint small">Payment #{p.payment_number}{p.invoice_id ? ' · contractor invoice' : ''}</div></td>
                                    <td>{money(p.amount_paid)}</td>
                                    <td>{methodLabel(p.payment_method)}{p.transaction_id && <div className="faint small">{p.transaction_id}</div>}</td>
                                    <td>{p.is_deleted ? <span className="pill danger">Deleted</span> : <span className={'pill' + (p.status === 'pending' ? ' caution' : p.status === 'failed' ? ' danger' : ' live')}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>}</td>
                                    <td className="muted">{p.notes ?? ''}</td>
                                    <td className="actions">
                                        {session && org && <RowMenu items={p.is_deleted ? [
                                            { label: 'Restore', onClick: () => act(() => paymentsApi.recover(session.userId, org.organization_id, p.id), 'Payment restored') },
                                        ] : [
                                            p.status === 'pending' && { label: 'Mark paid', onClick: () => act(() => paymentsApi.setField(session.userId, org.organization_id, p.id, 'status', 'paid'), 'Marked paid') },
                                            p.status === 'paid' && { label: 'Mark completed', onClick: () => act(() => paymentsApi.setField(session.userId, org.organization_id, p.id, 'status', 'completed'), 'Marked completed') },
                                            { label: 'Delete', danger: true, onClick: () => setConfirm(p) },
                                        ]} />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {confirm && session && org && (
                <Dialog title={`Delete this payment of ${money(confirm.amount_paid)}?`} subtitle={`${confirm.user_name}, ${dateOnly(confirm.payment_date)}.`} onClose={() => setConfirm(null)}
                    footer={<SaveFooter onCancel={() => setConfirm(null)} saving={busy} label="Delete" onSave={() => act(() => paymentsApi.remove(session.userId, org.organization_id, confirm.id), 'Payment deleted')} />}>
                    <p className="muted">What this person is owed goes back up by this amount. It can be restored later from "Show deleted".</p>
                </Dialog>
            )}
        </>
    );
}
