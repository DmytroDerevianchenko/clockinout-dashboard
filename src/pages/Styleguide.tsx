// DEV ONLY (never routed in a production build): every piece of the design
// kit on one page, with made-up data, so the look can be checked — light and
// dark — without signing in. Open http://localhost:5173/styleguide.
// If a class is restyled in index.css, this page is where to look first.
import { useState } from 'react';
import { NAV, NAV_ICONS, initialsOf } from '../layout/Shell';
import Dialog, { SaveFooter } from '../components/Dialog';

const CREW = [
    { name: 'Alex Rivera', type: 'Full-time', rate: '$32.00/h', week: 38.5, cap: 44, bal: '$1,240.00', owe: true, live: true, job: 'Maple Ridge – Lot 12' },
    { name: 'Noor Haddad', type: 'Full-time', rate: '$29.00/h', week: 41.2, cap: 44, bal: 'settled', owe: false, live: true, job: 'Closson' },
    { name: 'Priya Nair', type: 'Contractor', rate: '$34.00/h', week: 45.0, cap: 44, bal: '−$200.00', owe: false, live: false, job: '' },
    { name: 'Liam Chen', type: 'Casual', rate: '$30.00/h', week: 12.0, cap: 44, bal: '$310.50', owe: true, live: false, job: '' },
];

export default function Styleguide() {
    const [dialog, setDialog] = useState(false);
    const [active, setActive] = useState('/team');
    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="brand"><img className="brand-mark" src="/favicon.svg" alt="" /><div className="brand-name">ClockInOut</div></div>
                {NAV.map(n => (
                    <a key={n.to} href="#" onClick={e => { e.preventDefault(); setActive(n.to); }} className={'nav-link' + (active === n.to ? ' active' : '')}>{NAV_ICONS[n.icon]}{n.label}</a>
                ))}
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

                <div className="cards">
                    <div className="card"><div className="stat">2</div><div className="stat-label">On the clock now</div></div>
                    <div className="card"><div className="stat">14</div><div className="stat-label">Active team members</div></div>
                    <div className="card"><div className="stat">$18,420.50</div><div className="stat-label">Owed to crew</div></div>
                </div>

                <div className="toolbar">
                    <input className="search" placeholder="Search by name or email" />
                    <label className="field inline"><span>Period</span><select><option>Oct 19 – Nov 1</option><option>Nov 2 – Nov 15</option></select></label>
                    <label className="check"><input type="checkbox" defaultChecked /> Show terminated</label>
                    <span className="spacer" />
                    <button className="btn">Export CSV</button>
                    <button className="btn btn-primary" onClick={() => setDialog(true)}>Add member</button>
                </div>

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
                                        <td className="actions"><button className="btn btn-sm">{u.live ? 'End shift' : 'Clock in'}</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="groups" style={{ marginTop: 18 }}>
                    <div className="card card-flush">
                        <div className="eyebrow">Employment</div>
                        <div className="rrow clickable"><span className="rlabel">Employment type</span><span className="rvalue">Full-time</span><span className="rchev">›</span></div>
                        <div className="rrow clickable"><span className="rlabel">Current rate</span><span className="rvalue">$32.00/h</span><span className="rchev">›</span></div>
                        <div className="rrow clickable"><span className="rlabel">Balance</span><span className="rvalue danger">You owe them $1,240.00</span><span className="rchev">›</span></div>
                        <div className="rrow"><span className="rlabel">Email</span><span className="rvalue">alex@example.com</span><span className="rlock">🔒</span></div>
                    </div>
                    <div className="card card-flush period open">
                        <button className="period-head"><div><strong>Oct 19 – Nov 1, 2026</strong><div className="faint small">4 people · bi-weekly</div></div>
                            <div className="period-sums"><span>$9,812.40<em>Gross</em></span><span>$7,604.11<em>Net</em></span><span>$6,000.00<em>Paid</em></span><span className="danger">$1,604.11<em>Owed</em></span></div></button>
                        <div className="pad-left" style={{ paddingTop: 10 }}><span className="muted">Rows open here.</span> <button className="pill-btn">Ontario says 44 h — tap to apply</button></div>
                    </div>
                    <div className="card"><h2>On the clock</h2><div className="empty">Nobody is clocked in right now.</div></div>
                </div>

                {dialog && (
                    <Dialog title="Add a team member" subtitle="They appear on the roster right away; the invite lets them sign in to the app." wide onClose={() => setDialog(false)}
                        footer={<SaveFooter onCancel={() => setDialog(false)} onSave={() => setDialog(false)} label="Add" />}>
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
