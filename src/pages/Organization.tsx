// Organization: the company details, the feature switches, and the invoices
// list with PDF, send and status — the phone's Org Details, Settings and
// Invoices screens, read-first with the edits an employer does from a desk.
// Creating and editing invoice drafts stays on the phone for now.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, type OrgRow, type OrgSettings, type InvoiceRow } from '../api/org';
import { money, n } from '../api/payroll';
import { dateOnly } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import InvoiceEditor from './InvoiceEditor';
import { invoicesApi } from '../api/invoices';

export default function Organization() {
    const { session, org } = useAuth();
    const [row, setRow] = useState<OrgRow | null>(null);
    const [settings, setSettings] = useState<OrgSettings | null>(null);
    const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editDetails, setEditDetails] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmSend, setConfirmSend] = useState<InvoiceRow | null>(null);
    const [editor, setEditor] = useState<{ invoiceId?: number; copyOf?: number } | null>(null);

    const load = useCallback(() => {
        if (!session || !org) return;
        Promise.all([orgApi.list(session.userId), orgApi.settings(session.userId, org.organization_id), orgApi.invoices(session.userId, org.organization_id)])
            .then(([o, s, i]) => { setRow(o.organizations.find(x => x.id === org.organization_id) ?? null); setSettings(s.settings); setInvoices(i.invoices); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load'));
    }, [session, org]);
    useEffect(() => { setRow(null); setInvoices(null); load(); }, [load]);

    async function toggle(patch: Partial<OrgSettings>) {
        if (!org || !settings) return;
        const next = { ...settings, ...patch };
        setSettings(next);
        try { await orgApi.saveSettings(org.organization_id, next); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save settings'); load(); }
    }
    async function invoiceAction(inv: InvoiceRow, kind: 'pdf' | 'send' | 'paid' | 'unpaid' | 'delete') {
        if (!session || !org) return;
        setBusy(`${kind}-${inv.id}`); setError(null);
        try {
            if (kind === 'pdf') { const r = await orgApi.invoicePdf(session.userId, org.organization_id, inv.id); const u = r.pdf_url ?? r.pdfUrl; if (u) window.open(u, '_blank', 'noopener'); }
            else if (kind === 'send') { await orgApi.sendInvoice(session.userId, org.organization_id, inv.id); setConfirmSend(null); load(); }
            else if (kind === 'paid') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'paid', 'e-transfer', new Date().toISOString().slice(0, 10)); load(); }
            else if (kind === 'unpaid') { await orgApi.setInvoiceStatus(session.userId, org.organization_id, inv.id, 'sent'); load(); }
            else { await invoicesApi.remove(session.userId, org.organization_id, inv.id); load(); }
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not do that'); }
        finally { setBusy(null); }
    }

    if (error && !row) return <div className="card danger">{error}</div>;
    if (!row || !settings || !invoices) return <div className="card muted">Loading…</div>;
    const addr = [row.street, row.unit_number, row.city, row.state_province, row.postal_code, row.country_code].filter(Boolean).join(', ');
    const tax = row.tax_config_json as { rate?: number; registration_number?: string } | null;
    const Sw = ({ k, label, sub }: { k: keyof OrgSettings; label: string; sub?: string }) => (
        <label className="check"><input type="checkbox" checked={settings[k] as boolean} onChange={e => toggle({ [k]: e.target.checked } as Partial<OrgSettings>)} /> {label}{sub && <span className="muted small"> — {sub}</span>}</label>
    );

    return (
        <>
            {error && <p className="error-line">{error}</p>}
            <div className="groups">
                <section className="card">
                    <div className="person-head"><h2>Details</h2><button className="btn" onClick={() => setEditDetails(true)}>Edit</button></div>
                    <div className="kv"><span>Name</span><strong>{row.name}</strong></div>
                    <div className="kv"><span>Address</span><span>{addr || <span className="caution">Not set — taxes, overtime and holiday pay follow the province</span>}</span></div>
                    <div className="kv"><span>Pay period</span><span>{row.pay_period_type.replace('_', '-')}, starts {row.pay_period_start_day ?? 'Monday'}</span></div>
                    <div className="kv"><span>Default employment type</span><span>{row.default_employment_type?.replace('_', '-') ?? '—'}</span></div>
                    <div className="kv"><span>Default break</span><span>{row.default_break_duration ?? 0} min</span></div>
                    <div className="kv"><span>Sales tax</span><span>{tax?.rate != null ? `${(n(tax.rate) * 100).toFixed(0)}%` : '—'}{tax?.registration_number ? ` · ${tax.registration_number}` : ''}</span></div>
                    <div className="kv"><span>Invoice prefix</span><span>{row.invoice_prefix || '—'}</span></div>
                    <div className="kv"><span>Currency</span><span>{row.currency_code ?? 'CAD'}</span></div>
                </section>

                <section className="card">
                    <h2>Features</h2>
                    <p className="muted small">These take effect on the phones right away.</p>
                    <div className="grid-2">
                        <div>
                            <Sw k="feature_auto_clock_out" label="Auto clock-out" sub={`at ${settings.auto_clock_out_time}`} />
                            {settings.feature_auto_clock_out && <label className="field"><span>Auto clock-out time</span><input type="time" value={settings.auto_clock_out_time} onChange={e => toggle({ auto_clock_out_time: e.target.value })} /></label>}
                            <label className="field"><span>Breaks</span>
                                <select value={settings.break_policy} onChange={e => toggle({ break_policy: e.target.value as OrgSettings['break_policy'] })}>
                                    <option value="none">No breaks deducted</option><option value="auto">Automatic unpaid break</option><option value="tracked">Workers start and end breaks</option>
                                </select></label>
                            {settings.break_policy === 'auto' && <div className="grid-2">
                                <label className="field"><span>Break (minutes)</span><input inputMode="numeric" value={settings.auto_break_minutes} onChange={e => toggle({ auto_break_minutes: parseInt(e.target.value) || 0 })} /></label>
                                <label className="field"><span>After shifts over (hours)</span><input inputMode="decimal" value={settings.auto_break_threshold_hours} onChange={e => toggle({ auto_break_threshold_hours: Number(e.target.value) || 0 })} /></label>
                            </div>}
                            <Sw k="feature_multi_job_tracking" label="Multiple jobs at once" sub="a worker may be clocked in on more than one job" />
                            <Sw k="feature_overtime_alerts" label="Overtime alerts" sub="week-hours bar on Team and the clock screen" />
                            <Sw k="feature_scheduling" label="Scheduling" />
                        </div>
                        <div>
                            <Sw k="feature_geofencing" label="Geofencing" sub="clock-ins must be within the job's radius" />
                            {settings.feature_geofencing && <label className="field"><span>Default radius (metres)</span><input inputMode="numeric" value={settings.geofence_radius} onChange={e => toggle({ geofence_radius: parseInt(e.target.value) || 100 })} /></label>}
                            <Sw k="feature_location_tracking" label="Location tracking" sub="GPS pings while clocked in, for the route map" />
                            {settings.feature_location_tracking && <label className="field"><span>Ping every (minutes)</span><input inputMode="numeric" value={settings.location_track_interval_minutes} onChange={e => toggle({ location_track_interval_minutes: parseInt(e.target.value) || 15 })} /></label>}
                            <Sw k="feature_reminders" label="Clock-in reminders" />
                            <Sw k="notify_payment_received" label="Notify workers when a payment is recorded" />
                        </div>
                    </div>
                </section>

                <section className="card card-flush">
                    <div className="person-head" style={{ padding: '16px 18px 0' }}><h2>Invoices</h2><button className="btn btn-primary" onClick={() => setEditor({})}>New invoice</button></div>
                    {invoices.length === 0 ? <div className="empty">No invoices yet.</div> : (
                        <table className="table table-hover">
                            <thead><tr><th>Number</th><th>Client</th><th>Job</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th><th></th></tr></thead>
                            <tbody>
                                {invoices.filter(i => !i.is_deleted).map(i => (
                                    <tr key={i.id}>
                                        <td>{i.status === 'draft' ? <button className="row-link linkish" onClick={() => setEditor({ invoiceId: i.id })}><strong>{i.invoice_number}</strong></button> : <strong>{i.invoice_number}</strong>}</td>
                                        <td>{i.client_name ?? '—'}</td>
                                        <td>{i.job_name ?? <span className="faint">—</span>}</td>
                                        <td>{i.status === 'draft' ? <span className="faint">on send</span> : dateOnly(i.issue_date)}</td>
                                        <td className={i.is_overdue ? 'danger' : ''}>{i.status === 'draft' ? <span className="faint">on send</span> : dateOnly(i.due_date)}</td>
                                        <td>{money(i.total)}</td>
                                        <td><span className={'pill' + (i.status === 'paid' ? '' : i.is_overdue ? ' danger' : i.status === 'draft' ? ' caution' : '')}>{i.is_overdue && i.status === 'sent' ? 'Overdue' : i.status}</span></td>
                                        <td className="actions">
                                            <button className="btn btn-sm" disabled={busy === `pdf-${i.id}`} onClick={() => invoiceAction(i, 'pdf')}>PDF</button>
                                            {(i.status === 'draft' || i.status === 'sent') && <button className="btn btn-sm" onClick={() => setConfirmSend(i)}>{i.status === 'draft' ? 'Send' : 'Resend'}</button>}
                                            {i.status === 'sent' && <button className="btn btn-sm" disabled={busy === `paid-${i.id}`} onClick={() => invoiceAction(i, 'paid')}>Mark paid</button>}
                                            {i.status === 'paid' && <button className="btn btn-sm" disabled={busy === `unpaid-${i.id}`} onClick={() => invoiceAction(i, 'unpaid')}>Mark unpaid</button>}
                                            <button className="btn btn-sm" onClick={() => setEditor({ copyOf: i.id })}>Copy</button>
                                            {i.status === 'draft' && <button className="btn btn-sm" disabled={busy === `delete-${i.id}`} onClick={() => { if (confirm(`Delete draft ${i.invoice_number}?`)) invoiceAction(i, 'delete'); }}>Delete</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>
            </div>

            {editor && <InvoiceEditor invoiceId={editor.invoiceId} copyOf={editor.copyOf} onClose={() => setEditor(null)} onDone={() => { setEditor(null); load(); }} />}
            {editDetails && <DetailsDialog row={row} onClose={() => setEditDetails(false)} onDone={() => { setEditDetails(false); load(); }} />}
            {confirmSend && (
                <Dialog title={`Send ${confirmSend.invoice_number}?`} subtitle={`${money(confirmSend.total)} to ${confirmSend.client_name ?? 'the client'}. ${confirmSend.status === 'draft' ? 'The issue and due dates become today and the client’s terms.' : 'The client receives the PDF again.'}`} onClose={() => setConfirmSend(null)}
                    footer={<SaveFooter onCancel={() => setConfirmSend(null)} label="Send" saving={busy === `send-${confirmSend.id}`} onSave={() => invoiceAction(confirmSend, 'send')} />}>
                    <p className="muted">The email goes from invoices@clockinout.ca with your email as the reply address.</p>
                </Dialog>
            )}
        </>
    );
}

function DetailsDialog({ row, onClose, onDone }: { row: OrgRow; onClose: () => void; onDone: () => void }) {
    const { session } = useAuth();
    const tax = (row.tax_config_json ?? {}) as { rate?: number; registration_number?: string };
    const [f, setF] = useState({
        name: row.name, street: row.street ?? '', unit: row.unit_number ?? '', city: row.city ?? '', province: row.state_province ?? '', postal: row.postal_code ?? '', country: row.country_code ?? 'CA',
        brk: String(row.default_break_duration ?? 30), type: row.default_employment_type ?? 'full_time', prefix: row.invoice_prefix ?? '',
        taxRate: tax.rate != null ? String(n(tax.rate) * 100) : '13', taxReg: tax.registration_number ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));
    async function save() {
        if (!session) return;
        setSaving(true); setError(null);
        try {
            await orgApi.saveDetails(session.userId, {
                ...row, name: f.name.trim(), street: f.street || null, unit_number: f.unit || null, city: f.city || null, state_province: f.province || null,
                postal_code: f.postal || null, country_code: f.country || null, default_break_duration: parseInt(f.brk) || 0, default_employment_type: f.type,
                invoice_prefix: f.prefix.trim() || null, tax_config_json: { ...(row.tax_config_json ?? {}), rate: (Number(f.taxRate) || 0) / 100, registration_number: f.taxReg.trim() || null },
            });
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }
    return (
        <Dialog title="Organization details" wide onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!f.name.trim()} />}
            subtitle="The province decides taxes, overtime and holiday pay for everyone; pay period type and start day are changed on the phone.">
            <label className="field"><span>Name</span><input value={f.name} onChange={set('name')} /></label>
            <div className="grid-2">
                <label className="field"><span>Street</span><input value={f.street} onChange={set('street')} /></label>
                <label className="field"><span>Unit</span><input value={f.unit} onChange={set('unit')} /></label>
                <label className="field"><span>City</span><input value={f.city} onChange={set('city')} /></label>
                <label className="field"><span>Province</span><input value={f.province} onChange={set('province')} placeholder="Ontario" /></label>
                <label className="field"><span>Postal code</span><input value={f.postal} onChange={set('postal')} /></label>
                <label className="field"><span>Country</span><input value={f.country} onChange={set('country')} placeholder="CA" /></label>
                <label className="field"><span>Default break (minutes)</span><input inputMode="numeric" value={f.brk} onChange={e => setF(v => ({ ...v, brk: e.target.value.replace(/\D/g, '') }))} /></label>
                <label className="field"><span>Default employment type</span>
                    <select value={f.type} onChange={set('type')}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="casual">Casual</option><option value="contractor">Contractor</option><option value="salary">Salaried</option></select></label>
                <label className="field"><span>Sales tax rate (%)</span><input inputMode="decimal" value={f.taxRate} onChange={e => setF(v => ({ ...v, taxRate: e.target.value.replace(/[^0-9.]/g, '') }))} /></label>
                <label className="field"><span>GST/HST registration number</span><input value={f.taxReg} onChange={set('taxReg')} placeholder="123456789RT0001" /></label>
                <label className="field"><span>Invoice prefix</span><input value={f.prefix} onChange={set('prefix')} placeholder="VF" /></label>
            </div>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
