// Payments: every disbursement, newest first — who, when, how much, how.
// Recording a payment stays on Payroll (it belongs to a period and a run);
// this page is where a payment is FOUND and corrected: mark a pending one
// paid, delete a wrong one (soft), restore it from "Show deleted".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { paymentsApi, methodLabel, type Payment } from '../api/payments';
import { money, dateOnly } from '../api/team';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import RowMenu from '../components/Menu';
import { PaymentStatsDialog } from '../components/StatsDialog';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function Payments() {
    const { session, org } = useAuth();
    const toast = useToast();
    const thisYear = new Date().getFullYear();
    const [rows, setRows] = useState<Payment[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [year, setYear] = useState<number | ''>(() => new URLSearchParams(window.location.search).get('person') ? '' : thisYear);
    const [params] = useSearchParams();                    // Payroll links here as ?person=12
    const [person, setPerson] = useState<number | ''>(() => Number(params.get('person')) || '');
    const [editing, setEditing] = useState<Payment | null>(null);
    const [stats, setStats] = useState(false);
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
                <button className="btn" onClick={() => setStats(true)}>Statistics</button>
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
                                            { label: 'Edit', onClick: () => setEditing(p) },
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
            {stats && <PaymentStatsDialog onClose={() => setStats(false)} />}
            {editing && <EditPaymentDialog payment={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast('Payment saved'); load(); }} />}
            {confirm && session && org && (
                <Dialog title={`Delete this payment of ${money(confirm.amount_paid)}?`} subtitle={`${confirm.user_name}, ${dateOnly(confirm.payment_date)}.`} onClose={() => setConfirm(null)}
                    footer={<SaveFooter onCancel={() => setConfirm(null)} saving={busy} label="Delete" onSave={() => act(() => paymentsApi.remove(session.userId, org.organization_id, confirm.id), 'Payment deleted')} />}>
                    <p className="muted">What this person is owed goes back up by this amount. It can be restored later from "Show deleted".</p>
                </Dialog>
            )}
        </>
    );
}

const METHODS: [string, string][] = [['e-transfer', 'E-transfer'], ['direct_deposit', 'Direct deposit'], ['cheque', 'Cheque'], ['cash', 'Cash'], ['pay_card', 'Pay card'], ['other', 'Other']];

// Correct a payment that was recorded wrong: the amount, the day, how it was
// paid, its reference and note. Only the fields that changed are sent.
function EditPaymentDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [amount, setAmount] = useState(payment.amount_paid.toFixed(2));
    const [date, setDate] = useState(payment.payment_date.slice(0, 10));
    const [method, setMethod] = useState(payment.payment_method ?? '');
    const [ref, setRef] = useState(payment.transaction_id ?? '');
    const [notes, setNotes] = useState(payment.notes ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const amt = Number(amount.replace(',', '.'));

    async function save() {
        if (!session || !org || !(amt > 0) || !date) return;
        setSaving(true); setError(null);
        const set = (field: string, value: string) => paymentsApi.setField(session.userId, org.organization_id, payment.id, field, value);
        try {
            if (Math.abs(amt - payment.amount_paid) > 0.004) await set('amount_paid', String(amt));
            if (date !== payment.payment_date.slice(0, 10)) await set('payment_date', `${date}T00:00:00.000Z`);
            if (method !== (payment.payment_method ?? '')) await set('payment_method', method);
            if (ref.trim() !== (payment.transaction_id ?? '')) await set('transaction_id', ref.trim());
            if (notes.trim() !== (payment.notes ?? '')) await set('notes', notes.trim());
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }

    return (
        <Dialog title={`Payment #${payment.payment_number}`} subtitle={`${payment.user_name}. What this person is owed follows the amount.`} wide onClose={onClose}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!(amt > 0) || !date} />}>
            <div className="grid-2">
                <label className="field"><span>Amount ($)</span><input inputMode="decimal" value={amount} onFocus={e => e.currentTarget.select()} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} /></label>
                <label className="field"><span>Date paid</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label className="field"><span>Method</span>
                    <select value={method} onChange={e => setMethod(e.target.value)}>
                        <option value="">Not set</option>
                        {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        {method && !METHODS.some(([v]) => v === method) && <option value={method}>{methodLabel(method)}</option>}
                    </select></label>
                <label className="field"><span>Reference</span><input value={ref} onChange={e => setRef(e.target.value)} placeholder="Transfer or cheque number" /></label>
            </div>
            <label className="field"><span>Note</span><input value={notes} onChange={e => setNotes(e.target.value)} /></label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
