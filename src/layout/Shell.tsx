// The frame around every signed-in page: brand, navigation, organization
// switcher, who is signed in, sign out. Pages render inside <Outlet />.
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV: { to: string; label: string; phase?: number }[] = [
    { to: '/', label: 'Home' },
    { to: '/team', label: 'Team' },
    { to: '/payroll', label: 'Payroll', phase: 3 },
    { to: '/jobs', label: 'Jobs', phase: 4 },
    { to: '/hours', label: 'Hours', phase: 4 },
    { to: '/organization', label: 'Organization', phase: 5 },
];

export default function Shell() {
    const { session, org, setOrgId, signOut } = useAuth();
    const orgs = session?.organizations ?? [];

    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">C</div>
                    <div className="brand-name">ClockInOut</div>
                </div>
                {NAV.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                        {n.label}
                        {n.phase && <span className="soon">soon</span>}
                    </NavLink>
                ))}
                <div className="sidebar-foot">
                    <div>{session?.fullName || session?.email}</div>
                    <button className="btn" onClick={signOut}>Sign out</button>
                </div>
            </aside>
            <main className="main">
                <div className="topbar">
                    <h1>{org?.name ?? 'ClockInOut'}</h1>
                    {orgs.length > 1 && (
                        <label className="org-switch">
                            <select value={org?.organization_id ?? ''} onChange={e => setOrgId(Number(e.target.value))}>
                                {orgs.map(o => <option key={o.organization_id} value={o.organization_id}>{o.name}</option>)}
                            </select>
                        </label>
                    )}
                </div>
                <Outlet />
            </main>
        </div>
    );
}
