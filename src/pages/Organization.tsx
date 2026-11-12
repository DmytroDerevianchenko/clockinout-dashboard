// Organization: the company details and the feature switches — the phone's
// Org Details and Settings screens. Invoices and Clients have their own tabs.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, type OrgRow, type OrgSettings } from '../api/org';
import { n } from '../api/payroll';
import { useAuth } from '../auth';
import { SkeletonRecord } from '../components/Skeleton';
import Dialog, { SaveFooter } from '../components/Dialog';
import { OrgList, OrgLogo } from '../components/OrgManagement';
import AddressSearch from '../components/AddressSearch';
import PlanCard from '../components/PlanCard';
import { tx } from '../i18n';

// The server's pay period types, as the sentence the phones show for each.
const PERIOD_TYPES: Record<string, string> = { weekly: 'Weekly', bi_weekly: 'Every two weeks', biweekly: 'Every two weeks', semi_monthly: 'Twice a month', monthly: 'Monthly' };

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
            .catch(e => setError(e instanceof ApiError ? e.message : tx("Could not load")));
    }, [session, org]);
    useEffect(() => { setRow(null); load(); }, [load]);

    async function toggle(patch: Partial<OrgSettings>) {
        if (!org || !settings) return;
        const next = { ...settings, ...patch };
        setSettings(next);
        try { await orgApi.saveSettings(org.organization_id, next); }
        catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save settings")); load(); }
    }

    if (error && !row) return <div className="card danger">{error}</div>;
    if (!row || !settings) return <SkeletonRecord groups={2} rows={5} />;
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
                    <div className="person-head"><h2>{tx("Details")}</h2><button className="btn" onClick={() => setEditDetails(true)}>{tx("Edit")}</button></div>
                    <div className="kv"><span>{tx("Name")}</span><strong>{row.name}</strong></div>
                    <OrgLogo row={row} onChanged={load} />
                    <div className="kv"><span>{tx("Address")}</span><span>{addr || <span className="caution">{tx("Not set — taxes, overtime and holiday pay follow the province")}</span>}</span></div>
                    <div className="kv"><span>{tx("Pay period")}</span><span>{tx(PERIOD_TYPES[row.pay_period_type] ?? row.pay_period_type)}{tx(", starts")} {tx(row.pay_period_start_day ?? 'Monday')}</span></div>
                    <div className="kv"><span>{tx("Default employment type")}</span><span>{row.default_employment_type?.replace('_', '-') ?? '—'}</span></div>
                    <div className="kv"><span>{tx("Default break")}</span><span>{row.default_break_duration ?? 0} {tx("min")}</span></div>
                    <div className="kv"><span>{tx("Sales tax")}</span><span>{tax?.rate != null ? `${(n(tax.rate) * 100).toFixed(0)}%` : '—'}{tax?.registration_number ? ` · ${tax.registration_number}` : ''}</span></div>
                    <div className="kv"><span>{tx("Invoice prefix")}</span><span>{row.invoice_prefix || '—'}</span></div>
                    <div className="kv"><span>{tx("Currency")}</span><span>{row.currency_code ?? tx("CAD")}</span></div>
                </section>

                <PlanCard />

                <section className="card">
                    <h2>{tx("Features")}</h2>
                    <p className="muted small">{tx("These take effect on the phones right away.")}</p>
                    <div className="grid-2">
                        <div>
                            <Sw k="feature_auto_clock_out" label={tx("Auto clock-out")} sub={`at ${settings.auto_clock_out_time}`} />
                            {settings.feature_auto_clock_out && <label className="field"><span>{tx("Auto clock-out time")}</span><input type="time" value={settings.auto_clock_out_time} onChange={e => toggle({ auto_clock_out_time: e.target.value })} /></label>}
                            <label className="field"><span>{tx("Breaks")}</span>
                                <select value={settings.break_policy} onChange={e => toggle({ break_policy: e.target.value as OrgSettings['break_policy'] })}>
                                    <option value="none">{tx("No breaks deducted")}</option><option value="auto">{tx("Automatic unpaid break")}</option><option value="tracked">{tx("Workers start and end breaks")}</option>
                                </select></label>
                            {settings.break_policy === 'auto' && <div className="grid-2">
                                <label className="field"><span>{tx("Break (minutes)")}</span><input inputMode="numeric" value={settings.auto_break_minutes} onChange={e => toggle({ auto_break_minutes: parseInt(e.target.value) || 0 })} /></label>
                                <label className="field"><span>{tx("After shifts over (hours)")}</span><input inputMode="decimal" value={settings.auto_break_threshold_hours} onChange={e => toggle({ auto_break_threshold_hours: Number(e.target.value) || 0 })} /></label>
                            </div>}
                            <Sw k="feature_multi_job_tracking" label={tx("Multiple jobs at once")} sub={tx("a worker may be clocked in on more than one job")} />
                            <Sw k="feature_overtime_alerts" label={tx("Overtime alerts")} sub={tx("week-hours bar on Team and the clock screen")} />
                            <Sw k="feature_scheduling" label={tx("Scheduling")} />
                        </div>
                        <div>
                            <Sw k="feature_geofencing" label={tx("Geofencing")} sub={tx("clock-ins must be within the job's radius")} />
                            {settings.feature_geofencing && <label className="field"><span>{tx("Default radius (metres)")}</span><input inputMode="numeric" value={settings.geofence_radius} onChange={e => toggle({ geofence_radius: parseInt(e.target.value) || 100 })} /></label>}
                            <Sw k="feature_location_tracking" label={tx("Location tracking")} sub={tx("GPS pings while clocked in, for the route map")} />
                            {settings.feature_location_tracking && <label className="field"><span>{tx("Ping every (minutes)")}</span><input inputMode="numeric" value={settings.location_track_interval_minutes} onChange={e => toggle({ location_track_interval_minutes: parseInt(e.target.value) || 15 })} /></label>}
                            <Sw k="feature_reminders" label={tx("Clock-in reminders")} />
                            <Sw k="notify_payment_received" label={tx("Notify workers when a payment is recorded")} />
                        </div>
                    </div>
                </section>

                <OrgList />
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
        } catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save")); setSaving(false); }
    }
    return (
        <Dialog title={tx("Organization details")} wide onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!f.name.trim()} />}
            subtitle={tx("The province decides taxes, overtime and holiday pay for everyone; pay period type and start day are changed on the phone.")}>
            <label className="field"><span>{tx("Name")}</span><input value={f.name} onChange={set('name')} /></label>
            <AddressSearch placeholder={tx("Search for the address (fills the fields below)")} onPick={a => setF(v => ({ ...v, street: a.street, city: a.city, province: a.province, postal: a.postalCode, country: a.countryCode }))} />
            <div className="grid-2">
                <label className="field"><span>{tx("Street")}</span><input value={f.street} onChange={set('street')} /></label>
                <label className="field"><span>{tx("Unit")}</span><input value={f.unit} onChange={set('unit')} /></label>
                <label className="field"><span>{tx("City")}</span><input value={f.city} onChange={set('city')} /></label>
                <label className="field"><span>{tx("Province")}</span><input value={f.province} onChange={set('province')} placeholder={tx("Ontario")} /></label>
                <label className="field"><span>{tx("Postal code")}</span><input value={f.postal} onChange={set('postal')} /></label>
                <label className="field"><span>{tx("Country")}</span><input value={f.country} onChange={set('country')} placeholder={tx("CA")} /></label>
                <label className="field"><span>{tx("Default break (minutes)")}</span><input inputMode="numeric" value={f.brk} onChange={e => setF(v => ({ ...v, brk: e.target.value.replace(/\D/g, '') }))} /></label>
                <label className="field"><span>{tx("Default employment type")}</span>
                    <select value={f.type} onChange={set('type')}><option value="full_time">{tx("Full-time")}</option><option value="part_time">{tx("Part-time")}</option><option value="casual">{tx("Casual")}</option><option value="contractor">{tx("Contractor")}</option><option value="salary">{tx("Salaried")}</option></select></label>
                <label className="field"><span>{tx("Sales tax rate (%)")}</span><input inputMode="decimal" value={f.taxRate} onChange={e => setF(v => ({ ...v, taxRate: e.target.value.replace(/[^0-9.]/g, '') }))} /></label>
                <label className="field"><span>{tx("GST/HST registration number")}</span><input value={f.taxReg} onChange={set('taxReg')} placeholder={tx("123456789RT0001")} /></label>
                <label className="field"><span>{tx("Invoice prefix")}</span><input value={f.prefix} onChange={set('prefix')} placeholder={tx("VF")} /></label>
            </div>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
