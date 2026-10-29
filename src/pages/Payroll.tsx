// Payroll, read-first: the year's pay periods with their totals, each period
// expandable to its people, each person opening the same details card the
// phone shows — hours, earnings, add-ons, deductions, net, payments and the
// balance — plus paystub / contractor invoice PDFs and the CSV export.
// Editing (Edit Payroll, record a payment, configuration) is the next slice.
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { payroll, type PayPeriod, type UserBalance, money, hours, periodLabel, n } from '../api/payroll';
import { team, type RosterUser } from '../api/team';
import { useAuth } from '../auth';
import Dialog from '../components/Dialog';

type Names = Map<number, RosterUser>;

export default function Payroll() {
    const { session, org } = useAuth();
    const thisYear = new Date().getFullYear();
    const [year, setYear] = useState(thisYear);
    const [data, setData] = useState<{ periods: PayPeriod[]; years: number[]; earned: number; paid: number } | null>(null);
    const [names, setNames] = useState<Names>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<number | null>(null);          // expanded period id
    const [detail, setDetail] = useState<{ period: PayPeriod; b: UserBalance } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !org) return;
        let cancelled = false;
        setData(null); setError(null);
        Promise.all([
            payroll.periods(session.userId, org.organization_id, year),
            team.roster(session.userId, org.organization_id),
        ]).then(([p, r]) => {
            if (cancelled) return;
            setNames(new Map(r.users.map(u => [u.id, u])));
            // Newest first; the open period (today inside it) expanded by default.
            const periods = [...p.payPeriods].sort((a, b) => b.start_date.localeCompare(a.start_date));
            setData({ periods, years: p.availableYears?.length ? p.availableYears : [thisYear], earned: p.earnedYearly, paid: p.paidYearly });
            const now = Date.now();
            const current = periods.find(x => Date.parse(x.start_date) <= now && now <= Date.parse(x.end_date));
            setOpen(current?.id ?? periods[0]?.id ?? null);
        }).catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load payroll'); });
        return () => { cancelled = true; };
    }, [session, org, year, thisYear]);

    const totals = useMemo(() => {
        const t = new Map<number, { hours: number; gross: number; net: number; paid: number; people: number }>();
        for (const p of data?.periods ?? []) {
            const rows = (p.userBalances ?? []).filter(b => n(b.totalHours) > 0 || b.hasPayrollRun || n(b.totalPaid) > 0);
            t.set(p.id, {
                hours: rows.reduce((a, b) => a + n(b.totalHours), 0),
                gross: rows.reduce((a, b) => a + n(b.grossAmount ?? b.totalEarned), 0),
                net:   rows.reduce((a, b) => a + n(b.netAmount), 0),
                paid:  rows.reduce((a, b) => a + n(b.totalPaid), 0),
                people: rows.length,
            });
        }
        return t;
    }, [data]);

    async function openPdf(kind: 'paystub' | 'invoice' | 'csv', b?: UserBalance, p?: PayPeriod) {
        if (!session || !org) return;
        const key = `${kind}-${p?.id ?? 'year'}-${b?.userId ?? ''}`;
        setBusy(key);
        try {
            const r = kind === 'csv'
                ? await payroll.csv(session.userId, org.organization_id, year, p?.id)
                : kind === 'paystub'
                    ? await payroll.paystub(b!.userId, org.organization_id, p!.id)
                    : await payroll.contractorInvoice(b!.userId, org.organization_id, p!.id);
            const url = (r as { pdf_url?: string; csv_url?: string }).pdf_url ?? (r as { csv_url?: string }).csv_url;
            if (url) window.open(url, '_blank', 'noopener');
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not build the file'); }
        finally { setBusy(null); }
    }

    if (error) return <div className="card danger">{error}</div>;
    if (!data) return <div className="card muted">Loading…</div>;

    return (
        <>
            <div className="toolbar">
                <label className="field inline"><span>Year</span>
                    <select value={year} onChange={e => setYear(Number(e.target.value))}>
                        {data.years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                <div className="muted small">Earned this year {money(data.earned)} · paid {money(data.paid)}</div>
                <span className="spacer" />
                <button className="btn" disabled={busy === `csv-year-`} onClick={() => openPdf('csv')}>Export year CSV</button>
            </div>

            <div className="periods">
                {data.periods.map(p => {
                    const t = totals.get(p.id)!;
                    const isOpen = open === p.id;
                    const rows = (p.userBalances ?? []).filter(b => n(b.totalHours) > 0 || b.hasPayrollRun || n(b.totalPaid) > 0)
                        .sort((a, b) => (names.get(a.userId)?.full_name ?? '').localeCompare(names.get(b.userId)?.full_name ?? ''));
                    const outstanding = t.net - t.paid;
                    return (
                        <div key={p.id} className={'card card-flush period' + (isOpen ? ' open' : '')}>
                            <button className="period-head" onClick={() => setOpen(isOpen ? null : p.id)}>
                                <div>
                                    <strong>{periodLabel(p)}</strong>
                                    <div className="faint small">{t.people} {t.people === 1 ? 'person' : 'people'} · {hours(t.hours)}{p.status !== 'open' ? ` · ${p.status}` : ''}</div>
                                </div>
                                <div className="period-sums">
                                    <span><em>Gross</em>{money(t.gross)}</span>
                                    <span><em>Net</em>{money(t.net)}</span>
                                    <span><em>Paid</em>{money(t.paid)}</span>
                                    <span className={Math.abs(outstanding) > 0.009 ? (outstanding > 0 ? 'danger' : 'caution') : ''}><em>Owed</em>{money(outstanding)}</span>
                                </div>
                            </button>
                            {isOpen && (
                                rows.length === 0 ? <div className="empty">No hours in this period.</div> : (
                                    <table className="table table-hover">
                                        <thead><tr><th>Name</th><th>Hours</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
                                        <tbody>
                                            {rows.map(b => {
                                                const u = names.get(b.userId);
                                                const contractor = b.employmentType === 'contractor';
                                                return (
                                                    <tr key={b.userId}>
                                                        <td><button className="row-link linkish" onClick={() => setDetail({ period: p, b })}><strong>{u?.full_name ?? `#${b.userId}`}</strong></button>
                                                            <div className="faint small">{contractor ? 'Contractor' : b.employmentType === 'casual' ? 'Casual' : b.jurisdiction ?? ''}{b.manualOverride ? ' · edited by hand' : ''}</div></td>
                                                        <td>{hours(b.totalHours)}</td>
                                                        <td>{money(b.grossAmount ?? b.totalEarned)}</td>
                                                        <td>{contractor ? <span className="faint">+{money(b.gstHstAmount)} tax</span> : b.deductionsAvailable ? money(b.totalTax) : <span className="caution">n/a</span>}</td>
                                                        <td><strong>{money(b.netAmount)}</strong></td>
                                                        <td>{money(b.totalPaid)}{b.paymentCount > 1 ? <span className="faint small"> ({b.paymentCount})</span> : null}</td>
                                                        <td className={n(b.periodBalance) < -0.009 ? 'danger' : ''}>{money(b.periodBalance)}</td>
                                                        <td className="actions">
                                                            <button className="btn btn-sm" disabled={busy === `${contractor ? 'invoice' : 'paystub'}-${p.id}-${b.userId}`} onClick={() => openPdf(contractor ? 'invoice' : 'paystub', b, p)}>
                                                                {contractor ? 'Invoice PDF' : 'Paystub'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )
                            )}
                        </div>
                    );
                })}
                {data.periods.length === 0 && <div className="card empty">No pay periods in {year}.</div>}
            </div>

            {detail && <DetailsCard period={detail.period} b={detail.b} name={names.get(detail.b.userId)?.full_name ?? ''} onClose={() => setDetail(null)} />}
        </>
    );
}

// The phone's payroll details card, read-only. Same rows, same rules: the
// gross line appears only when it differs from what auto-calculate would
// produce; taxes read "Not available yet" where the engine is unverified.
function DetailsCard({ period, b, name, onClose }: { period: PayPeriod; b: UserBalance; name: string; onClose: () => void }) {
    const contractor = b.employmentType === 'contractor';
    const casual = b.employmentType === 'casual';
    const earned = n(b.totalEarned);
    const autoExpected = earned + n(b.overtimePay) + n(b.vacationPay) + n(b.holidayPay) + n(b.holidayPremium);
    const manualGross = b.hasPayrollRun && Math.abs(n(b.grossAmount) - autoExpected) > 0.009;
    const Row = ({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) => (
        <div className="rrow"><div className="rlabel">{label}</div><div className={'rvalue' + (tone ? ` ${tone}` : '')}>{strong ? <strong>{value}</strong> : value}</div><span /></div>
    );
    return (
        <Dialog title={name} subtitle={periodLabel(period) + (b.jurisdiction ? ` · ${b.jurisdiction}` : '')} onClose={onClose} wide
            footer={<button className="btn" onClick={onClose}>Close</button>}>
            <div className="eyebrow nopad">This period</div>
            <Row label="Hours worked" value={hours(b.totalHours)} />
            <Row label="Rate" value={`${money(b.hourlyRate)}/h`} />
            <Row label="Earned" value={money(earned)} />
            {manualGross && <Row label="Gross (manual)" value={money(b.grossAmount)} tone="caution" />}
            {contractor ? (
                <>
                    <Row label={n(b.gstHstRate) > 0 ? `GST/HST (${(n(b.gstHstRate) * 100).toFixed(0)}%)` : 'GST/HST'} value={money(b.gstHstAmount)} />
                    <Row label="Total payable" value={money(b.netAmount)} strong />
                </>
            ) : (
                <>
                    {n(b.overtimePay) > 0.009 && <Row label="Overtime" value={money(b.overtimePay)} />}
                    {n(b.holidayPay) > 0.009 && <Row label="Holiday pay" value={money(b.holidayPay)} />}
                    {n(b.holidayPremium) > 0.009 && <Row label="Holiday premium (1.5×)" value={money(b.holidayPremium)} />}
                    {n(b.vacationPay) > 0.009 && <Row label={`Vacation (${((b.vacationRate ?? 0.04) * 100).toFixed(0)}%)`} value={money(b.vacationPay)} />}
                    {b.customDeductions?.map(cd => <Row key={cd.name} label={cd.name || 'Deduction'} value={'-' + money(cd.amount)} />)}
                    {!casual && !b.deductionsAvailable
                        ? <Row label="Taxes" value="Not available yet" tone="caution" />
                        : (!casual || n(b.totalTax) > 0.009) && <Row label={casual ? 'Deductions' : 'Taxes'} value={money(b.totalTax)} />}
                    {!casual && b.deductionsAvailable && n(b.totalTax) > 0.009 && (
                        <div className="faint small pad-left">CPP {money(n(b.cppAmount))} · EI {money(b.eiAmount)} · Federal {money(b.federalTax)} · Provincial {money(b.stateTax)}{n(b.otherDeductions) > 0 ? ` · Other ${money(b.otherDeductions)}` : ''}</div>
                    )}
                    <Row label="Net" value={money(b.netAmount)} strong />
                </>
            )}
            <div className="eyebrow nopad">Payments</div>
            {b.paymentAmounts?.length > 1
                ? <>{b.paymentAmounts.map((a, i) => <Row key={i} label={`Payment ${i + 1}`} value={money(a)} />)}<Row label="Total paid" value={money(b.totalPaid)} /></>
                : <Row label="Paid" value={money(b.totalPaid)} />}
            <Row label="Period balance" value={money(b.periodBalance)} tone={n(b.periodBalance) < -0.009 ? 'danger' : undefined} strong />
            {b.modifiedAfterPayment && <p className="caution small">Changed after payment: was {money(b.netAtPayment)} net when paid, now {money(b.netAmount)}. {b.paymentChangeDetail ?? ''}</p>}
            {b.holidays?.length > 0 && <p className="muted small">Holidays in this period: {b.holidays.map(h => `${h.name} (${h.date})${h.eligible === false && h.reason ? ` — ${h.reason}` : ''}`).join('; ')}</p>}
            {b.notes && <p className="muted small">Note: {b.notes}</p>}
            <p className="faint small">Editing this period from the web comes in the next phase; use the app's Edit Payroll until then.</p>
        </Dialog>
    );
}
