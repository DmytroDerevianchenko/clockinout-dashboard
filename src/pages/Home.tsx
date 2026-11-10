// Home: the questions an employer opens a laptop for, in the order they ask
// them — who is on the clock right now (the hero), then the three figures
// that need attention (what the crew is owed, what clients owe, who is close
// to overtime), then the people on the clock with a live duration.
// Each figure is a door: it opens the page where that number is handled.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { team, money, type RosterReply } from '../api/team';
import { orgApi } from '../api/org';
import { useAuth } from '../auth';
import { initialsOf } from '../layout/Shell';
import { SkeletonCards, SkeletonTable, Sk } from '../components/Skeleton';

function since(iso: string | null): string {
    if (!iso) return '';
    const ms = Math.max(0, Date.now() - new Date(iso).getTime());
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
const startedAt = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

export default function Home() {
    const { session, org } = useAuth();
    const [roster, setRoster] = useState<RosterReply | null>(null);
    const [error, setError] = useState<string | null>(null);
    // The two money figures load on their own: a slow or refused one never
    // holds the page back (null = not known yet, shown as a skeleton line).
    const [owed, setOwed] = useState<{ total: number; people: number } | null>(null);
    const [receivable, setReceivable] = useState<{ total: number; count: number; overdue: number } | null>(null);
    // Durations are live: re-render every half minute.
    const [, setTick] = useState(0);
    useEffect(() => { const t = window.setInterval(() => setTick(x => x + 1), 30000); return () => window.clearInterval(t); }, []);

    useEffect(() => {
        if (!session || !org) return;
        let cancelled = false;
        setRoster(null); setError(null); setOwed(null); setReceivable(null);
        team.roster(session.userId, org.organization_id)
            .then(r => { if (!cancelled) setRoster(r); })
            .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load the team'); });
        team.owed(session.userId, org.organization_id)
            .then(r => { if (!cancelled) { const pos = r.employees.filter(e => e.owed > 0.005); setOwed({ total: pos.reduce((t, e) => t + e.owed, 0), people: pos.length }); } })
            .catch(() => { if (!cancelled) setOwed({ total: 0, people: 0 }); });
        orgApi.invoices(session.userId, org.organization_id)
            .then(r => { if (!cancelled) { const open = r.invoices.filter(i => !i.is_deleted && i.status === 'sent'); setReceivable({ total: open.reduce((t, i) => t + Number(i.total), 0), count: open.length, overdue: open.filter(i => i.is_overdue).length }); } })
            .catch(() => { if (!cancelled) setReceivable({ total: 0, count: 0, overdue: 0 }); });
        return () => { cancelled = true; };
    }, [session, org]);

    if (error) return <div className="card danger">{error}</div>;
    if (!roster) return <><div className="hero"><div><Sk w={160} h={10} /><Sk w={220} h={40} style={{ marginTop: 14 }} /><Sk w={200} h={10} style={{ marginTop: 14 }} /></div></div><SkeletonCards /><SkeletonTable rows={3} cols={4} /></>;

    const users = roster.users;
    const active = users.filter(u => u.status === 'active');
    const onClock = users.filter(u => u.is_clocked_in);
    const contractors = active.filter(u => u.employment_type === 'contractor').length;
    const ot = roster.overtime;
    const watch = ot?.enabled && ot.threshold > 0 ? active.filter(u => u.week_hours >= ot.threshold * 0.9) : null;
    const over = watch ? watch.filter(u => u.week_hours >= ot.threshold).length : 0;
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <>
            <section className={'hero' + (onClock.length ? ' live' : '')}>
                <div>
                    <div className="hero-eyebrow">{today}</div>
                    <div className="hero-figure">
                        <span className={'dot' + (onClock.length ? ' live' : '')} />
                        <span className="hero-num">{onClock.length}</span>
                        <span className="hero-unit">on the clock</span>
                    </div>
                    <div className="muted">of {active.length} active team {active.length === 1 ? 'member' : 'members'}{contractors ? ` · ${contractors} ${contractors === 1 ? 'contractor' : 'contractors'}` : ''}</div>
                </div>
                <div className="head-actions">
                    <Link className="btn" to="/hours">Hours</Link>
                    <Link className="btn btn-primary" to="/team">Team</Link>
                </div>
            </section>

            <div className="cards">
                <Link className="card stat-link" to="/payroll">
                    <div className="stat-label">Owed to crew</div>
                    {owed ? <div className={'stat' + (owed.total > 0.005 ? ' danger' : '')}>{money(owed.total)}</div> : <Sk w="60%" h={30} style={{ margin: '6px 0' }} />}
                    <div className="faint small">{owed ? (owed.people ? `${owed.people} ${owed.people === 1 ? 'person' : 'people'} · all periods` : 'Everyone is settled') : ' '}</div>
                </Link>
                <Link className="card stat-link" to="/invoices">
                    <div className="stat-label">Clients owe you</div>
                    {receivable ? <div className="stat">{money(receivable.total)}</div> : <Sk w="60%" h={30} style={{ margin: '6px 0' }} />}
                    <div className={'small ' + (receivable?.overdue ? 'danger' : 'faint')}>{receivable ? (receivable.count ? `${receivable.count} sent ${receivable.count === 1 ? 'invoice' : 'invoices'}${receivable.overdue ? ` · ${receivable.overdue} overdue` : ''}` : 'Nothing outstanding') : ' '}</div>
                </Link>
                <Link className="card stat-link" to="/team">
                    <div className="stat-label">{watch ? 'Near or in overtime' : 'Active team members'}</div>
                    <div className={'stat' + (over ? ' danger' : watch?.length ? ' caution' : '')}>{watch ? watch.length : active.length}</div>
                    <div className="faint small">{watch ? (watch.length ? `${over} over ${ot.threshold} h this week` : `Nobody near ${ot.threshold} h this week`) : `${users.length - active.length} inactive or terminated`}</div>
                </Link>
            </div>

            <div className="card card-flush">
                <div className="eyebrow">On the clock</div>
                {onClock.length === 0 ? (
                    <div className="empty">Nobody is clocked in right now.</div>
                ) : (
                    <table className="table table-hover">
                        <thead><tr><th>Name</th><th>Job</th><th>Since</th><th>Duration</th></tr></thead>
                        <tbody>
                            {onClock.flatMap(u => (u.active_shifts?.length ? u.active_shifts : [{ clockin_id: 0, job_id: 0, job_name: u.current_job_name, clock_in_time: u.clock_in_time ?? '' }]).map(s => (
                                <tr key={`${u.id}-${s.clockin_id}`}>
                                    <td><Link className="row-link" to={`/team/${u.id}`}><span className="avatar avatar-sm live">{initialsOf(u.full_name || u.email)}</span><strong>{u.full_name}</strong></Link></td>
                                    <td>{s.job_name ?? <span className="faint">—</span>}</td>
                                    <td>{startedAt(s.clock_in_time)}</td>
                                    <td>{since(s.clock_in_time)}</td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}
