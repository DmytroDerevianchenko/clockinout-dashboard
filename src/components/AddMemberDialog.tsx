// Add a team member: the same /create-user the phone's Add dialog calls,
// then an optional invite so they can sign in. Address is plain text here
// (the phone uses Places); the province matters only for the record — taxes
// follow the organization's province.
import { useState } from 'react';
import { ApiError } from '../api/client';
import { team } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';

const TYPES = [['full_time', 'Full-time'], ['part_time', 'Part-time'], ['casual', 'Casual'], ['contractor', 'Contractor'], ['salary', 'Salaried']];

export default function AddMemberDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const today = new Date().toISOString().slice(0, 10);
    const [f, setF] = useState({ email: '', fullName: '', role: 'employee' as 'employee' | 'accountant', employmentType: 'full_time', currentRate: '', startDate: today, phoneNumber: '', street: '', city: '', state: '', postalCode: '', country: 'CA' });
    const [invite, setInvite] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));

    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        try {
            const check = await team.checkEmail(session.userId, org.organization_id, f.email.trim());
            if (check.isMember) { setError('This person is already on the team.'); setSaving(false); return; }
            await team.createUser({
                userId: session.userId, organizationId: org.organization_id, email: f.email.trim(), fullName: f.fullName.trim(),
                role: f.role, startDate: f.startDate, phoneNumber: f.phoneNumber || null, employmentType: f.employmentType,
                currentRate: f.currentRate ? Number(f.currentRate) : null,
                street: f.street || null, city: f.city || null, state: f.state || null, postalCode: f.postalCode || null, country: f.country || null,
            });
            if (invite) {
                const r = await team.sendInvite(session.email, f.email.trim(), org.organization_id);
                setNote(r.message ?? 'Invite sent.');
            }
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not add the member'); setSaving(false); }
    }

    return (
        <Dialog title="Add a team member" subtitle="They appear on the roster right away; the invite lets them sign in to the app." onClose={onClose} wide
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} label="Add" disabled={!f.email || !f.fullName} />}>
            <div className="grid-2">
                <label className="field"><span>Full name</span><input value={f.fullName} onChange={set('fullName')} /></label>
                <label className="field"><span>Email</span><input type="email" value={f.email} onChange={set('email')} /></label>
                <label className="field"><span>Role</span>
                    <select value={f.role} onChange={set('role')}><option value="employee">Employee</option><option value="accountant">Accountant</option></select>
                </label>
                <label className="field"><span>Employment type</span>
                    <select value={f.employmentType} onChange={set('employmentType')}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </label>
                <label className="field"><span>Hourly rate ($)</span><input inputMode="decimal" value={f.currentRate} onChange={set('currentRate')} /></label>
                <label className="field"><span>Start date</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
                <label className="field"><span>Phone</span><input value={f.phoneNumber} onChange={set('phoneNumber')} placeholder="+1…" /></label>
                <label className="field"><span>Street</span><input value={f.street} onChange={set('street')} /></label>
                <label className="field"><span>City</span><input value={f.city} onChange={set('city')} /></label>
                <label className="field"><span>Province</span><input value={f.state} onChange={set('state')} /></label>
                <label className="field"><span>Postal code</span><input value={f.postalCode} onChange={set('postalCode')} /></label>
                <label className="field"><span>Country</span><input value={f.country} onChange={set('country')} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={invite} onChange={e => setInvite(e.target.checked)} /> Send an invite email now</label>
            {error && <p className="error-line">{error}</p>}
            {note && <p className="muted">{note}</p>}
        </Dialog>
    );
}
