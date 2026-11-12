// DEV ONLY (never routed in a production build): every piece of the design
// kit on one page, with made-up data, so the look can be checked — Light,
// Dark and Book — without signing in. Open http://localhost:5173/styleguide.
// If a class is restyled in index.css, this page is where to look first.
import { useState } from 'react';
import { NAV, NAV_ICONS, initialsOf } from '../layout/Shell';
import Dialog, { SaveFooter } from '../components/Dialog';
import ThemeSwitch from '../components/ThemeSwitch';
import RowMenu from '../components/Menu';
import { useToast } from '../components/Toast';
import { SkeletonCards, SkeletonList, SkeletonRecord, SkeletonTable } from '../components/Skeleton';

const CREW = [
    { name: 'Alex Rivera', type: 'Full-time', rate: '$32.00/h', week: 38.5, cap: 44, bal: '$1,240.00', owe: true, live: true, job: 'Maple Ridge – Lot 12' },
    { name: 'Noor Haddad', type: 'Full-time', rate: '$29.00/h', week: 41.2, cap: 44, bal: 'settled', owe: false, live: true, job: 'Closson' },
    { name: 'Priya Nair', type: 'Contractor', rate: '$34.00/h', week: 45.0, cap: 44, bal: '−$200.00', owe: false, live: false, job: '' },
    { name: 'Liam Chen', type: 'Casual', rate: '$30.00/h', week: 12.0, cap: 44, bal: '$310.50', owe: true, live: false, job: '' },
];
const PERIODS = [
    { label: 'Nov 2 – Nov 15, 2026', gross: 4120.0, net: 3310.4, paid: 0 },
    { label: 'Oct 19 – Nov 1, 2026', gross: 9812.4, net: 7604.11, paid: 6000 },
    { label: 'Oct 5 – Oct 18, 2026', gross: 9104.0, net: 7011.8, paid: 7011.8 },
];
const usd = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Styleguide() {
    const toast = useToast();
    const [dialog, setDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState('/');
    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="brand"><img className="brand-mark" src="/favicon.svg" alt="" /><div className="brand-name">ClockInOut</div></div>
                {NAV.map(n => (
                    <a key={n.to} href="#" onClick={e => { e.preventDefault(); setActive(n.to); }} className={'nav-link' + (active === n.to ? ' active' : '')}>{NAV_ICONS[n.icon]}{n.label}</a>
                ))}
                <ThemeSwitch />
                <div className="sidebar-foot">
                    <div className="avatar">{initialsOf('Demo Owner')}</div>
                    <div className="sidebar-who"><strong>Demo Owner</strong><button className="signout">Sign out</button></div>
                </div>
            </aside>
            <main className="main">
                <div className="topbar">
                    <h1>Demo Crew Ontario</h1>
                    <label className="org-switch"><select defaultValue="1"><option value="1">Demo Crew Ontario</option><option value="2">Demo Crew West</option></select></label>
                </div>

                {/* ── Home ── */}
                <section className="hero live">
                    <div>
                        <div className="hero-eyebrow">Monday, November 9</div>
                        <div className="hero-figure"><span className="dot live" /><span className="hero-num">2</span><span className="hero-unit">on the clock</span></div>
                        <div className="muted">of 14 active team members · 3 contractors</div>
                    </div>
                    <div className="head-actions"><a className="btn" href="#">Hours</a><a className="btn btn-primary" href="#">Team</a></div>
                </section>
                <div className="cards">
                    <a className="card stat-link" href="#"><div className="stat-label">Owed to crew</div><div className="stat danger">$18,420.50</div><div className="faint small">6 people · all periods</div></a>
                    <a className="card stat-link" href="#"><div className="stat-label">Clients owe you</div><div className="stat">$42,197.06</div><div className="small danger">4 sent invoices · 1 overdue</div></a>
                    <a className="card stat-link" href="#"><div className="stat-label">Near or in overtime</div><div className="stat caution">2</div><div className="faint small">0 over 44 h this week</div></a>
                </div>

                <div className="toolbar">
                    <input className="search" placeholder="Search by name or email" />
                    <label className="field inline"><span>Period</span><select><option>Oct 19 – Nov 1</option><option>Nov 2 – Nov 15</option></select></label>
                    <label className="check"><input type="checkbox" defaultChecked /> Show terminated</label>
                    <span className="spacer" />
                    <button className="btn" onClick={() => toast('Added 5 shifts to Alex Rivera')}>Toast</button>
                    <button className="btn" onClick={() => toast('This shift overlaps an existing shift on the same job.', 'error')}>Error toast</button>
                    <button className="btn" onClick={() => setLoading(v => !v)}>{loading ? 'Show content' : 'Show skeletons'}</button>
                    <button className="btn btn-primary" onClick={() => setDialog(true)}>Add member</button>
                </div>

                {loading ? <><SkeletonCards /><SkeletonTable rows={4} cols={6} /><div style={{ height: 16 }} /><SkeletonList n={2} /><div style={{ height: 16 }} /><SkeletonRecord groups={1} rows={3} /></> : (
                    <>
                        {/* ── Team ── */}
                        <div className="card card-flush">
                            <table className="table table-hover">
                                <thead><tr><th>Name</th><th>Type</th><th>Rate</th><th>This week</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {CREW.map(u => {
                                        const over = u.week >= u.cap, near = !over && u.week >= u.cap * 0.9;
                                        return (
                                            <tr key={u.name}>
                                                <td><a className="row-link" href="#"><span className={'dot' + (u.live ? ' live' : '')} /><strong>{u.name}</strong>{u.name === 'Alex Rivera' && <span className="pill">Admin</span>}</a>
                                                    <div className="faint small">{u.live ? `On the clock · ${u.job} since 7:02 AM` : 'name@example.com'}</div></td>
                                                <td>{u.type}</td>
                                                <td>{u.rate}</td>
                                                <td><div className={'week' + (over ? ' over' : near ? ' near' : '')}><span>{u.week.toFixed(1)} / {u.cap} h</span><div className="bar"><div style={{ width: `${Math.min(100, (u.week / u.cap) * 100)}%` }} /></div></div></td>
                                                <td>{u.bal === 'settled' ? <span className="faint">settled</span> : <span className={u.owe ? 'danger' : 'caution'}>{u.bal}</span>}</td>
                                                <td><span className={'pill' + (u.name === 'Liam Chen' ? ' caution' : u.name === 'Priya Nair' ? ' danger' : '')}>{u.name === 'Liam Chen' ? 'Inactive' : u.name === 'Priya Nair' ? 'Terminated' : 'Active'}</span></td>
                                                <td className="actions"><button className="btn btn-sm">{u.live ? 'End shift' : 'Clock in'}</button><RowMenu items={[{ label: 'View or edit details', onClick: () => toast('View') }, { label: 'Grant admin access', onClick: () => toast('Admin') }, { label: 'Terminate', onClick: () => toast('Terminate') }, { label: 'Delete employee', danger: true, onClick: () => toast('Delete', 'error') }]} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Payroll ── */}
                        <div className="periods" style={{ marginTop: 18 }}>
                            {PERIODS.map((p, i) => {
                                const out = p.net - p.paid;
                                return (
                                    <div key={p.label} className={'card card-flush period' + (i === 1 ? ' open' : '')}>
                                        <button className="period-head">
                                            <div><strong>{p.label}</strong><div className="faint small">4 people · 312.50 h</div></div>
                                            <div className="period-right">
                                                <div className="period-sums"><span><em>Gross</em>{usd(p.gross)}</span><span><em>Net</em>{usd(p.net)}</span><span><em>Paid</em>{usd(p.paid)}</span></div>
                                                <div className="settle">
                                                    {Math.abs(out) <= 0.009 ? <span className="pill live">Settled</span> : <span className="pill danger">Owed {usd(out)}</span>}
                                                    <div className="bar"><div className={Math.abs(out) <= 0.009 ? 'done' : ''} style={{ width: `${Math.min(100, (p.paid / p.net) * 100)}%` }} /></div>
                                                </div>
                                                <span className="period-chev" aria-hidden="true">›</span>
                                            </div>
                                        </button>
                                        {i === 1 && <div className="pad-left" style={{ paddingTop: 10 }}><span className="muted">Rows open here.</span> <button className="pill-btn">Ontario says 44 h — tap to apply</button></div>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── Person ── */}
                        <div className="person-head" style={{ marginTop: 24 }}>
                            <div className="person-id">
                                <div className="avatar avatar-lg live">{initialsOf('Alex Rivera')}</div>
                                <div><h2>Alex Rivera<span className="pill">Admin</span></h2><div className="muted">Full-time · Active · On the clock at Maple Ridge – Lot 12</div></div>
                            </div>
                            <div className="head-actions"><button className="btn">End shift</button></div>
                        </div>
                        <div className="cards person-stats">
                            <div className="card"><div className="stat-label">This week</div><div className="stat stat-sm">41.2 h</div><div className="week near"><div className="bar"><div style={{ width: '93%' }} /></div><span>Close to overtime</span></div></div>
                            <div className="card"><div className="stat-label">Rate</div><div className="stat stat-sm">$32.00/h</div><div className="faint small">Full-time</div></div>
                            <button type="button" className="card stat-link"><div className="stat-label">Balance</div><div className="stat stat-sm danger">$1,240.00</div><div className="faint small">You owe them</div></button>
                        </div>
                        <div className="groups">
                            <div className="card card-flush">
                                <div className="eyebrow">Employment</div>
                                <div className="rrow clickable"><span className="rlabel">Employment type</span><span className="rvalue">Full-time</span><span className="rchev">›</span></div>
                                <div className="rrow clickable"><span className="rlabel">Current rate</span><span className="rvalue">$32.00/h</span><span className="rchev">›</span></div>
                                <div className="rrow"><span className="rlabel">Email</span><span className="rvalue">alex@example.com</span><span className="rlock">🔒</span></div>
                            </div>
                            <div className="card card-flush"><div className="eyebrow">On the clock</div><div className="empty">Nobody is clocked in right now.</div></div>
                        </div>
                    </>
                )}

                {dialog && (
                    <Dialog title="Add a team member" subtitle="They appear on the roster right away; the invite lets them sign in to the app." wide onClose={() => setDialog(false)}
                        footer={<SaveFooter onCancel={() => setDialog(false)} onSave={() => { setDialog(false); toast('Saved'); }} label="Add" />}>
                        <div className="grid-2">
                            <label className="field"><span>Full name</span><input defaultValue="Jordan Lee" /></label>
                            <label className="field"><span>Email</span><input type="email" placeholder="name@example.com" /></label>
                            <label className="field"><span>Employment type</span><select><option>Full-time</option><option>Contractor</option></select></label>
                            <label className="field"><span>Start date</span><input type="date" defaultValue="2026-11-09" /></label>
                        </div>
                        <div className="eyebrow nopad">Starting balance (optional)</div>
                        <p className="muted small">If this person was already on your payroll, enter what stands between you today.</p>
                        <label className="check"><input type="checkbox" defaultChecked /> Send an invite email now</label>
                        <p className="error-line">This is how an error line reads.</p>
                    </Dialog>
                )}
            </main>
        </div>
    );
}
