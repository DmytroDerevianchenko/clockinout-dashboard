// Payroll, read-first: the year's pay periods with their totals, each period
// expandable to its people, each person opening the same details card the
// phone shows — hours, earnings, add-ons, deductions, net, payments and the
// balance — plus paystub / contractor invoice PDFs and the CSV export.
// Editing (Edit Payroll, record a payment, configuration) is the next slice.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { payroll, type PayPeriod, type UserBalance, money, hours, periodLabel, n } from '../api/payroll';
import { team, type RosterUser } from '../api/team';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import RowMenu from '../components/Menu';
import { PayrollStatsDialog } from '../components/StatsDialog';
import { useToast } from '../components/Toast';
import { SkeletonList } from '../components/Skeleton';
import Dialog, { SaveFooter } from '../components/Dialog';
import { EditPayrollDialog, RecordPaymentDialog } from './PayrollEdit';
import PayrollConfigDialog from './PayrollConfig';
import { tx, txn, perHour } from '../i18n';

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
    const [config, setConfig] = useState(false);
    const [editing, setEditing] = useState<{ period: PayPeriod; b: UserBalance; kind: 'edit' | 'pay' } | null>(null);
    const [stats, setStats] = useState(false);
    const [rateFor, setRateFor] = useState<{ period: PayPeriod; b: UserBalance } | null>(null);
    const navigate = useNavigate();
    const toast = useToast();
    const [tick, setTick] = useState(0);                          // bump to reload after a save
    const reload = useCallback(() => setTick(t => t + 1), []);

    useEffect(() => {
        if (!session || !org) return;
        let cancelled = false;
        if (tick === 0) setData(null);
        setError(null);
        Promise.all([
            payroll.periods(session.userId, org.organization_id, year),
            team.roster(session.userId, org.organization_id),
        ]).then(([p, r]) => {
            if (cancelled) return;
            setNames(new Map(r.users.map(u => [u.id, u])));
            // Newest first; the open period (today inside it) expanded by default.
            const periods = [...p.payPeriods].sort((a, b) => b.start_date.localeCompare(a.start_date));
            setData({ periods, years: p.availableYears?.length ? p.availableYears : [thisYear], earned: p.earnedYearly, paid: p.paidYearly });
            if (tick === 0) {
                const now = Date.now();
                const current = periods.find(x => Date.parse(x.start_date) <= now && now <= Date.parse(x.end_date));
                setOpen(current?.id ?? periods[0]?.id ?? null);
            }
            // Keep an open details card in step with the fresh row.
            setDetail(d => {
                if (!d) return d;
                const np = periods.find(x => x.id === d.period.id);
                const nb = np?.userBalances?.find(x => x.userId === d.b.userId);
                return np && nb ? { period: np, b: nb } : d;
            });
        }).catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : tx("Could not load payroll")); });
        return () => { cancelled = true; };
    }, [session, org, year, thisYear, tick]);

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
        } catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not build the file")); }
        finally { setBusy(null); }
    }

    if (error) return <div className="card danger">{error}</div>;
    if (!data) return <SkeletonList n={5} />;

    return (
        <>
            <div className="toolbar">
                <label className="field inline"><span>{tx("Year")}</span>
                    <select value={year} onChange={e => setYear(Number(e.target.value))}>
                        {data.years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                <div className="muted small">{tx("Earned this year")} {money(data.earned)} {tx("· paid")} {money(data.paid)}</div>
                <span className="spacer" />
                <button className="btn" onClick={() => setStats(true)}>{tx("Statistics")}</button>
                <button className="btn" onClick={() => setConfig(true)}>{tx("Configuration")}</button>
                <button className="btn" disabled={busy === `csv-year-`} onClick={() => openPdf('csv')}>{tx("Export year CSV")}</button>
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
                                    <div className="faint small">{txn(t.people, '{n} person', '{n} people')} · {hours(t.hours)}{p.status !== 'open' ? ` · ${p.status}` : ''}</div>
                                </div>
                                <div className="period-right">
                                    <div className="period-sums">
                                        <span><em>{tx("Gross")}</em>{money(t.gross)}</span>
                                        <span><em>{tx("Net")}</em>{money(t.net)}</span>
                                        <span><em>{tx("Paid")}</em>{money(t.paid)}</span>
                                    </div>
                                    {/* The settlement line: how much of the net has gone out, and what is left. */}
                                    <div className="settle">
                                        {t.net <= 0.009 && Math.abs(outstanding) <= 0.009 ? <span className="pill">{tx("No pay yet")}</span>
                                            : Math.abs(outstanding) <= 0.009 ? <span className="pill live">{tx("Settled")}</span>
                                            : outstanding > 0 ? <span className="pill danger">{tx("Owed")} {money(outstanding)}</span>
                                            : <span className="pill caution">{tx("Overpaid")} {money(-outstanding)}</span>}
                                        <div className="bar"><div className={Math.abs(outstanding) <= 0.009 && t.net > 0.009 ? 'done' : ''} style={{ width: `${t.net > 0.009 ? Math.min(100, Math.max(0, (t.paid / t.net) * 100)) : 0}%` }} /></div>
                                    </div>
                                    <span className="period-chev" aria-hidden="true">›</span>
                                </div>
                            </button>
                            {isOpen && (
                                rows.length === 0 ? <div className="empty">{tx("No hours in this period.")}</div> : (
                                    <table className="table table-hover">
                                        <thead><tr><th>{tx("Name")}</th><th>{tx("Hours")}</th><th>{tx("Gross")}</th><th>{tx("Deductions")}</th><th>{tx("Net")}</th><th>{tx("Paid")}</th><th>{tx("Balance")}</th><th></th></tr></thead>
                                        <tbody>
                                            {rows.map(b => {
                                                const u = names.get(b.userId);
                                                const contractor = b.employmentType === 'contractor';
                                                return (
                                                    <tr key={b.userId}>
                                                        <td><button className="row-link linkish" onClick={() => setDetail({ period: p, b })}><strong>{u?.full_name ?? `#${b.userId}`}</strong></button>
                                                            <div className="faint small">{contractor ? tx("Contractor") : b.employmentType === 'casual' ? tx("Casual") : b.jurisdiction ?? ''}{b.manualOverride ? tx(" · edited by hand") : ''}</div></td>
                                                        <td>{hours(b.totalHours)}</td>
                                                        <td>{money(b.grossAmount ?? b.totalEarned)}</td>
                                                        <td>{contractor ? <span className="faint">+{money(b.gstHstAmount)} {tx("tax")}</span> : b.deductionsAvailable ? money(b.totalTax) : <span className="caution">n/a</span>}</td>
                                                        <td><strong>{money(b.netAmount)}</strong></td>
                                                        <td>{money(b.totalPaid)}{b.paymentCount > 1 ? <span className="faint small"> ({b.paymentCount})</span> : null}</td>
                                                        <td className={n(b.periodBalance) < -0.009 ? 'danger' : ''}>{money(b.periodBalance)}</td>
                                                        <td className="actions">
                                                            <button className="btn btn-sm" disabled={busy === `${contractor ? 'invoice' : 'paystub'}-${p.id}-${b.userId}`} onClick={() => openPdf(contractor ? 'invoice' : 'paystub', b, p)}>
                                                                {contractor ? tx("Invoice PDF") : tx("Paystub")}
                                                            </button>
                                                            {/* The phone's long-press menu on a payroll row. */}
                                                            <RowMenu items={[
                                                                { label: tx("View details"), onClick: () => setDetail({ period: p, b }) },
                                                                { label: tx("Edit payroll"), onClick: () => setEditing({ period: p, b, kind: 'edit' }) },
                                                                { label: tx("Record payment"), onClick: () => setEditing({ period: p, b, kind: 'pay' }) },
                                                                { label: tx("See hours"), onClick: () => navigate(`/hours?person=${b.userId}&period=${p.id}`) },
                                                                { label: tx("See payments"), onClick: () => navigate(`/payments?person=${b.userId}`) },
                                                                { label: tx("Correct the rate for this period"), onClick: () => setRateFor({ period: p, b }) },
                                                            ]} />
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
                {data.periods.length === 0 && <div className="card empty">{tx("No pay periods in")} {year}.</div>}
            </div>

            {detail && <DetailsCard period={detail.period} b={detail.b} name={names.get(detail.b.userId)?.full_name ?? ''} onClose={() => setDetail(null)}
                onEdit={() => setEditing({ period: detail.period, b: detail.b, kind: 'edit' })}
                onPay={() => setEditing({ period: detail.period, b: detail.b, kind: 'pay' })} />}
            {config && <PayrollConfigDialog onClose={() => setConfig(false)} onDone={() => { setConfig(false); reload(); }} />}
            {stats && <PayrollStatsDialog onClose={() => setStats(false)} />}
            {rateFor && <PeriodRateDialog period={rateFor.period} b={rateFor.b} name={names.get(rateFor.b.userId)?.full_name ?? ''} onClose={() => setRateFor(null)}
                onDone={() => { setRateFor(null); toast(tx("Rate corrected for this period")); reload(); }} />}
            {editing?.kind === 'edit' && <EditPayrollDialog period={editing.period} b={editing.b} name={names.get(editing.b.userId)?.full_name ?? ''} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
            {editing?.kind === 'pay' && <RecordPaymentDialog period={editing.period} b={editing.b} name={names.get(editing.b.userId)?.full_name ?? ''} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
        </>
    );
}

// The phone's payroll details card, read-only. Same rows, same rules: the
// gross line appears only when it differs from what auto-calculate would
// produce; taxes read "Not available yet" where the engine is unverified.
function DetailsCard({ period, b, name, onClose, onEdit, onPay }: { period: PayPeriod; b: UserBalance; name: string; onClose: () => void; onEdit: () => void; onPay: () => void }) {
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
            footer={<><button className="btn" onClick={onClose}>{tx("Close")}</button><button className="btn" onClick={onPay}>{tx("Record payment")}</button><button className="btn btn-primary" onClick={onEdit}>{tx("Edit payroll")}</button></>}>
            <div className="eyebrow nopad">{tx("This period")}</div>
            <Row label={tx("Hours worked")} value={hours(b.totalHours)} />
            <Row label={tx("Rate")} value={perHour(money(b.hourlyRate))} />
            <Row label={tx("Earned")} value={money(earned)} />
            {manualGross && <Row label={tx("Gross (manual)")} value={money(b.grossAmount)} tone="caution" />}
            {contractor ? (
                <>
                    <Row label={n(b.gstHstRate) > 0 ? tx("GST/HST ({0}%)", (n(b.gstHstRate) * 100).toFixed(0)) : tx("GST/HST")} value={money(b.gstHstAmount)} />
                    <Row label={tx("Total payable")} value={money(b.netAmount)} strong />
                </>
            ) : (
                <>
                    {n(b.overtimePay) > 0.009 && <Row label={tx("Overtime")} value={money(b.overtimePay)} />}
                    {n(b.holidayPay) > 0.009 && <Row label={tx("Holiday pay")} value={money(b.holidayPay)} />}
                    {n(b.holidayPremium) > 0.009 && <Row label={tx("Holiday premium (1.5×)")} value={money(b.holidayPremium)} />}
                    {n(b.vacationPay) > 0.009 && <Row label={tx("Vacation ({0}%)", ((b.vacationRate ?? 0.04) * 100).toFixed(0))} value={money(b.vacationPay)} />}
                    {b.customDeductions?.map(cd => <Row key={cd.name} label={cd.name || tx("Deduction")} value={'-' + money(cd.amount)} />)}
                    {!casual && !b.deductionsAvailable
                        ? <Row label={tx("Taxes")} value={tx("Not available yet")} tone="caution" />
                        : (!casual || n(b.totalTax) > 0.009) && <Row label={casual ? tx("Deductions") : tx("Taxes")} value={money(b.totalTax)} />}
                    {!casual && b.deductionsAvailable && n(b.totalTax) > 0.009 && (
                        <div className="faint small pad-left">{tx("CPP")} {money(n(b.cppAmount))} {tx("· EI")} {money(b.eiAmount)} {tx("· Federal")} {money(b.federalTax)} {tx("· Provincial")} {money(b.stateTax)}{n(b.otherDeductions) > 0 ? tx(" · Other {0}", money(b.otherDeductions)) : ''}</div>
                    )}
                    <Row label={tx("Net")} value={money(b.netAmount)} strong />
                </>
            )}
            <div className="eyebrow nopad">{tx("Payments")}</div>
            {b.paymentAmounts?.length > 1
                ? <>{b.paymentAmounts.map((a, i) => <Row key={i} label={tx("Payment {0}", i + 1)} value={money(a)} />)}<Row label={tx("Total paid")} value={money(b.totalPaid)} /></>
                : <Row label={tx("Paid")} value={money(b.totalPaid)} />}
            <Row label={tx("Period balance")} value={money(b.periodBalance)} tone={n(b.periodBalance) < -0.009 ? 'danger' : undefined} strong />
            {b.modifiedAfterPayment && <p className="caution small">{tx("Changed after payment: was")} {money(b.netAtPayment)} {tx("net when paid, now")} {money(b.netAmount)}. {b.paymentChangeDetail ?? ''}</p>}
            {b.holidays?.length > 0 && <p className="muted small">{tx("Holidays in this period:")} {b.holidays.map(h => `${h.name} (${h.date})${h.eligible === false && h.reason ? ` — ${h.reason}` : ''}`).join('; ')}</p>}
            {b.notes && <p className="muted small">{tx("Note:")} {b.notes}</p>}
        </Dialog>
    );
}

// One person's rate for ONE period: their clock-ins in it are re-priced and
// the period recalculates. Their current rate (Team) is not touched — this is
// for "the raise started the week after", not for a raise.
function PeriodRateDialog({ period, b, name, onClose, onDone }: { period: PayPeriod; b: UserBalance; name: string; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [rate, setRate] = useState(n(b.hourlyRate).toFixed(2));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const value = Number(rate.replace(',', '.'));
    async function save() {
        if (!session || !org || !(value > 0)) return;
        setSaving(true); setError(null);
        try { await payroll.updatePeriodRate(session.userId, org.organization_id, b.userId, period.id, value); onDone(); }
        catch (e) { setError(e instanceof ApiError ? e.message : tx("Could not save")); setSaving(false); }
    }
    return (
        <Dialog title={tx("Rate for {0}", periodLabel(period))} subtitle={tx("{0}. Only this period's hours are re-priced; their current rate stays as it is.", name)} onClose={onClose}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!(value > 0)} />}>
            <label className="field"><span>{tx("Hourly rate ($)")}</span><input inputMode="decimal" value={rate} autoFocus onFocus={e => e.currentTarget.select()} onChange={e => setRate(e.target.value.replace(/[^0-9.,]/g, ''))} /></label>
            {b.hasPayrollRun && <p className="caution small">{tx("This period already has a calculated run. If it was edited by hand, open Edit payroll afterwards to recalculate.")}</p>}
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
