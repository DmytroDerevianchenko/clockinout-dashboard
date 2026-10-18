// Home: the one question an employer opens a laptop for — who is on the
// clock right now — plus the team's size. Reads the same roster the phone's
// Team screen reads (POST /users).
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth';

type ActiveShift = { clockin_id: number; job_id: number; job_name: string | null; clock_in_time: string };
type RosterUser = {
    id: number; full_name: string; email: string; role: string; status: string;
    employment_type: string | null; is_clocked_in: boolean;
    current_job_name: string | null; clock_in_time: string | null;
    active_shifts: ActiveShift[];
};
type RosterReply = { status: string; users: RosterUser[] };

function since(iso: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
function startedAt(iso: string | null): string {
    return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

export default function Home() {
    const { session, org } = useAuth();
    const [users, setUsers] = useState<RosterUser[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !org) return;
        let cancelled = false;
        setUsers(null); setError(null);
        api<RosterReply>('/users', { userId: session.userId, organizationId: org.organization_id })
            .then(r => { if (!cancelled) setUsers(r.users); })
            .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load the team'); });
        return () => { cancelled = true; };
    }, [session, org]);

    if (error) return <div className="card danger">{error}</div>;
    if (!users) return <div className="card muted">Loading…</div>;

    const active = users.filter(u => u.status === 'active' && u.id !== session?.userId);
    const onClock = users.filter(u => u.is_clocked_in);

    return (
        <>
            <div className="cards">
                <div className="card"><div className="stat">{onClock.length}</div><div className="stat-label">On the clock now</div></div>
                <div className="card"><div className="stat">{active.length}</div><div className="stat-label">Active team members</div></div>
                <div className="card"><div className="stat">{users.filter(u => u.employment_type === 'contractor').length}</div><div className="stat-label">Contractors</div></div>
            </div>
            <div className="card">
                <h2>On the clock</h2>
                {onClock.length === 0 ? (
                    <div className="empty">Nobody is clocked in right now.</div>
                ) : (
                    <table className="table">
                        <thead><tr><th>Name</th><th>Job</th><th>Since</th><th>Duration</th></tr></thead>
                        <tbody>
                            {onClock.flatMap(u => (u.active_shifts?.length ? u.active_shifts : [{ clockin_id: 0, job_id: 0, job_name: u.current_job_name, clock_in_time: u.clock_in_time ?? '' }]).map(s => (
                                <tr key={`${u.id}-${s.clockin_id}`}>
                                    <td><span className="dot live" />{u.full_name}</td>
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
