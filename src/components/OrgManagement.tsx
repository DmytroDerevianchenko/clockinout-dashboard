// Organization management — the things the phone's Organizations list does:
// the logo, the list of organizations you belong to (open, make default,
// delete), and creating a new one.
//
// "Delete" is a deactivation on the server: the organization and all of its
// data stay intact, it only leaves every list. That is still drastic for the
// crew, so it asks for the name to be typed.
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, type OrgRow } from '../api/org';
import { PROVINCES } from '../api/team';
import { useAuth, type Membership } from '../auth';
import Dialog, { SaveFooter } from './Dialog';
import { useToast } from './Toast';

/** Any image → a PNG no larger than 512 px on its long side, as bare base64 (what the phones send). */
async function toLogoBase64(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That file is not an image')); i.src = url; });
        const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);   // transparency is kept
        return canvas.toDataURL('image/png').split(',')[1];
    } finally { URL.revokeObjectURL(url); }
}

/** The logo row of the Details card: preview, upload / replace, remove, and whether it prints. */
export function OrgLogo({ row, onChanged }: { row: OrgRow; onChanged: () => void }) {
    const { session } = useAuth();
    const toast = useToast();
    const input = useRef<HTMLInputElement>(null);
    const [src, setSrc] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!row.has_logo) { setSrc(null); return; }
        let url: string | null = null, stale = false;
        orgApi.logoBlob(row.id).then(b => { if (stale) return; url = URL.createObjectURL(b); setSrc(url); }).catch(() => { if (!stale) setSrc(null); });
        return () => { stale = true; if (url) URL.revokeObjectURL(url); };
    }, [row.id, row.has_logo]);

    async function run(fn: () => Promise<unknown>, message: string) {
        setBusy(true);
        try { await fn(); toast(message); onChanged(); }
        catch (e) { toast(e instanceof ApiError || e instanceof Error ? e.message : 'Could not do that', 'error'); }
        finally { setBusy(false); }
    }

    return (
        <div className="kv">
            <span>Logo</span>
            <div className="logo-row">
                {src ? <img className="org-logo" src={src} alt={`${row.name} logo`} /> : <span className="faint">{row.has_logo ? 'Loading…' : 'None'}</span>}
                <input ref={input} type="file" accept="image/*" hidden onChange={e => {
                    const file = e.target.files?.[0]; e.target.value = '';
                    if (file) run(async () => orgApi.uploadLogo(row.id, await toLogoBase64(file)), 'Logo updated');
                }} />
                <button className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>{row.has_logo ? 'Replace' : 'Upload'}</button>
                {row.has_logo && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => orgApi.removeLogo(row.id), 'Logo removed')}>Remove</button>}
                {row.has_logo && session && (
                    <label className="check" style={{ margin: 0 }}>
                        <input type="checkbox" checked={row.logo_show} disabled={busy} onChange={e => run(() => orgApi.saveDetails(session.userId, { ...row, logo_show: e.target.checked }), e.target.checked ? 'The logo prints on invoices and paystubs' : 'The logo no longer prints')} />
                        Print on invoices and paystubs
                    </label>
                )}
            </div>
        </div>
    );
}

/** The card listing every organization you belong to. */
export function OrgList() {
    const { session, org, setOrgId, refresh } = useAuth();
    const toast = useToast();
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<Membership | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    if (!session) return null;

    async function makeDefault(m: Membership) {
        if (!session) return;
        setBusy(m.organization_id);
        try { await orgApi.setDefault(session.userId, m.organization_id); await refresh(); toast(`${m.name} opens first from now on`); }
        catch (e) { toast(e instanceof ApiError ? e.message : 'Could not do that', 'error'); }
        finally { setBusy(null); }
    }

    return (
        <section className="card card-flush">
            <div className="person-head" style={{ padding: '16px 20px 0', marginBottom: 6 }}>
                <h2 style={{ margin: 0 }}>Your organizations</h2>
                <button className="btn" onClick={() => setCreating(true)}>New organization</button>
            </div>
            <table className="table">
                <tbody>
                    {session.organizations.map(m => {
                        const current = m.organization_id === org?.organization_id;
                        const isDefault = m.organization_id === session.defaultOrganizationId;
                        const admin = m.role === 'employer' || m.is_admin;
                        return (
                            <tr key={m.organization_id}>
                                <td><strong>{m.name}</strong>{current && <span className="pill live">Open now</span>}{isDefault && <span className="pill">Default</span>}
                                    <div className="faint small">{m.role === 'employer' ? 'Owner' : m.is_admin ? 'Admin' : m.role === 'accountant' ? 'Accountant' : 'Employee'}</div></td>
                                <td className="actions">
                                    {!current && <button className="btn btn-sm" onClick={() => setOrgId(m.organization_id)}>Open</button>}
                                    {!isDefault && <button className="btn btn-sm" disabled={busy === m.organization_id} onClick={() => makeDefault(m)}>Make default</button>}
                                    {admin && <button className="btn btn-sm btn-danger" onClick={() => setDeleting(m)}>Delete</button>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {creating && <CreateOrgDialog onClose={() => setCreating(false)} />}
            {deleting && <DeleteOrgDialog m={deleting} onClose={() => setDeleting(null)} />}
        </section>
    );
}

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
    const { session, setOrgId, refresh } = useAuth();
    const toast = useToast();
    const [f, setF] = useState({ name: '', province: 'Ontario', city: '', street: '', postal: '', period: 'bi_weekly', startDay: 'Monday', type: 'full_time' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));

    async function save() {
        if (!session || !f.name.trim()) return;
        setSaving(true); setError(null);
        try {
            const r = await orgApi.create(session.userId, {
                name: f.name.trim(), countryCode: 'CA', stateProvince: f.province, city: f.city.trim() || null, street: f.street.trim() || null, postalCode: f.postal.trim() || null,
                payPeriodType: f.period, payPeriodStartDay: f.startDay, defaultEmploymentType: f.type, currencyCode: 'CAD', defaultBreakDuration: 30,
            });
            await refresh();                                   // the new membership arrives with the session
            if (r.organizationId) setOrgId(r.organizationId);  // and the dashboard opens it
            toast(`${f.name.trim()} was created`);
            onClose();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not create the organization'); setSaving(false); }
    }

    return (
        <Dialog title="New organization" wide onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} label="Create" disabled={!f.name.trim()} />}
            subtitle="You become its owner. The province decides taxes, overtime and holiday pay; pay periods are generated from the type and start day.">
            <label className="field"><span>Name</span><input value={f.name} onChange={set('name')} autoFocus /></label>
            <div className="grid-2">
                <label className="field"><span>Province</span><select value={f.province} onChange={set('province')}>{PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label className="field"><span>City</span><input value={f.city} onChange={set('city')} /></label>
                <label className="field"><span>Street</span><input value={f.street} onChange={set('street')} /></label>
                <label className="field"><span>Postal code</span><input value={f.postal} onChange={set('postal')} /></label>
                <label className="field"><span>Pay period</span>
                    <select value={f.period} onChange={set('period')}><option value="weekly">Weekly</option><option value="bi_weekly">Every two weeks</option><option value="semi_monthly">Twice a month</option><option value="monthly">Monthly</option></select></label>
                <label className="field"><span>Week starts on</span>
                    <select value={f.startDay} onChange={set('startDay')}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}</select></label>
                <label className="field"><span>Default employment type</span>
                    <select value={f.type} onChange={set('type')}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="casual">Casual</option><option value="contractor">Contractor</option></select></label>
            </div>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}

function DeleteOrgDialog({ m, onClose }: { m: Membership; onClose: () => void }) {
    const { session, refresh } = useAuth();
    const toast = useToast();
    const [typed, setTyped] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const match = typed.trim().toLowerCase() === m.name.trim().toLowerCase();

    async function go() {
        if (!session || !match) return;
        setSaving(true); setError(null);
        try { await orgApi.remove(session.userId, m.organization_id); await refresh(); toast(`${m.name} was deleted`); onClose(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not delete the organization'); setSaving(false); }
    }

    return (
        <Dialog title={`Delete ${m.name}?`} onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={go} saving={saving} label="Delete organization" disabled={!match} />}>
            <p className="muted">The organization disappears for you and for everyone in it: nobody can clock in, and its jobs, hours, payroll and invoices leave every screen. The records themselves are kept on the server.</p>
            <label className="field"><span>Type the organization's name to confirm</span><input value={typed} onChange={e => setTyped(e.target.value)} placeholder={m.name} autoFocus /></label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
