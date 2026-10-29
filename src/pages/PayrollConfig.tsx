// Payroll Configuration — the phone's wizard: overtime rules (weekly and
// daily thresholds, multiplier, who it applies to), vacation pay, statutory
// holidays, custom deductions. Saved as the organization's payroll config
// (a whole-object write, like the phones). Changes apply to periods
// calculated from now on; calculated periods keep their figures.
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { orgApi, statutoryOvertime, type OrgRow, type PayrollConfig } from '../api/org';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';

const TYPES = [['full_time', 'Full-time'], ['part_time', 'Part-time'], ['casual', 'Casual'], ['salary', 'Salaried']];
const amountOf = (formula: string | undefined) => { const m = /^fixed:([0-9.]+)$/.exec(formula ?? ''); return m ? m[1] : ''; };

export default function PayrollConfigDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [row, setRow] = useState<OrgRow | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [f, setF] = useState({ otOn: false, week: '44', day: '0', mult: '1.5', appliesTo: 'full_time', vacOn: false, vacRate: '0.04', holOn: false, premOn: false });
    const [rows, setRows] = useState<{ name: string; amount: string }[]>([]);

    useEffect(() => {
        if (!session || !org) return;
        orgApi.list(session.userId).then(r => {
            const o = r.organizations.find(x => x.id === org.organization_id);
            if (!o) { setError('Organization not found'); return; }
            setRow(o);
            const c = o.payroll_config_json ?? {};
            const st = statutoryOvertime(o.country_code, o.state_province);
            setF({
                otOn: c.overtime_enabled === true,
                week: String(c.overtime?.threshold_week ?? st.week),
                day: String(c.overtime?.threshold_day ?? st.day),
                mult: String(c.overtime?.multiplier ?? 1.5),
                appliesTo: c.overtime?.applies_to?.[0] ?? o.default_employment_type ?? 'full_time',
                vacOn: c.vacation_pay_enabled === true,
                vacRate: String(c.vacation_pay_rate ?? 0.04),
                holOn: c.holiday_pay_enabled === true,
                premOn: c.holiday_premium_enabled === true,
            });
            setRows((c.deductions ?? []).map(d => ({ name: d.name ?? '', amount: amountOf(d.formula) })));
        }).catch(e => setError(e instanceof ApiError ? e.message : 'Could not load the organization'));
    }, [session, org]);

    const st = statutoryOvertime(row?.country_code ?? null, row?.state_province ?? null);
    const set = (k: keyof typeof f, v: string | boolean) => setF(x => ({ ...x, [k]: v }));

    async function loadDefaults() {
        if (!row) return;
        try {
            const r = await orgApi.defaults(row.id, row.country_code ?? 'CA', row.state_province ?? 'Ontario', f.appliesTo);
            const c = r.config ?? {};
            setF(x => ({ ...x,
                week: String(c.overtime?.threshold_week ?? st.week),
                day: String(c.overtime?.threshold_day ?? st.day),
                mult: String(c.overtime?.multiplier ?? 1.5),
                vacRate: String(c.vacation_pay_rate ?? 0.04),
            }));
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load defaults'); }
    }

    async function save() {
        if (!session || !row) return;
        setSaving(true); setError(null);
        const config: PayrollConfig = {
            deductions: rows.filter(r => r.name.trim() && Number(r.amount) > 0).map(r => ({ name: r.name.trim(), formula: `fixed:${Number(r.amount)}`, applies_to: ['all'] })),
            overtime: { threshold_week: parseInt(f.week) || 40, threshold_day: parseInt(f.day) || 0, multiplier: Number(f.mult) || 1.5, applies_to: [f.appliesTo] },
            vacation_pay_rate: Number(f.vacRate) || 0.04,
            overtime_enabled: f.otOn, vacation_pay_enabled: f.vacOn,
            holiday_pay_enabled: f.holOn, holiday_premium_enabled: f.premOn && f.holOn,
        };
        try { await orgApi.savePayrollConfig(session.userId, row, config); onDone(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }

    const Pill = ({ show, text, onClick }: { show: boolean; text: string; onClick: () => void }) => show ? <button type="button" className="pill-btn" onClick={onClick}>{text}</button> : null;

    return (
        <Dialog title="Payroll configuration" wide onClose={onClose}
            subtitle="Set up payroll rules. Changes apply to pay periods calculated from now on; periods already calculated keep their figures — open one and use Edit payroll to change it."
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!row} />}>
            {!row ? <p className="muted">Loading…</p> : (
                <>
                    {(!row.country_code || !row.state_province) && <p className="caution small">Set the organization's address first. Taxes, overtime and holiday pay follow its province; until then Ontario is assumed.</p>}
                    <div className="eyebrow nopad">Overtime rules <button type="button" className="btn btn-sm" style={{ marginLeft: 10 }} onClick={loadDefaults}>Load defaults for {row.state_province || 'this province'}</button></div>
                    <label className="check"><input type="checkbox" checked={f.otOn} onChange={e => set('otOn', e.target.checked)} /> Overtime enabled</label>
                    <div className="grid-2">
                        <label className="field"><span>Weekly hours threshold</span><input inputMode="numeric" value={f.week} onChange={e => set('week', e.target.value.replace(/\D/g, ''))} />
                            <Pill show={f.otOn && parseInt(f.week) !== st.week} text={`Suggested for ${row.state_province}: ${st.week} — apply`} onClick={() => set('week', String(st.week))} /></label>
                        <label className="field"><span>Daily hours threshold (0 = none)</span><input inputMode="numeric" value={f.day} onChange={e => set('day', e.target.value.replace(/\D/g, '').slice(0, 2))} />
                            <small className="muted">After this many hours in one day, on top of the weekly rule. BC, Alberta, the Prairies and the territories require 8; Ontario and the East have no daily rule.</small>
                            <Pill show={f.otOn && parseInt(f.day) !== st.day} text={`Suggested for ${row.state_province}: ${st.day} — apply`} onClick={() => set('day', String(st.day))} /></label>
                        <label className="field"><span>Multiplier</span><input inputMode="decimal" value={f.mult} onChange={e => set('mult', e.target.value.replace(/[^0-9.]/g, ''))} />
                            <Pill show={f.otOn && Number(f.mult) !== 1.5} text="Suggested: 1.5 (time and a half) — apply" onClick={() => set('mult', '1.5')} /></label>
                        <label className="field"><span>Applies to</span>
                            <select value={f.appliesTo} onChange={e => set('appliesTo', e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                    </div>

                    <div className="eyebrow nopad">Vacation pay</div>
                    <p className="muted small">Adds the rate below to each pay (Canada only). Off = accrue and pay out separately.</p>
                    <label className="check"><input type="checkbox" checked={f.vacOn} onChange={e => set('vacOn', e.target.checked)} /> Vacation pay on every cheque</label>
                    <label className="field"><span>Vacation pay rate (0.04 = 4%)</span><input inputMode="decimal" value={f.vacRate} onChange={e => set('vacRate', e.target.value.replace(/[^0-9.]/g, ''))} /></label>

                    <div className="eyebrow nopad">Statutory holidays</div>
                    <p className="muted small">Public holiday pay for the holidays that fall in a pay period, by the organization's province: its own calendar, formula and premium rate.</p>
                    <label className="check"><input type="checkbox" checked={f.holOn} onChange={e => set('holOn', e.target.checked)} /> Public holiday pay on each pay</label>
                    <label className={'check' + (f.holOn ? '' : ' muted')}><input type="checkbox" checked={f.premOn && f.holOn} disabled={!f.holOn} onChange={e => set('premOn', e.target.checked)} /> 1.5× for hours worked on a holiday <span className="muted small">— off = hours on a holiday are paid at the regular rate</span></label>

                    <div className="eyebrow nopad">Custom deductions</div>
                    <p className="muted small">Fixed amounts taken from every pay (union dues, parking…), after tax.</p>
                    {rows.map((r, i) => (
                        <div key={i} className="grid-2 ded-row">
                            <label className="field"><span>Name</span><input value={r.name} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></label>
                            <label className="field"><span>Amount per pay ($)</span>
                                <div className="inline-row"><input inputMode="decimal" value={r.amount} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, amount: e.target.value.replace(/[^0-9.]/g, '') } : x))} />
                                    <button type="button" className="btn btn-sm" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>Remove</button></div></label>
                        </div>
                    ))}
                    <button type="button" className="btn btn-sm" onClick={() => setRows(rs => [...rs, { name: '', amount: '' }])}>Add a deduction</button>
                    {error && <p className="error-line">{error}</p>}
                </>
            )}
        </Dialog>
    );
}
