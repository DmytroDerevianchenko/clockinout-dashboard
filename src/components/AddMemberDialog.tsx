// Add a team member: the same /create-user the phone's Add dialog calls,
// then an optional invite so they can sign in. Address is plain text here
// (the phone uses Places); the province matters only for the record — taxes
// follow the organization's province.
import { useState } from 'react';
import { ApiError } from '../api/client';
import { team } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';
import { tx } from '../i18n';

const TYPES = [['full_time', tx("Full-time")], ['part_time', tx("Part-time")], ['casual', tx("Casual")], ['contractor', tx("Contractor")], ['salary', tx("Salaried")]];

export default function AddMemberDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const today = new Date().toISOString().slice(0, 10);
    const [f, setF] = useState({ email: '', fullName: '', role: 'employee' as 'employee' | 'accountant', employmentType: 'full_time', currentRate: '', startDate: today, phoneNumber: '', street: '', city: '', state: '', postalCode: '', country: 'CA' });
    const [invite, setInvite] = useState(true);
    const [balDir, setBalDir] = useState<'owe' | 'owed'>('owe');
    const [balAmount, setBalAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));

    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        try {
            const check = await team.checkEmail(session.userId, org.organization_id, f.email.trim());
            if (check.isMember) { setError(tx("This person is already on the team.")); setSaving(false); return; }
            await team.createUser({
                userId: session.userId, organizationId: org.organization_id, email: f.email.trim(), fullName: f.fullName.trim(),
                role: f.role, startDate: f.startDate, phoneNumber: f.phoneNumber || null, employmentType: f.employmentType,
                currentRate: f.currentRate ? Number(f.currentRate) : null,
                street: f.street || null, city: f.city || null, state: f.state || null, postalCode: f.postalCode || null, country: f.country || null,
            });
            if (Number(balAmount) > 0) {
                // The new row's id comes from the roster; the opening balance is dated yesterday
                // (the last day before the app took over).
                const roster = await team.roster(session.userId, org.organization_id);
                const created = roster.users.find(u => u.email.toLowerCase() === f.email.trim().toLowerCase());
                if (created) {
                    const y = new Date(); y.setDate(y.getDate() - 1);
                    await team.addAdjustment(session.userId, org.organization_id, {
                        targetUserId: created.id, amount: (Number(balAmount) || 0) * (balDir === 'owe' ? 1 : -1),
                        adjustedOn: y.toISOString().slice(0, 10), kind: 'opening', note: 'Balance carried forward from previous records',
                    });
                }
            }
            if (invite) {
                const r = await team.sendInvite(session.email, f.email.trim(), org.organization_id);
                setNote(r.message ?? tx('Invite sent.'));
            }
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not add the member")); setSaving(false); }
    }

    return (
        <Dialog title={tx("Add a team member")} subtitle={tx("They appear on the roster right away; the invite lets them sign in to the app.")} onClose={onClose} wide
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} label={tx("Add")} disabled={!f.email || !f.fullName} />}>
            <div className="grid-2">
                <label className="field"><span>{tx("Full name")}</span><input value={f.fullName} onChange={set('fullName')} /></label>
                <label className="field"><span>{tx("Email")}</span><input type="email" value={f.email} onChange={set('email')} /></label>
                <label className="field"><span>{tx("Role")}</span>
                    <select value={f.role} onChange={set('role')}><option value="employee">{tx("Employee")}</option><option value="accountant">{tx("Accountant")}</option></select>
                </label>
                <label className="field"><span>{tx("Employment type")}</span>
                    <select value={f.employmentType} onChange={set('employmentType')}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </label>
                <label className="field"><span>{tx("Hourly rate ($)")}</span><input inputMode="decimal" value={f.currentRate} onChange={set('currentRate')} /></label>
                <label className="field"><span>{tx("Start date")}</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
                <label className="field"><span>{tx("Phone")}</span><input value={f.phoneNumber} onChange={set('phoneNumber')} placeholder="+1…" /></label>
                <label className="field"><span>{tx("Street")}</span><input value={f.street} onChange={set('street')} /></label>
                <label className="field"><span>{tx("City")}</span><input value={f.city} onChange={set('city')} /></label>
                <label className="field"><span>{tx("Province")}</span><input value={f.state} onChange={set('state')} /></label>
                <label className="field"><span>{tx("Postal code")}</span><input value={f.postalCode} onChange={set('postalCode')} /></label>
                <label className="field"><span>{tx("Country")}</span><input value={f.country} onChange={set('country')} /></label>
            </div>
            <div className="eyebrow nopad">{tx("Starting balance (optional)")}</div>
            <p className="muted small">{tx("If this person was already on your payroll, enter what stands between you today so the app's balance starts right.")}</p>
            <div className="grid-2">
                <label className="field"><span>{tx("Who owes whom")}</span>
                    <select value={balDir} onChange={e => setBalDir(e.target.value as 'owe' | 'owed')}><option value="owe">{tx("I still owe them")}</option><option value="owed">{tx("They owe me")}</option></select></label>
                <label className="field"><span>{tx("Amount ($)")}</span><input inputMode="decimal" value={balAmount} onChange={e => setBalAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></label>
            </div>
            <label className="check"><input type="checkbox" checked={invite} onChange={e => setInvite(e.target.checked)} /> {tx("Send an invite email now")}</label>
            {error && <p className="error-line">{error}</p>}
            {note && <p className="muted">{note}</p>}
        </Dialog>
    );
}
