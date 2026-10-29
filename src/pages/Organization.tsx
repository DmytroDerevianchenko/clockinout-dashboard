// Organization: the company details and the feature switches — the phone's
// Org Details and Settings screens. Invoices and Clients have their own tabs.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, type OrgRow, type OrgSettings } from '../api/org';
import { n } from '../api/payroll';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';

export default function Organization() {
    const { session, org } = useAuth();
    const [row, setRow] = useState<OrgRow | null>(null);
    const [settings, setSettings] = useState<OrgSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editDetails, setEditDetails] = useState(false);

    const load = useCallback(() => {
        if (!session || !org) return;
        Promise.all([orgApi.list(session.userId), orgApi.settings(session.userId, org.organization_id)])
            .then(([o, s]) => { setRow(o.organizations.find(x => x.id === org.organization_id) ?? null); setSettings(s.settings); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load'));
    }, [session, org]);
    useEffect(() => { setRow(null); load(); }, [load]);

    async function toggle(patch: Partial<OrgSettings>) {
        if (!org || !settings) return;
        const next = { ...settings, ...patch };
        setSettings(next);
        try { await orgApi.saveSettings(org.organization_id, next); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save settings'); load(); }
    }

    if (error && !row) return <div className="card danger">{error}</div>;
    if (!row || !settings) return <div className="card muted">Loading…</div>;
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
            </div>
            {editDetails && <DetailsDialog row={row} onClose={() => setEditDetails(false)} onDone={() => { setEditDetails(false); load(); }} />}
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
