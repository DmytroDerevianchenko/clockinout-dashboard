// CRA remittance — what the employer sends to the Canada Revenue Agency.
//
// Every pay, tax, CPP and EI are held back from the employee; the employer
// then owes the CRA those amounts PLUS its own share (CPP again, EI × 1.4).
// The CRA does not think in pay periods: a regular remitter pays once a
// month for everything PAID in that month, by the 15th of the next. So this
// page is organised by month (or quarter), and each month opens to show the
// three figures the CRA's form asks for, the breakdown, and the pays behind it.
//
// Nothing is calculated here — GET /remittances adds up the stored payroll
// runs (the server's utils/remittance.js holds the rules). Employers and
// admins only.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { payroll, money, payDateLabel, remitTitle, daysBetween, type RemittancesReply, type RemitPeriod, type RemitAmounts } from '../api/payroll';
import { useAuth } from '../auth';
import { SkeletonList } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { tx, txn } from '../i18n';

export default function Remittances() {
    const { session, org, canManage } = useAuth();
    const [year, setYear] = useState<number | undefined>(undefined);      // undefined = let the server pick the current one
    const [data, setData] = useState<RemittancesReply | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const toast = useToast();

    useEffect(() => {
        if (!session || !org || !canManage) return;
        let cancelled = false;
        setError(null);
        payroll.remittances(org.organization_id, year).then(r => {
            if (cancelled) return;
            setData(r);
            setOpen(o => o && r.periods.some(p => p.key === o) ? o : (nextDue(r)?.key ?? r.periods[r.periods.length - 1]?.key ?? null));
        }).catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : tx("Could not load the remittances")); });
        return () => { cancelled = true; };
    }, [session, org, canManage, year, tick]);

    const next = useMemo(() => (data ? nextDue(data) : null), [data]);

    if (!canManage) return <div className="card">{tx("Only the employer and admins see the CRA remittance.")} <Link to="/payroll">{tx("Back to Payroll")}</Link></div>;
    if (error) return <div className="card danger">{error}</div>;
    if (!data || !org) return <SkeletonList n={4} />;

    const copy = async (value: string) => {
        try { await navigator.clipboard.writeText(value); toast(tx('Copied {0}', value)); }
        catch { toast(tx("Could not copy — select the number instead"), 'error'); }
    };
    async function changeType(remitterType: 'monthly' | 'quarterly') {
        if (!org) return;
        try { await payroll.setRemitterType(org.organization_id, remitterType); setTick(t => t + 1); }
        catch (e) { toast(e instanceof ApiError ? e.message : tx("Could not save"), 'error'); }
    }
    const periods = [...data.periods].reverse();          // newest first, like Payroll

    return (
        <>
            <p><Link to="/payroll">{tx("‹ Payroll")}</Link></p>
            <div className="toolbar">
                <label className="field inline"><span>{tx("Year")}</span>
                    <select value={data.year} onChange={e => setYear(Number(e.target.value))}>
                        {data.availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
                <label className="field inline"><span>{tx("You remit")}</span>
                    <select value={data.remitterType} onChange={e => changeType(e.target.value as 'monthly' | 'quarterly')}>
                        <option value="monthly">{tx("Every month (regular)")}</option>
                        <option value="quarterly">{tx("Every quarter")}</option>
                    </select>
                </label>
            </div>

            {next && (
                <div className="cards">
                    <div className="card">
                        <div className="stat-label">{tx('Next to pay — {0}', remitTitle(next))}</div>
                        <div className="stat">{money(next.total)}</div>
                        <div className="faint small">{tx('Due {0}', payDateLabel(next.dueDate))} · {dueIn(next, data.today)}</div>
                    </div>
                    <div className="card">
                        <div className="stat-label">{tx('{0} so far', data.year)}</div>
                        <div className="stat stat-sm">{money(data.yearTotals.total)}</div>
                        <div className="faint small">{tx('Held back from pay {0} · your share {1}', money(data.yearTotals.employeeTotal), money(data.yearTotals.employerTotal))}</div>
                    </div>
                </div>
            )}

            {data.notRunYet.length > 0 && (
                <div className="card caution-card">
                    <strong>{tx("Payroll has not been run for some pays yet")}</strong>
                    {data.notRunYet.map(n => <p key={n.payPeriodId} className="muted small">{rangeLabel(n.startDate, n.endDate)} · {tx('Pay date {0}', payDateLabel(n.payDate))} · {txn(n.people, '{n} person with hours', '{n} people with hours')}</p>)}
                </div>
            )}

            <div className="periods">
                {periods.map(p => {
                    const isOpen = open === p.key;
                    return (
                        <div key={p.key} className={'card card-flush period' + (isOpen ? ' open' : '')}>
                            <button className="period-head" onClick={() => setOpen(isOpen ? null : p.key)}>
                                <div>
                                    <strong>{remitTitle(p)}</strong>
                                    <div className="faint small">{tx('Due {0}', payDateLabel(p.dueDate))} · {txn(p.payPeriods.length, '{n} pay', '{n} pays')}</div>
                                </div>
                                <div className="period-right">
                                    <div className="period-sums"><span><em>{tx("Remit")}</em>{money(p.total)}</span></div>
                                    {p.isOpen ? <span className="pill">{tx("Still filling")}</span>
                                        : p.dueDate >= data.today ? <span className="pill caution">{dueIn(p, data.today)}</span>
                                        : null}
                                    <span className="period-chev" aria-hidden="true">›</span>
                                </div>
                            </button>
                            {isOpen && <PeriodBody p={p} copy={copy} />}
                        </div>
                    );
                })}
                {periods.length === 0 && <div className="card empty">{tx('Nothing to remit in {0}: no payroll with deductions has been calculated.', data.year)}</div>}
            </div>

            {periods.length > 0 && (
                <div className="card">
                    <div className="eyebrow nopad">{tx('{0} in total', data.year)}</div>
                    <Breakdown a={data.yearTotals} />
                    <p className="muted small">{tx("At the end of the year these totals are what your T4 Summary reports.")}</p>
                </div>
            )}

            <p className="muted small remit-note">
                {tx("Counted: income tax, CPP and EI from the payroll you have calculated, in the month each pay period is paid. Your share is CPP matched one for one and EI × {0}.", data.eiEmployerFactor)}{' '}
                {tx("Not counted: contractors, casual workers paid without deductions, WSIB and Employer Health Tax.")}{' '}
                {tx("The CRA must receive the payment by the due date. Check the amount against your own records before you pay.")}
            </p>
        </>
    );
}

/** The remittance to pay next: the earliest closed period whose due date has not passed. */
function nextDue(r: RemittancesReply): RemitPeriod | null {
    return r.periods.find(p => !p.isOpen && p.dueDate >= r.today) ?? r.periods.find(p => p.isOpen) ?? null;
}

function dueIn(p: RemitPeriod, today: string): string {
    const d = daysBetween(today, p.dueDate);
    return d === 0 ? tx("Due today") : d > 0 ? txn(d, 'in {n} day', 'in {n} days') : tx("Due date has passed");
}

const rangeLabel = (from: string, to: string) => `${payDateLabel(from)} – ${payDateLabel(to)}`;

export function PeriodBody({ p, copy }: { p: RemitPeriod; copy: (v: string) => void }) {
    const fixed = (v: number) => v.toFixed(2);
    return (
        <div className="remit-body">
            {p.isOpen && <p className="muted small">{tx("This period is not over: pays still to come will be added.")}</p>}
            {p.notRunYet.length > 0 && (
                <p className="caution small">
                    {tx("Not final — payroll has not been run yet for:")}{' '}
                    {p.notRunYet.map(n => `${rangeLabel(n.startDate, n.endDate)} (${txn(n.people, '{n} person with hours', '{n} people with hours')})`).join('; ')}
                </p>
            )}
            <div className="remit-grid">
                <div>
                    <div className="eyebrow nopad">{tx("What the CRA form asks for")}</div>
                    <div className="remit-ask"><span>{tx("Amount paid")}</span><strong>{money(p.total)}</strong><button className="btn btn-sm" onClick={() => copy(fixed(p.total))}>{tx("Copy")}</button></div>
                    <div className="remit-ask"><span>{tx("Gross payroll")}</span><strong>{money(p.grossPayroll)}</strong><button className="btn btn-sm" onClick={() => copy(fixed(p.grossPayroll))}>{tx("Copy")}</button></div>
                    <div className="remit-ask"><span>{tx("Number of employees in the last pay period")}</span><strong>{p.employeesInLastPay}</strong><span /></div>
                    <p className="faint small">{p.quarter ? tx("Gross payroll is for the last month of the quarter only — the CRA's rule.") : tx("Gross payroll is everything paid in the month before any deductions.")} {tx('Employees: the people paid on {0}.', payDateLabel(p.lastPayDate))}</p>
                </div>
                <div>
                    <div className="eyebrow nopad">{tx("How it adds up")}</div>
                    <Breakdown a={p} />
                </div>
            </div>
            <div className="eyebrow">{tx("Pays in this period")}</div>
            <table className="table">
                <thead><tr><th>{tx("Pay period")}</th><th>{tx("Pay date")}</th><th>{tx("Gross")}</th><th>{tx("Held back from pay")}</th><th>{tx("Your share")}</th><th>{tx("To the CRA")}</th></tr></thead>
                <tbody>
                    {p.payPeriods.map(pay => [
                        <tr key={pay.payPeriodId} className="remit-pay">
                            <td><strong>{rangeLabel(pay.startDate, pay.endDate)}</strong></td>
                            <td>{payDateLabel(pay.payDate)}</td>
                            <td>{money(pay.gross)}</td><td>{money(pay.employeeTotal)}</td><td>{money(pay.employerTotal)}</td><td><strong>{money(pay.total)}</strong></td>
                        </tr>,
                        ...pay.people.map(x => (
                            <tr key={`${pay.payPeriodId}-${x.userId}`} className="remit-person">
                                <td colSpan={2}><Link className="row-link" to={`/team/${x.userId}`}>{x.fullName || `#${x.userId}`}</Link>
                                    <div className="faint small">{tx('Tax {0} · CPP {1} + {2} · EI {3} + {4}', money(x.tax), money(x.cppEmployee + x.cpp2Employee), money(x.cppEmployer + x.cpp2Employer), money(x.eiEmployee), money(x.eiEmployer))}</div></td>
                                <td>{money(x.gross)}</td><td>{money(x.employeeTotal)}</td><td>{money(x.employerTotal)}</td><td>{money(x.total)}</td>
                            </tr>
                        )),
                    ])}
                </tbody>
            </table>
        </div>
    );
}

/** Employee · employer · to the CRA, line by line — the layout of the CRA's own calculator summary. */
export function Breakdown({ a }: { a: RemitAmounts }) {
    const row = (label: string, employee: number, employer: number | null) => (
        <tr><td>{label}</td><td>{money(employee)}</td><td>{employer === null ? <span className="faint">—</span> : money(employer)}</td><td>{money(employee + (employer ?? 0))}</td></tr>
    );
    return (
        <table className="table remit-table">
            <thead><tr><th /><th>{tx("Employee")}</th><th>{tx("Employer")}</th><th>{tx("To the CRA")}</th></tr></thead>
            <tbody>
                {row(tx("Income tax"), a.tax, null)}
                {row(tx("CPP"), a.cppEmployee, a.cppEmployer)}
                {a.cpp2Employee + a.cpp2Employer > 0.004 && row(tx("CPP2"), a.cpp2Employee, a.cpp2Employer)}
                {row(tx("EI"), a.eiEmployee, a.eiEmployer)}
                <tr className="remit-total"><td><strong>{tx("Remit")}</strong></td><td>{money(a.employeeTotal)}</td><td>{money(a.employerTotal)}</td><td><strong>{money(a.total)}</strong></td></tr>
            </tbody>
        </table>
    );
}
