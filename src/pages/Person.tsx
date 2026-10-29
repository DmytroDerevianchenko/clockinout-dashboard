// The person record: the phone's Team record, in three groups — Identity,
// Employment, Account — with the same rules. Identity is locked once the
// person has claimed their account (they edit it themselves); employment
// facts are the employer's; your own row cannot be terminated here.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { team, type RosterUser, money, dateOnly, dateTime, employmentLabel, statusLabel, num, PROVINCES } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import { useRoster, ClockInDialog } from './Team';

type Editor =
    | { kind: 'text'; field: string; label: string; value: string; type?: string }
    | { kind: 'status' } | { kind: 'type' } | { kind: 'rate' } | { kind: 'tax' } | { kind: 'jurisdiction' } | { kind: 'clockin' } | { kind: 'end' };

function Row({ label, value, placeholder, onClick, locked, tone }: { label: string; value?: ReactNode; placeholder?: string; onClick?: () => void; locked?: boolean; tone?: 'caution' | 'danger' }) {
    const empty = value === undefined || value === null || value === '';
    return (
        <div className={'rrow' + (onClick && !locked ? ' clickable' : '')} onClick={locked ? undefined : onClick}>
            <div className="rlabel">{label}</div>
            <div className={'rvalue' + (empty ? ' faint' : '') + (tone ? ` ${tone}` : '')}>{empty ? (placeholder ?? 'Not set') : value}</div>
            {locked ? <span className="rlock" title="Edited by the person in the app">🔒</span> : onClick ? <span className="rchev">›</span> : null}
        </div>
    );
}

export default function Person() {
    const { id } = useParams();
    const { session, org } = useAuth();
    const { data, error, reload } = useRoster();
    const [editor, setEditor] = useState<Editor | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const user = useMemo(() => data?.users.find(u => u.id === Number(id)) ?? null, [data, id]);
    const self = !!user && user.id === session?.userId;
    const sealed = !!user && user.has_password;           // claimed account: identity is theirs
    const contractor = user?.employment_type === 'contractor';

    const save = useCallback(async (field: string, value: string) => {
        if (!session || !org || !user) return;
        try { await team.updateField(session.userId, org.organization_id, user.id, field, value); setEditor(null); await reload(); }
        catch (e) { setFlash(e instanceof ApiError ? e.message : 'Could not save'); }
    }, [session, org, user, reload]);

    useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(t); } }, [flash]);

    if (error) return <div className="card danger">{error}</div>;
    if (!data) return <div className="card muted">Loading…</div>;
    if (!user) return <div className="card">This person is not on the team. <Link to="/team">Back to Team</Link></div>;

    const text = (field: string, label: string, value: string | null | undefined, type?: string): Editor => ({ kind: 'text', field, label, value: value ?? '', type });
    const address = [user.street, user.unit_number, user.city, user.state, user.postal_code, user.country].filter(Boolean).join(', ');
    const taxSummary = (() => {
        const parts: string[] = [];
        const basic = 'Basic claim';
        parts.push(user.td1_federal == null && user.td1_provincial == null ? basic
            : `TD1 ${user.td1_federal != null ? money(user.td1_federal) : basic.toLowerCase()} / ${user.td1_provincial != null ? money(user.td1_provincial) : basic.toLowerCase()}`);
        if (user.cpp_exempt) parts.push('CPP exempt');
        if (user.ei_exempt) parts.push('EI exempt');
        if (num(user.pretax_deductions) > 0) parts.push(`Pre-tax ${money(user.pretax_deductions)}/pay`);
        if (user.tax_dependants > 0) parts.push(`Dependants: ${user.tax_dependants}`);
        if (num(user.opening_gross) > 0) parts.push(`${user.opening_year} opening balances`);
        return parts.join('  ·  ');
    })();

    return (
        <>
            <p><Link to="/team">‹ Team</Link></p>
            <div className="person-head">
                <div>
                    <h2 style={{ fontSize: 22 }}>{user.full_name} {self && <span className="pill">You</span>}</h2>
                    <div className="muted">{employmentLabel(user.employment_type)} · {statusLabel(user.status)}{user.is_clocked_in ? ` · On the clock${user.current_job_name ? ` at ${user.current_job_name}` : ''}` : ''}</div>
                </div>
                <div className="head-actions">
                    {user.status === 'active' && (user.is_clocked_in
                        ? <button className="btn" onClick={() => setEditor({ kind: 'end' })}>End shift</button>
                        : <button className="btn" onClick={() => setEditor({ kind: 'clockin' })}>Clock in</button>)}
                    {!user.joined && session && org && (
                        <button className="btn" onClick={async () => {
                            try { const r = await team.sendInvite(session.email, user.email, org.organization_id); setFlash(r.message ?? 'Invite sent'); }
                            catch (e) { setFlash(e instanceof ApiError ? e.message : 'Could not send the invite'); }
                        }}>Send invite</button>
                    )}
                </div>
            </div>
            {flash && <p className="error-line">{flash}</p>}

            <div className="groups">
                <section className="card card-flush">
                    <div className="eyebrow">Identity</div>
                    {sealed && <p className="muted small pad">{self ? 'Your name, email and phone are edited in the app under Settings → Edit Profile.' : 'This person has activated their account and manages their own name, email, phone and address in the app.'}</p>}
                    <Row label="Full name" value={user.full_name} locked={sealed} onClick={() => setEditor(text('full_name', 'Full name', user.full_name))} />
                    <Row label="Email" value={user.email} locked={sealed} onClick={() => setEditor(text('email', 'Email', user.email, 'email'))} />
                    <Row label="Phone" value={user.phone_number} locked={sealed} onClick={() => setEditor(text('phone_number', 'Phone', user.phone_number))} />
                    <Row label="Address" value={address} locked={sealed} onClick={() => setEditor(text('street', 'Street', user.street))} />
                    <Row label="Date of birth" value={dateOnly(user.dob)} locked={sealed} onClick={() => setEditor(text('dob', 'Date of birth', user.dob?.slice(0, 10), 'date'))} />
                    <Row label={contractor ? 'Business number' : 'SIN'} value={contractor ? user.tax_registration_number : user.taxpayer_id ? '•••••' + user.taxpayer_id.slice(-3) : null}
                        locked={!contractor && sealed}
                        onClick={() => setEditor(contractor ? text('tax_registration_number', 'GST/HST registration number', user.tax_registration_number) : text('taxpayer_id', 'SIN (9 digits)', ''))} />
                </section>

                <section className="card card-flush">
                    <div className="eyebrow">Employment</div>
                    <Row label="Start date" value={dateOnly(user.start_date ?? user.joined_at)} onClick={() => setEditor(text('start_date', 'Start date', (user.start_date ?? '').slice(0, 10), 'date'))} />
                    <Row label="Employment type" value={employmentLabel(user.employment_type)} onClick={() => setEditor({ kind: 'type' })} />
                    <Row label="Status" value={statusLabel(user.status)} tone={user.status === 'terminated' ? 'danger' : user.status === 'inactive' ? 'caution' : undefined}
                        locked={self} onClick={() => setEditor({ kind: 'status' })} />
                    <Row label="Pay rate" value={user.current_rate != null ? `${money(user.current_rate)}/h${num(user.salary_amount) > 0 ? `  ·  ${money(user.salary_amount)}/yr` : ''}` : null}
                        placeholder="Tap to set" onClick={() => setEditor({ kind: 'rate' })} />
                    {!contractor && <Row label="Tax profile" value={taxSummary} onClick={() => setEditor({ kind: 'tax' })} />}
                    {!contractor && <Row label="Tax jurisdiction" value={user.tax_jurisdiction_override?.replace(/^CA-/, '')} placeholder="Organization’s province" onClick={() => setEditor({ kind: 'jurisdiction' })} />}
                    <Row label="Notes" value={user.notes} placeholder="Optional — tap to add" onClick={() => setEditor(text('notes', 'Notes', user.notes))} />
                    <Row label="Geofencing" value={user.geofence_enabled ? `Enabled (${user.geofence_radius ?? 100} m)` : 'Disabled'} />
                </section>

                <section className="card card-flush">
                    <div className="eyebrow">Account</div>
                    <Row label="Admin access" value={user.is_admin ? 'Yes' : 'No'} locked={self || user.role === 'employer'}
                        onClick={() => save('is_admin', user.is_admin ? 'false' : 'true')} />
                    <Row label="Registered" value={dateTime(user.created_at)} />
                    <Row label="Joined organization" value={user.joined ? dateTime(user.joined_at) : 'Not joined yet'} tone={user.joined ? undefined : 'caution'} />
                    {!user.joined && user.verification_code && <Row label="Invite code" value={user.verification_code} />}
                    <Row label="Last active" value={dateTime(user.org_last_login)} placeholder="Never" />
                </section>
            </div>

            {editor?.kind === 'text' && <TextDialog ed={editor} onClose={() => setEditor(null)} onSave={save} />}
            {editor?.kind === 'status' && (
                <ChoiceDialog title="Status" options={[['active', 'Active'], ['inactive', 'Inactive'], ['terminated', 'Terminated']]} current={user.status} onClose={() => setEditor(null)} onPick={v => save('status', v)} />
            )}
            {editor?.kind === 'type' && (
                <ChoiceDialog title="Employment type" options={[['full_time', 'Full-time'], ['part_time', 'Part-time'], ['casual', 'Casual'], ['contractor', 'Contractor'], ['salary', 'Salaried']]} current={user.employment_type ?? ''} onClose={() => setEditor(null)} onPick={v => save('employment_type', v)} />
            )}
            {editor?.kind === 'jurisdiction' && (
                <ChoiceDialog title="Tax jurisdiction" subtitle="Taxes follow the province where this person reports to work — the organization’s, unless they work from an establishment in another one. Changes apply to pay periods calculated from now on."
                    options={[['', 'Organization’s province'], ...PROVINCES.map(p => [`CA-${p}`, p] as [string, string])]}
                    current={user.tax_jurisdiction_override ?? ''} onClose={() => setEditor(null)} onPick={v => save('tax_jurisdiction_override', v)} />
            )}
            {editor?.kind === 'rate' && <RateDialog user={user} onClose={() => setEditor(null)} onSave={async (rate, salary) => { await save('current_rate', rate); if (salary !== undefined) await save('salary_amount', salary); }} />}
            {editor?.kind === 'tax' && <TaxProfileDialog user={user} onClose={() => setEditor(null)} onDone={() => { setEditor(null); reload(); }} onError={setFlash} />}
            {editor?.kind === 'clockin' && <ClockInDialog user={user} onClose={() => setEditor(null)} onDone={() => { setEditor(null); reload(); }} />}
            {editor?.kind === 'end' && session && org && (
                <Dialog title={`End ${user.full_name}'s shift?`} onClose={() => setEditor(null)}
                    footer={<SaveFooter onCancel={() => setEditor(null)} label="End shift" onSave={async () => {
                        try { await team.endShift(session.userId, user.current_clock_in_id!, new Date().toISOString(), org.organization_id); setEditor(null); reload(); }
                        catch (e) { setFlash(e instanceof ApiError ? e.message : 'Could not end the shift'); }
                    }} />}>
                    <p className="muted">The shift ends now; times can be adjusted on their hours afterwards.</p>
                </Dialog>
            )}
        </>
    );
}

function TextDialog({ ed, onClose, onSave }: { ed: Extract<Editor, { kind: 'text' }>; onClose: () => void; onSave: (field: string, value: string) => Promise<void> }) {
    const [v, setV] = useState(ed.value);
    const [saving, setSaving] = useState(false);
    return (
        <Dialog title={ed.label} onClose={onClose} footer={<SaveFooter onCancel={onClose} saving={saving} onSave={async () => { setSaving(true); await onSave(ed.field, v.trim()); setSaving(false); }} />}>
            <label className="field"><span>{ed.label}</span>
                {ed.field === 'notes'
                    ? <textarea rows={4} value={v} onChange={e => setV(e.target.value)} />
                    : <input type={ed.type ?? 'text'} value={v} onChange={e => setV(e.target.value)} autoFocus />}
            </label>
        </Dialog>
    );
}

function ChoiceDialog({ title, subtitle, options, current, onClose, onPick }: { title: string; subtitle?: string; options: [string, string][]; current: string; onClose: () => void; onPick: (v: string) => void }) {
    return (
        <Dialog title={title} subtitle={subtitle} onClose={onClose}>
            <div className="choices">
                {options.map(([v, l]) => (
                    <button key={v} className={'choice' + (v === current ? ' selected' : '')} onClick={() => v === current ? onClose() : onPick(v)}>{l}{v === current && <span>✓</span>}</button>
                ))}
            </div>
        </Dialog>
    );
}

function RateDialog({ user, onClose, onSave }: { user: RosterUser; onClose: () => void; onSave: (rate: string, salary?: string) => Promise<void> }) {
    const [salaryMode, setSalaryMode] = useState(num(user.salary_amount) > 0);
    const [rate, setRate] = useState(user.current_rate != null ? String(user.current_rate) : '');
    const [salary, setSalary] = useState(num(user.salary_amount) > 0 ? String(Math.round(num(user.salary_amount))) : '');
    const derived = salary ? Math.round((Number(salary) / 2080) * 100) / 100 : null;
    const [saving, setSaving] = useState(false);
    return (
        <Dialog title="Pay rate" subtitle="Hours, overtime and taxes run on the hourly rate; a salary is the number people discussed, shown on paystubs." onClose={onClose}
            footer={<SaveFooter onCancel={onClose} saving={saving} disabled={salaryMode ? derived == null : !rate} onSave={async () => {
                setSaving(true);
                if (salaryMode) await onSave(String(derived), salary); else await onSave(rate, '');
                setSaving(false);
            }} />}>
            <label className="check"><input type="checkbox" checked={salaryMode} onChange={e => setSalaryMode(e.target.checked)} /> Paid an annual salary</label>
            {salaryMode ? (
                <label className="field"><span>Annual salary ($/year)</span>
                    <input inputMode="decimal" value={salary} onChange={e => setSalary(e.target.value.replace(/[^0-9.]/g, ''))} />
                    <small className="muted">{derived != null ? `= ${money(derived)}/h (salary ÷ 2,080 h)` : 'The hourly rate is salary ÷ 2,080 h.'}</small>
                </label>
            ) : (
                <label className="field"><span>Hourly rate ($/h)</span>
                    <input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus />
                </label>
            )}
        </Dialog>
    );
}

function TaxProfileDialog({ user, onClose, onDone, onError }: { user: RosterUser; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
    const { org } = useAuth();
    const s = (v: unknown) => (v == null || num(v) === 0 ? '' : String(num(v)).replace(/\.00$/, ''));
    const [fed, setFed] = useState(user.td1_federal != null ? s(user.td1_federal) : '');
    const [prov, setProv] = useState(user.td1_provincial != null ? s(user.td1_provincial) : '');
    const [cpp, setCpp] = useState(user.cpp_exempt);
    const [ei, setEi] = useState(user.ei_exempt);
    const [pretax, setPretax] = useState(s(user.pretax_deductions));
    const [deps, setDeps] = useState(user.tax_dependants > 0 ? String(user.tax_dependants) : '');
    const year = new Date().getFullYear();
    const opening0 = [user.opening_gross, user.opening_cpp, user.opening_cpp2, user.opening_ei, user.opening_federal_tax, user.opening_provincial_tax].map(s);
    const [opening, setOpening] = useState(opening0);
    const [saving, setSaving] = useState(false);
    const dec = (v: string) => v.replace(/[^0-9.]/g, '');

    async function save() {
        if (!org) return;
        setSaving(true);
        try {
            await team.setTaxProfile(user.id, org.organization_id, {
                td1Federal: fed ? Number(fed) : null, td1Provincial: prov ? Number(prov) : null,
                cppExempt: cpp, eiExempt: ei, pretaxDeductions: Number(pretax) || 0, dependants: Number(deps) || 0,
            });
            if (opening.join('|') !== opening0.join('|')) {
                const v = opening.map(x => Number(x) || 0);
                await team.setOpeningBalances(user.id, org.organization_id, year, { gross: v[0], cpp: v[1], cpp2: v[2], ei: v[3], federalTax: v[4], provincialTax: v[5] });
            }
            onDone();
        } catch (e) { onError(e instanceof ApiError ? e.message : 'Could not save the tax profile'); setSaving(false); }
    }
    const openingLabels = ['Gross pay so far ($)', 'CPP deducted ($)', 'CPP2 deducted ($)', 'EI deducted ($)', 'Federal tax deducted ($)', 'Provincial tax deducted ($)'];

    return (
        <Dialog title="Tax profile" wide onClose={onClose}
            subtitle="From the TD1 forms on file. Leave a claim amount blank to use the basic personal amount. Changes apply to pay periods calculated from now on; calculated periods keep their figures until you edit them."
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} />}>
            <div className="grid-2">
                <label className="field"><span>Federal TD1 total claim ($)</span><input inputMode="decimal" value={fed} onChange={e => setFed(dec(e.target.value))} placeholder="Basic personal amount" />
                    <small className="muted">The “Total claim amount” line at the bottom of the federal TD1. Blank = the basic personal amount — most people claim only that.</small></label>
                <label className="field"><span>Provincial TD1 total claim ($)</span><input inputMode="decimal" value={prov} onChange={e => setProv(dec(e.target.value))} placeholder="Basic personal amount" />
                    <small className="muted">Same line on the provincial TD1 (TD1ON for Ontario).</small></label>
            </div>
            <label className="check"><input type="checkbox" checked={cpp} onChange={e => setCpp(e.target.checked)} /> CPP exempt <span className="muted">— under 18, over 70, or a CPT30 election on file</span></label>
            <label className="check"><input type="checkbox" checked={ei} onChange={e => setEi(e.target.checked)} /> EI exempt <span className="muted">— not at arm’s length with the employer, e.g. close family</span></label>
            <div className="grid-2">
                <label className="field"><span>Pre-tax deductions per pay ($)</span><input inputMode="decimal" value={pretax} onChange={e => setPretax(dec(e.target.value))} placeholder="0" />
                    <small className="muted">RRSP contributions or union dues deducted at source.</small></label>
                <label className="field"><span>Dependants</span><input inputMode="numeric" value={deps} onChange={e => setDeps(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="0" />
                    <small className="muted">Children under 18 and infirm dependants. Ontario tax reduction only.</small></label>
            </div>
            <h3 style={{ marginTop: 8 }}>Earlier in {year}, before ClockInOut</h3>
            <p className="muted small">What this organization already paid and deducted for this person this year, from your old payroll. Needed so CPP and EI stop at their yearly maximums and paystubs show true year-to-date figures. Only this organization’s own figures — the maximums are per employer, so another employer’s deductions never go here.</p>
            <div className="grid-2">
                {openingLabels.map((l, i) => (
                    <label key={l} className="field"><span>{l}</span><input inputMode="decimal" value={opening[i]} placeholder="0" onChange={e => setOpening(o => o.map((x, j) => j === i ? dec(e.target.value) : x))} /></label>
                ))}
            </div>
        </Dialog>
    );
}
