// Edit Payroll and Record a payment — the phone's two payroll sheets.
// Same server calls, same protect-on-drift rule (payrollMath.ts).
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { payroll, type PayPeriod, type UserBalance, money, periodLabel, n } from '../api/payroll';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import { payrollGross, payrollGrossDrift, payrollNetAmount, payrollToggleDrift, payrollTotalDeductions, round2 } from '../payrollMath';

const f2 = (v: number) => v.toFixed(2);
const dec = (s: string) => s.replace(/[^0-9.]/g, '');

// Field components live at module scope: defined inside the dialog they would be
// a new component type on every render and the input would lose focus per keystroke.
const Money = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <label className="field"><span>{label}</span><input inputMode="decimal" value={value} disabled={disabled} onChange={e => onChange(dec(e.target.value))} /></label>
);
const Toggle = ({ label, sub, on, set, enabled = true }: { label: string; sub: string; on: boolean; set: (v: boolean) => void; enabled?: boolean }) => (
    <label className={'check' + (enabled ? '' : ' muted')}><input type="checkbox" checked={on} disabled={!enabled} onChange={e => set(e.target.checked)} /> {label} <span className="muted small">— {sub}</span></label>
);


export function EditPayrollDialog({ period, b, name, onClose, onDone }: { period: PayPeriod; b: UserBalance; name: string; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const isContractor = b.employmentType === 'contractor';
    const isCasual = b.employmentType === 'casual';
    const isUs = (b.jurisdiction ?? '').startsWith('United States');
    const isEditing = b.hasPayrollRun;
    const base = n(b.totalEarned);
    const suggOt = n(b.suggestedOvertimePay), suggHol = n(b.suggestedHolidayPay), suggPrem = n(b.suggestedHolidayPremium);
    const vacRate = b.vacationRate ?? 0.04;

    const [otOn, setOtOn]   = useState(isEditing ? n(b.overtimePay) > 0.009 : b.overtimeEnabled && suggOt > 0.009);
    const [vacOn, setVacOn] = useState(isEditing ? n(b.vacationPay) > 0.009 : b.vacationEnabled && !isUs);
    const [holOn, setHolOn] = useState(isEditing ? n(b.holidayPay) > 0.009 : b.holidayEnabled && suggHol > 0.009);
    const [premOn, setPremOn] = useState(isEditing ? n(b.holidayPremium) > 0.009 : b.holidayPremiumEnabled && suggPrem > 0.009);
    const bd = payrollGross(base, suggOt, otOn, vacRate, vacOn, suggHol, holOn, suggPrem, premOn);
    const expectedGross = isContractor ? base : bd.gross;

    const [gross, setGross] = useState(f2(isEditing && b.grossAmount != null ? n(b.grossAmount) : expectedGross));
    const [cpp, setCpp] = useState(f2(n(b.cppAmount)));
    const [ei, setEi] = useState(f2(n(b.eiAmount)));
    const [fed, setFed] = useState(f2(n(b.federalTax)));
    const [prov, setProv] = useState(f2(n(b.stateTax)));
    const [ss, setSs] = useState(f2(n(b.socialSecurityAmount)));
    const [med, setMed] = useState(f2(n(b.medicareAmount)));
    const [other, setOther] = useState(f2(n(b.otherDeductions)));
    const [gst, setGst] = useState(f2(isEditing && b.gstHstAmount != null ? n(b.gstHstAmount) : n(base) * n(b.gstHstRate)));
    const [note, setNote] = useState(b.notes ?? '');
    const [autoCalc, setAutoCalc] = useState(!isContractor && !isCasual && b.deductionsAvailable && !b.manualOverride);
    const [calculating, setCalculating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Toggles rebuild gross (not on first render: an edited run keeps its stored gross).
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        if (!isContractor) setGross(f2(bd.gross));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [otOn, vacOn, holOn, premOn]);

    // Auto-calculate: the server's engine on the current gross, with the run's frozen jurisdiction.
    useEffect(() => {
        if (!autoCalc || !session || !org || isContractor || isCasual) return;
        const g = Number(gross) || 0;
        if (g <= 0) return;
        let cancelled = false;
        setCalculating(true);
        const t = setTimeout(async () => {
            try {
                const r = await api<{ suggestions: Record<string, number> }>('/calculate-deductions', {
                    country_code: 'CA', state_province: b.jurisdiction?.split(' - ')[1] ?? 'Ontario',
                    gross_amount: g, pay_period_type: 'bi_weekly', organizationId: org.organization_id,
                    target_user_id: b.userId, pay_period_id: period.id,
                });
                if (cancelled) return;
                const s = r.suggestions ?? {};
                setCpp(f2(n(s.cpp_amount) + n(s.cpp2_amount))); setEi(f2(n(s.ei_amount)));
                setFed(f2(n(s.federal_tax))); setProv(f2(n(s.state_tax)));
                setSs(f2(n(s.social_security_amount))); setMed(f2(n(s.medicare_amount)));
            } catch (e) { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not calculate'); }
            finally { if (!cancelled) setCalculating(false); }
        }, 400);
        return () => { cancelled = true; clearTimeout(t); };
    }, [autoCalc, gross, session, org, b.userId, b.jurisdiction, period.id, isContractor, isCasual]);

    const g = Number(gross) || 0;
    const deductions = isCasual ? Number(other) || 0
        : payrollTotalDeductions(Number(cpp) || 0, Number(ei) || 0, Number(ss) || 0, Number(med) || 0, Number(fed) || 0, Number(prov) || 0, Number(other) || 0);
    const net = round2(payrollNetAmount(isContractor, g, Number(gst) || 0, deductions));

    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        const grossDrift = payrollGrossDrift(g, expectedGross);
        const toggleDrift = !isContractor && payrollToggleDrift(otOn, vacOn, b.overtimeEnabled, suggOt, b.vacationEnabled, isUs, holOn, premOn, b.holidayEnabled, suggHol, b.holidayPremiumEnabled, suggPrem);
        const protect = isContractor ? grossDrift || payrollGrossDrift(Number(gst) || 0, n(base) * n(b.gstHstRate))
            : isCasual ? grossDrift
            : grossDrift || toggleDrift || !autoCalc;
        try {
            await payroll.saveRun({
                userId: session.userId, targetUserId: b.userId, organizationId: org.organization_id, payPeriodId: period.id,
                grossAmount: g, netAmount: net,
                federalTax: isContractor || isCasual ? 0 : Number(fed) || 0, stateTax: isContractor || isCasual ? 0 : Number(prov) || 0,
                cppAmount: isContractor || isCasual ? 0 : Number(cpp) || 0, eiAmount: isContractor || isCasual ? 0 : Number(ei) || 0,
                socialSecurityAmount: isContractor || isCasual ? 0 : Number(ss) || 0, medicareAmount: isContractor || isCasual ? 0 : Number(med) || 0,
                otherDeductions: isContractor ? 0 : Number(other) || 0,
                gstHstAmount: isContractor ? Number(gst) || 0 : 0,
                vacationPay: isContractor ? 0 : bd.vacationPay, overtimePay: isContractor ? 0 : bd.overtimePay,
                holidayPay: isContractor ? 0 : bd.holidayPay, holidayPremium: isContractor ? 0 : bd.holidayPremium,
                notes: note.trim() || null, manualOverride: protect,
            });
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }

    return (
        <Dialog title={`Edit payroll · ${name}`} subtitle={periodLabel(period) + (b.jurisdiction ? ` · ${b.jurisdiction}` : '')} onClose={onClose} wide
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={calculating} />}>
            <div className="grid-2">
                <Money label="Gross ($)" value={gross} onChange={setGross} />
                <div className="field"><span>Earned from hours</span><div className="rvalue">{money(base)}{expectedGross !== base ? <span className="faint"> → expected {money(expectedGross)}</span> : null}</div>
                    {payrollGrossDrift(g, expectedGross) && <button className="btn btn-sm" type="button" onClick={() => setGross(f2(expectedGross))}>Use expected gross</button>}</div>
            </div>
            {!isContractor && (
                <>
                    <div className="eyebrow nopad">Earnings</div>
                    <Toggle label="Overtime" sub={suggOt > 0.009 ? `premium ${money(suggOt)}` : 'no overtime this period'} on={otOn} set={setOtOn} enabled={suggOt > 0.009 || otOn} />
                    {b.holidays?.length > 0 && <>
                        <Toggle label="Holiday pay" sub={`${b.holidays.map(h => h.name).join(', ')} · ${money(suggHol)}`} on={holOn} set={setHolOn} enabled={suggHol > 0.009 || holOn} />
                        <Toggle label="Holiday premium (1.5×)" sub={suggPrem > 0.009 ? `${money(suggPrem)} extra for hours worked on the holiday` : 'no hours worked on the holiday'} on={holOn && premOn} set={setPremOn} enabled={holOn && (suggPrem > 0.009 || premOn)} />
                    </>}
                    {!isUs && <Toggle label={`Vacation pay (${(vacRate * 100).toFixed(0)}%)`} sub={vacOn ? `adding ${money(bd.vacationPay)}` : 'not added this period'} on={vacOn} set={setVacOn} />}
                    <div className="eyebrow nopad">{isCasual ? 'Deductions' : 'Withholding'}</div>
                    {!isCasual && (b.deductionsAvailable ? (
                        <>
                            <label className="check"><input type="checkbox" checked={autoCalc} onChange={e => setAutoCalc(e.target.checked)} /> Auto-calculate <span className="muted small">— the CRA formula on this gross{calculating ? ' · calculating…' : ''}</span></label>
                            <div className="grid-2">
                                {isUs ? <><Money label="Social Security" value={ss} onChange={setSs} disabled={autoCalc} /><Money label="Medicare" value={med} onChange={setMed} disabled={autoCalc} /></>
                                      : <><Money label="CPP (incl. CPP2)" value={cpp} onChange={setCpp} disabled={autoCalc} /><Money label="EI" value={ei} onChange={setEi} disabled={autoCalc} /></>}
                                <Money label="Federal tax" value={fed} onChange={setFed} disabled={autoCalc} />
                                <Money label={isUs ? 'State tax' : 'Provincial tax'} value={prov} onChange={setProv} disabled={autoCalc} />
                            </div>
                        </>
                    ) : <p className="caution small">Statutory deductions aren't available for {b.jurisdiction?.split(' - ')[1] ?? 'this jurisdiction'} yet. This pay is shown gross.</p>)}
                    <Money label="Other deductions ($)" value={other} onChange={setOther} />
                    {b.customDeductions?.length > 0 && <p className="faint small">Organization deductions on this run: {b.customDeductions.map(c => `${c.name} ${money(c.amount)}`).join(', ')} — included in Other.</p>}
                </>
            )}
            {isContractor && (
                <>
                    <div className="eyebrow nopad">Tax added on top</div>
                    <Money label={n(b.gstHstRate) > 0 ? `GST/HST (${(n(b.gstHstRate) * 100).toFixed(0)}%)` : 'GST/HST'} value={gst} onChange={setGst} />
                </>
            )}
            <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent', marginTop: 8 }}>
                <div className="stat-label">{isContractor ? 'Total payable' : 'Net pay'}</div>
                <div className="stat">{money(net)}</div>
                <div className="muted small">{isContractor ? 'Gross plus the tax above.' : 'Gross minus every deduction above. This is the figure that gets saved.'}</div>
            </div>
            <label className="field"><span>Note (optional)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Why this run was adjusted" /></label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}

export function RecordPaymentDialog({ period, b, name, onClose, onDone }: { period: PayPeriod; b: UserBalance; name: string; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const owed = Math.max(0, round2(n(b.netAmount) - n(b.totalPaid)));
    const [amount, setAmount] = useState(f2(owed));
    const [method, setMethod] = useState('e-transfer');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        try {
            await payroll.createPayment({
                userId: session.userId, organizationId: org.organization_id, targetUserId: b.userId,
                amountPaid: Number(amount) || 0, paymentMethod: method, status: 'paid',
                paymentDate: `${date}T12:00:00`, notes: note.trim() || null, payPeriodId: period.id, payrollRunId: b.payrollRunId ?? null,
            });
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not record the payment'); setSaving(false); }
    }
    return (
        <Dialog title={`Record a payment · ${name}`} subtitle={`${periodLabel(period)} · net ${money(b.netAmount)}, paid so far ${money(b.totalPaid)}`} onClose={onClose}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} label="Record" disabled={!(Number(amount) > 0)} />}>
            <label className="field"><span>Amount ($)</span><input inputMode="decimal" value={amount} onChange={e => setAmount(dec(e.target.value))} autoFocus /></label>
            <label className="field"><span>Method</span>
                <select value={method} onChange={e => setMethod(e.target.value)}>
                    <option value="e-transfer">E-transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="direct_deposit">Direct deposit</option>
                </select>
            </label>
            <label className="field"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="field"><span>Note (optional)</span><input value={note} onChange={e => setNote(e.target.value)} /></label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
