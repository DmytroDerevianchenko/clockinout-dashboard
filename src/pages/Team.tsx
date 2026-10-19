// Team: the roster, live. Who is on the clock, hours this week against the
// overtime threshold, and the two actions an employer takes from a desk:
// clock someone in, end their shift. Everything else is on the record.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { team, type RosterUser, type RosterReply, type JobEntry, money, employmentLabel, statusLabel, timeOnly } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import AddMemberDialog from '../components/AddMemberDialog';

export function useRoster() {
    const { session, org } = useAuth();
    const [data, setData] = useState<RosterReply | null>(null);
    const [error, setError] = useState<string | null>(null);
    const reload = useCallback(() => {
        if (!session || !org) return Promise.resolve();
        return team.roster(session.userId, org.organization_id)
            .then(r => { setData(r); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load the team'));
    }, [session, org]);
    useEffect(() => { setData(null); reload(); }, [reload]);
    return { data, error, reload };
}

// Local "now" as the ISO instant the server expects.
const nowIso = () => new Date().toISOString();

export default function Team() {
    const { session, org } = useAuth();
    const { data, error, reload } = useRoster();
    const [q, setQ] = useState('');
    const [showTerminated, setShowTerminated] = useState(false);
    const [clockInFor, setClockInFor] = useState<RosterUser | null>(null);
    const [endFor, setEndFor] = useState<RosterUser | null>(null);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState<number | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const users = useMemo(() => {
        const list = data?.users ?? [];
        const needle = q.trim().toLowerCase();
        return list
            .filter(u => showTerminated || (u.status !== 'terminated' && u.status !== 'deleted'))
            .filter(u => !needle || u.full_name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
            .sort((a, b) => Number(b.is_clocked_in) - Number(a.is_clocked_in) || a.full_name.localeCompare(b.full_name));
    }, [data, q, showTerminated]);

    async function endShift(u: RosterUser) {
        if (!session || !org || !u.current_clock_in_id) return;
        setBusy(u.id); setActionError(null);
        try { await team.endShift(session.userId, u.current_clock_in_id, nowIso(), org.organization_id); await reload(); }
        catch (e) { setActionError(e instanceof ApiError ? e.message : 'Could not end the shift'); }
        finally { setBusy(null); setEndFor(null); }
    }

    if (error) return <div className="card danger">{error}</div>;
    if (!data) return <div className="card muted">Loading…</div>;
    const ot = data.overtime;

    return (
        <>
            <div className="toolbar">
                <input className="search" placeholder="Search by name or email" value={q} onChange={e => setQ(e.target.value)} />
                <label className="check"><input type="checkbox" checked={showTerminated} onChange={e => setShowTerminated(e.target.checked)} /> Show terminated</label>
                <span className="spacer" />
                <button className="btn btn-primary" onClick={() => setAdding(true)}>Add member</button>
            </div>
            {actionError && <p className="error-line">{actionError}</p>}
            <div className="card card-flush">
                <table className="table table-hover">
                    <thead><tr><th>Name</th><th>Type</th><th>Rate</th><th>This week</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {users.map(u => {
                            const self = u.id === session?.userId;
                            const over = ot.enabled && ot.threshold > 0 && u.week_hours >= ot.threshold;
                            const near = ot.enabled && ot.threshold > 0 && !over && u.week_hours >= ot.threshold * 0.9;
                            return (
                                <tr key={u.id}>
                                    <td>
                                        <Link to={`/team/${u.id}`} className="row-link">
                                            <span className={'dot' + (u.is_clocked_in ? ' live' : '')} />
                                            <strong>{u.full_name}</strong>{self && <span className="pill">You</span>}
                                            {!u.joined && <span className="pill caution">Not joined</span>}
                                        </Link>
                                        <div className="faint small">
                                            {u.is_clocked_in
                                                ? `On the clock${u.current_job_name ? ` · ${u.current_job_name}` : ''} since ${timeOnly(u.clock_in_time)}`
                                                : u.email}
                                        </div>
                                    </td>
                                    <td>{employmentLabel(u.employment_type)}{u.is_admin && u.role !== 'employer' ? <span className="pill">Admin</span> : null}{u.role === 'employer' ? <span className="pill">Owner</span> : null}</td>
                                    <td>{u.current_rate != null ? `${money(u.current_rate)}/h` : <span className="faint">—</span>}</td>
                                    <td>
                                        {ot.enabled && ot.threshold > 0 ? (
                                            <div className={'week' + (over ? ' over' : near ? ' near' : '')}>
                                                <span>{u.week_hours.toFixed(1)} / {ot.threshold} h</span>
                                                <div className="bar"><div style={{ width: `${Math.min(100, (u.week_hours / ot.threshold) * 100)}%` }} /></div>
                                            </div>
                                        ) : <span>{u.week_hours.toFixed(1)} h</span>}
                                    </td>
                                    <td><span className={'pill' + (u.status === 'terminated' ? ' danger' : u.status === 'inactive' ? ' caution' : '')}>{statusLabel(u.status)}</span></td>
                                    <td className="actions">
                                        {u.status === 'active' && u.employment_type !== null && (
                                            u.is_clocked_in
                                                ? <button className="btn btn-sm" disabled={busy === u.id} onClick={() => setEndFor(u)}>End shift</button>
                                                : <button className="btn btn-sm" disabled={busy === u.id} onClick={() => setClockInFor(u)}>Clock in</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {users.length === 0 && <tr><td colSpan={6} className="empty">Nobody matches.</td></tr>}
                    </tbody>
                </table>
            </div>

            {clockInFor && <ClockInDialog user={clockInFor} onClose={() => setClockInFor(null)} onDone={() => { setClockInFor(null); reload(); }} />}
            {endFor && (
                <Dialog title={`End ${endFor.full_name}'s shift?`} subtitle={`Clocked in${endFor.current_job_name ? ` at ${endFor.current_job_name}` : ''} since ${timeOnly(endFor.clock_in_time)}. The shift ends now.`} onClose={() => setEndFor(null)}
                    footer={<SaveFooter onCancel={() => setEndFor(null)} onSave={() => endShift(endFor)} saving={busy === endFor.id} label="End shift" />}>
                    <p className="muted">You can adjust the times afterwards on their hours.</p>
                </Dialog>
            )}
            {adding && <AddMemberDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
        </>
    );
}

export function ClockInDialog({ user, onClose, onDone }: { user: RosterUser; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [jobs, setJobs] = useState<JobEntry[] | null>(null);
    const [jobId, setJobId] = useState<number | ''>('');
    const [when, setWhen] = useState(() => {
        const d = new Date(); d.setSeconds(0, 0);
        const pad = (x: number) => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !org) return;
        team.jobs(session.userId, org.organization_id)
            .then(r => { const open = r.jobs.filter(j => !j.archived); setJobs(open); if (open.length === 1) setJobId(open[0].id); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load jobs'));
    }, [session, org]);

    async function save() {
        if (!session || !org || jobId === '') return;
        setSaving(true); setError(null);
        try { await team.employerClockIn(session.userId, user.id, org.organization_id, Number(jobId), new Date(when).toISOString()); onDone(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not clock in'); setSaving(false); }
    }

    return (
        <Dialog title={`Clock in ${user.full_name}`} subtitle="Starts a shift on their behalf, exactly as the app does." onClose={onClose}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} label="Clock in" disabled={jobId === ''} />}>
            <label className="field"><span>Job</span>
                <select value={jobId} onChange={e => setJobId(e.target.value === '' ? '' : Number(e.target.value))}>
                    <option value="">{jobs ? 'Choose a job' : 'Loading…'}</option>
                    {jobs?.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
            </label>
            <label className="field"><span>Start time</span>
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
            </label>
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
