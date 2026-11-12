// The person's balance: what the organization owes them (or they owe it),
// the adjustments on file, and the editor for a new one — an opening
// balance when the crew moves into the app, a cash advance, a correction.
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { team, type Adjustment, type OwedRow, money, dateOnly } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';
import { SkeletonLines } from './Skeleton';
import { tx } from '../i18n';

export default function BalanceDialog({ userId, name, onClose, onChanged }: { userId: number; name: string; onClose: () => void; onChanged: () => void }) {
    const { session, org } = useAuth();
    const [owed, setOwed] = useState<OwedRow | null>(null);
    const [list, setList] = useState<Adjustment[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [dir, setDir] = useState<'owe' | 'owed'>('owe');       // owe = org owes them
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [note, setNote] = useState('');
    const [kind, setKind] = useState<'opening' | 'adjustment'>('adjustment');
    const [saving, setSaving] = useState(false);

    const load = () => {
        if (!session || !org) return;
        Promise.all([team.owed(session.userId, org.organization_id), team.adjustments(session.userId, org.organization_id, userId)])
            .then(([o, a]) => { setOwed(o.employees.find(e => e.user_id === userId) ?? null); setList(a.adjustments); if (a.adjustments.length === 0) setKind('opening'); })
            .catch(e => setError(e instanceof ApiError ? e.message : tx("Could not load the balance")));
    };
    useEffect(load, [session, org, userId]); // eslint-disable-line react-hooks/exhaustive-deps

    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        const amt = (Number(amount) || 0) * (dir === 'owe' ? 1 : -1);
        try {
            await team.addAdjustment(session.userId, org.organization_id, { targetUserId: userId, amount: amt, adjustedOn: date, kind, note: note.trim() || null });
            setAdding(false); setAmount(''); setNote(''); load(); onChanged();
        } catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save")); }
        finally { setSaving(false); }
    }
    async function remove(a: Adjustment) {
        if (!session || !org || !confirm(tx("Remove this {0} of {1}?", a.kind === 'opening' ? tx("opening balance") : 'adjustment', money(Math.abs(a.amount))))) return;
        try { await team.deleteAdjustment(session.userId, org.organization_id, a.id); load(); onChanged(); }
        catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not remove")); }
    }

    const bal = owed?.owed ?? 0;
    return (
        <Dialog title={tx("Balance · {0}", name)} wide onClose={onClose}
            subtitle={tx("Everything earned, minus everything paid, plus adjustments. Adjustments never change pay or taxes; they only change what is owed.")}
            footer={adding
                ? <SaveFooter onCancel={() => setAdding(false)} onSave={save} saving={saving} label={tx("Add")} disabled={!(Number(amount) > 0)} />
                : <><button className="btn" onClick={onClose}>{tx("Close")}</button><button className="btn btn-primary" onClick={() => setAdding(true)}>{tx("Add an adjustment")}</button></>}>
            {error && <p className="error-line">{error}</p>}
            {owed && (
                <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent', marginBottom: 12 }}>
                    <div className="stat-label">{Math.abs(bal) < 0.005 ? tx("Settled") : bal > 0 ? tx("You owe them") : tx("They owe you")}</div>
                    <div className="stat">{money(Math.abs(bal))}</div>
                    <div className="muted small">{tx('Earned {0} · paid {1}', money(owed.net), money(owed.paid))}{Math.abs(owed.adjustments) > 0.005 ? ' · ' + tx('adjustments {0}', (owed.adjustments > 0 ? '+' : '−') + money(Math.abs(owed.adjustments))) : ''}</div>
                </div>
            )}
            {adding ? (
                <>
                    <div className="grid-2">
                        <label className="field"><span>{tx("Direction")}</span>
                            <select value={dir} onChange={e => setDir(e.target.value as 'owe' | 'owed')}><option value="owe">{tx("You owe them (adds to the balance)")}</option><option value="owed">{tx("They owe you (advance, deduction)")}</option></select></label>
                        <label className="field"><span>{tx("Amount ($)")}</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus /></label>
                        <label className="field"><span>{tx("Date")}</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                        <label className="field"><span>{tx("Kind")}</span>
                            <select value={kind} onChange={e => setKind(e.target.value as 'opening' | 'adjustment')}><option value="opening">{tx("Opening balance (carried forward from before the app)")}</option><option value="adjustment">{tx("Adjustment (advance, deduction, correction)")}</option></select></label>
                    </div>
                    <label className="field"><span>{tx("Note")}</span><input value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'opening' ? tx("Balance carried forward from previous records") : tx("Cash advance on Nov 3")} /></label>
                </>
            ) : (
                <>
                    <div className="eyebrow nopad">{tx("Adjustments")}</div>
                    {!list ? <SkeletonLines n={4} /> : list.length === 0 ? <p className="muted">{tx("None. If this person was already on the payroll before the app, add an opening balance so what is owed starts right.")}</p> : (
                        <table className="table">
                            <thead><tr><th>{tx("Date")}</th><th>{tx("Kind")}</th><th>{tx("Note")}</th><th>{tx("Amount")}</th><th></th></tr></thead>
                            <tbody>
                                {list.map(a => (
                                    <tr key={a.id}>
                                        <td>{dateOnly(a.adjusted_on)}</td>
                                        <td>{a.kind === 'opening' ? tx("Opening balance") : tx("Adjustment")}</td>
                                        <td className="muted">{a.note ?? ''}</td>
                                        <td className={a.amount < 0 ? 'danger' : ''}>{a.amount > 0 ? '+' : '−'}{money(Math.abs(a.amount))}</td>
                                        <td className="actions"><button className="btn btn-sm" onClick={() => remove(a)}>{tx("Remove")}</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </Dialog>
    );
}
