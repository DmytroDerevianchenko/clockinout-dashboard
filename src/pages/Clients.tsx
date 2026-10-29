// Clients: who the invoices go to. List, add, edit; the client's tax rate
// and payment terms are what a new invoice starts from.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { clientsApi, type Client, type ClientInput } from '../api/invoices';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';

export default function Clients() {
    const { session, org } = useAuth();
    const [clients, setClients] = useState<Client[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Client | 'new' | null>(null);
    const load = useCallback(() => {
        if (!session || !org) return;
        clientsApi.list(session.userId, org.organization_id).then(r => { setClients(r.clients.filter(c => !c.is_deleted)); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load clients'));
    }, [session, org]);
    useEffect(() => { setClients(null); load(); }, [load]);

    if (error) return <div className="card danger">{error}</div>;
    if (!clients) return <div className="card muted">Loading…</div>;
    return (
        <>
            <div className="toolbar"><span className="spacer" /><button className="btn btn-primary" onClick={() => setEditing('new')}>New client</button></div>
            <div className="card card-flush">
                <table className="table table-hover">
                    <thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Terms</th><th>Tax</th><th>Invoices</th></tr></thead>
                    <tbody>
                        {clients.map(c => (
                            <tr key={c.id}>
                                <td><button className="row-link linkish" onClick={() => setEditing(c)}><strong>{c.company_name}</strong></button>
                                    <div className="faint small">{[c.city, c.state_province].filter(Boolean).join(', ')}</div></td>
                                <td>{c.contact_name ?? <span className="faint">—</span>}{c.phone && <div className="faint small">{c.phone}</div>}</td>
                                <td>{c.email ?? <span className="caution">no email</span>}{c.cc_emails?.length ? <div className="faint small">cc {c.cc_emails.join(', ')}</div> : null}</td>
                                <td>{c.payment_terms_days ?? 30} days</td>
                                <td>{c.default_tax_rate != null ? `${(Number(c.default_tax_rate) * 100).toFixed(0)}%` : '—'}</td>
                                <td>{c.invoice_count ?? ''}</td>
                            </tr>
                        ))}
                        {clients.length === 0 && <tr><td colSpan={6} className="empty">No clients yet.</td></tr>}
                    </tbody>
                </table>
            </div>
            {editing && <ClientDialog client={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
        </>
    );
}

export function ClientDialog({ client, onClose, onDone }: { client: Client | null; onClose: () => void; onDone: (created?: Client) => void }) {
    const { session, org } = useAuth();
    const [f, setF] = useState({
        companyName: client?.company_name ?? '', contactName: client?.contact_name ?? '', email: client?.email ?? '', cc: (client?.cc_emails ?? []).join(', '), phone: client?.phone ?? '',
        street: client?.street ?? '', unitNumber: client?.unit_number ?? '', city: client?.city ?? '', stateProvince: client?.state_province ?? '', postalCode: client?.postal_code ?? '', countryCode: client?.country_code ?? 'CA',
        taxRate: client?.default_tax_rate != null ? String(Number(client.default_tax_rate) * 100) : '13', terms: String(client?.payment_terms_days ?? 30), notes: client?.notes ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));
    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        const body: ClientInput = {
            companyName: f.companyName.trim(), contactName: f.contactName.trim() || null, email: f.email.trim() || null,
            ccEmails: f.cc.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean), phone: f.phone.trim() || null,
            street: f.street || null, unitNumber: f.unitNumber || null, city: f.city || null, stateProvince: f.stateProvince || null, postalCode: f.postalCode || null, countryCode: f.countryCode || null,
            defaultTaxRate: (Number(f.taxRate) || 0) / 100, paymentTermsDays: parseInt(f.terms) || 30, notes: f.notes.trim() || null,
        };
        try {
            if (client) { await clientsApi.update(session.userId, org.organization_id, client.id, body); onDone(); }
            else { const r = await clientsApi.create(session.userId, org.organization_id, body); onDone(r.client); }
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }
    return (
        <Dialog title={client ? client.company_name : 'New client'} wide onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!f.companyName.trim()} />}>
            <div className="grid-2">
                <label className="field"><span>Company</span><input value={f.companyName} onChange={set('companyName')} autoFocus /></label>
                <label className="field"><span>Contact name</span><input value={f.contactName} onChange={set('contactName')} /></label>
                <label className="field"><span>Email (invoices go here)</span><input type="email" value={f.email} onChange={set('email')} /></label>
                <label className="field"><span>Cc emails (comma-separated)</span><input value={f.cc} onChange={set('cc')} /></label>
                <label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} /></label>
                <label className="field"><span>Payment terms (days)</span><input inputMode="numeric" value={f.terms} onChange={e => setF(v => ({ ...v, terms: e.target.value.replace(/\D/g, '') }))} /></label>
                <label className="field"><span>Street</span><input value={f.street} onChange={set('street')} /></label>
                <label className="field"><span>Unit</span><input value={f.unitNumber} onChange={set('unitNumber')} /></label>
                <label className="field"><span>City</span><input value={f.city} onChange={set('city')} /></label>
                <label className="field"><span>Province</span><input value={f.stateProvince} onChange={set('stateProvince')} /></label>
                <label className="field"><span>Postal code</span><input value={f.postalCode} onChange={set('postalCode')} /></label>
                <label className="field"><span>Country</span><input value={f.countryCode} onChange={set('countryCode')} /></label>
                <label className="field"><span>Default tax rate (%)</span><input inputMode="decimal" value={f.taxRate} onChange={e => setF(v => ({ ...v, taxRate: e.target.value.replace(/[^0-9.]/g, '') }))} /></label>
            </div>
            <label className="field"><span>Notes</span><textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
