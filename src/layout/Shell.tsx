// The frame around every signed-in page: brand, navigation, organization
// switcher, who is signed in, sign out. Pages render inside <Outlet />.
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import ThemeSwitch from '../components/ThemeSwitch';

// One stroke weight, one size, currentColor: the icons take the link's colour
// (muted → ink on hover → the accent tint when active) with no extra rules.
const icon = (children: ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const NAV_ICONS: Record<string, ReactNode> = {
    home: icon(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
    team: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
    payroll: icon(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>),
    payments: icon(<><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" /><path d="M17 13.5h.01" /></>),
    jobs: icon(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
    hours: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    invoices: icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>),
    clients: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>),
    organization: icon(<><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 10h2a2 2 0 0 1 2 2v9" /><path d="M3 21h18" /><path d="M8 7h4M8 11h4M8 15h4" /></>),
};

export const NAV: { to: string; label: string; icon: keyof typeof NAV_ICONS; phase?: number }[] = [
    { to: '/', label: 'Home', icon: 'home' },
    { to: '/team', label: 'Team', icon: 'team' },
    { to: '/payroll', label: 'Payroll', icon: 'payroll' },
    { to: '/payments', label: 'Payments', icon: 'payments' },
    { to: '/jobs', label: 'Jobs', icon: 'jobs' },
    { to: '/hours', label: 'Hours', icon: 'hours' },
    { to: '/invoices', label: 'Invoices', icon: 'invoices' },
    { to: '/clients', label: 'Clients', icon: 'clients' },
    { to: '/organization', label: 'Organization', icon: 'organization' },
];

/** "Dmytro Derevianchenko" → "DD"; an email → its first letter. */
export const initialsOf = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 1);
    return letters.toUpperCase();
};

export default function Shell() {
    const { session, org, setOrgId, signOut } = useAuth();
    const orgs = session?.organizations ?? [];
    const who = session?.fullName || session?.email || '';

    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="brand">
                    <img className="brand-mark" src="/favicon.svg" alt="" />
                    <div className="brand-name">ClockInOut</div>
                </div>
                {NAV.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                        {NAV_ICONS[n.icon]}
                        {n.label}
                        {n.phase && <span className="soon">soon</span>}
                    </NavLink>
                ))}
                <ThemeSwitch />
                <div className="sidebar-foot">
                    <div className="avatar" aria-hidden="true">{initialsOf(who)}</div>
                    <div className="sidebar-who">
                        <strong title={who}>{who}</strong>
                        <button className="signout" onClick={signOut}>Sign out</button>
                    </div>
                </div>
            </aside>
            <main className="main">
                <div className="topbar">
                    <h1>{org?.name ?? 'ClockInOut'}</h1>
                    {orgs.length > 1 && (
                        <label className="org-switch">
                            <select aria-label="Organization" value={org?.organization_id ?? ''} onChange={e => setOrgId(Number(e.target.value))}>
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
