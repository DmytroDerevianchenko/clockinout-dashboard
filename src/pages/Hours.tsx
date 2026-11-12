// Hours: every shift in a pay period (or a year), filtered by person and
// job, with the employer's edits — fix a clock time, add a note, add a
// shift someone forgot, delete one — and the CSV. Same endpoints as the
// phone's View Hours. The route map comes with the map work later.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { hoursApi, pairShifts, fmtDay, fmtTime, type Shift, type PeriodLite } from '../api/hours';
import { jobsApi, type Job } from '../api/jobs';
import { team, type RosterUser } from '../api/team';
import { money, periodLabel } from '../api/payroll';
import { useAuth } from '../auth';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import Dialog, { SaveFooter } from '../components/Dialog';
import CopyShiftsDialog from '../components/CopyShiftsDialog';
import EditShiftDialog from '../components/EditShiftDialog';
import RowMenu from '../components/Menu';

const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v));

export default function Hours() {
    const { session, org } = useAuth();
    const thisYear = new Date().getFullYear();
    const [year, setYear] = useState(thisYear);
    const [periods, setPeriods] = useState<PeriodLite[]>([]);
    const [periodId, setPeriodId] = useState<number | ''>('');
    const [person, setPerson] = useState<number | ''>('');
    const [jobId, setJobId] = useState<number | ''>('');
    const [people, setPeople] = useState<RosterUser[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [shifts, setShifts] = useState<Shift[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [edit, setEdit] = useState<{ kind: 'shift'; shift: Shift } | { kind: 'end'; shift: Shift } | { kind: 'note'; shift: Shift } | { kind: 'delete'; shift: Shift } | { kind: 'add' } | { kind: 'copy' } | null>(null);
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    // Periods for the year; default to the one containing today.
    useEffect(() => {
        if (!session || !org) return;
        Promise.all([
            hoursApi.periods(org.organization_id, year),
            team.roster(session.userId, org.organization_id),
            jobsApi.list(session.userId, org.organization_id),
        ]).then(([p, r, j]) => {
            const ps = [...(p.payPeriods ?? [])].sort((a, b) => b.start_date.localeCompare(a.start_date));
            setPeriods(ps);
            const now = Date.now();
            setPeriodId(cur => cur !== '' && ps.some(x => x.id === cur) ? cur : (ps.find(x => Date.parse(x.start_date) <= now && now <= Date.parse(x.end_date))?.id ?? ps[0]?.id ?? ''));
            setPeople(r.users.filter(u => u.status !== 'deleted'));
            setJobs(j.jobs);
        }).catch(e => setError(e instanceof ApiError ? e.message : 'Could not load'));
    }, [session, org, year]);

    const load = useCallback(() => {
        if (!session || !org) return;
        setShifts(null);
        hoursApi.rows(session.userId, org.organization_id, {
            userFilterId: person === '' ? undefined : person, payPeriodId: periodId === '' ? undefined : periodId,
            jobId: jobId === '' ? undefined : jobId, year: periodId === '' ? year : undefined,
        }).then(r => setShifts(pairShifts(r.clockins))).catch(e => setError(e instanceof ApiError ? e.message : 'Could not load hours'));
    }, [session, org, person, periodId, jobId, year]);
    useEffect(() => { load(); }, [load]);

    const totals = useMemo(() => {
        const t = { hours: 0, earned: 0 };
        for (const s of shifts ?? []) { t.hours += n(s.out?.hours_worked); t.earned += n(s.out?.earned); }
        return t;
    }, [shifts]);

    async function run(fn: () => Promise<unknown>) {
        setBusy(true); setError(null);
        try { await fn(); setEdit(null); toast('Saved'); load(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); }
        finally { setBusy(false); }
    }

    if (error && !shifts) return <div className="card danger">{error}</div>;
    const sel = periods.find(p => p.id === periodId);

    return (
        <>
            <div className="toolbar">
                <label className="field inline"><span>Year</span><select value={year} onChange={e => setYear(Number(e.target.value))}>{[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map(y => <option key={y} value={y}>{y}</option>)}</select></label>
                <label className="field inline"><span>Period</span>
                    <select value={periodId} onChange={e => setPeriodId(e.target.value === '' ? '' : Number(e.target.value))}>
                        <option value="">Whole year</option>
                        {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
                    </select></label>
                <label className="field inline"><span>Person</span>
                    <select value={person} onChange={e => setPerson(e.target.value === '' ? '' : Number(e.target.value))}>
                        <option value="">Everyone</option>
                        {people.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select></label>
                <label className="field inline"><span>Job</span>
                    <select value={jobId} onChange={e => setJobId(e.target.value === '' ? '' : Number(e.target.value))}>
                        <option value="">All jobs</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                    </select></label>
                <span className="spacer" />
                <button className="btn" onClick={() => setEdit({ kind: 'add' })}>Add shift</button>
                <button className="btn" title="For someone who worked the same days as a coworker" onClick={() => setEdit({ kind: 'copy' })}>Copy shifts</button>
                <button className="btn" onClick={async () => {
                    if (!session || !org) return;
                    try { const r = await hoursApi.csv(session.userId, org.organization_id, { userFilterId: person || undefined, payPeriodId: periodId || undefined, jobId: jobId || undefined, year: periodId === '' ? year : undefined }); if (r.csv_url) window.open(r.csv_url, '_blank', 'noopener'); }
                    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not export'); }
                }}>Export CSV</button>
            </div>
            {error && <p className="error-line">{error}</p>}
            <div className="card card-flush">
                <div className="eyebrow">{sel ? periodLabel(sel) : `${year}`} · {totals.hours.toFixed(1)} h · {money(totals.earned)}</div>
                {!shifts ? <SkeletonTable bare rows={6} cols={7} /> : shifts.length === 0 ? <div className="empty">No shifts match.</div> : (
                    <table className="table table-hover">
                        <thead><tr><th>Day</th><th>Person</th><th>Job</th><th>In</th><th>Out</th><th>Break</th><th>Hours</th><th>Earned</th><th></th></tr></thead>
                        <tbody>
                            {shifts.map(s => (
                                <tr key={s.in.id}>
                                    <td>{fmtDay(s.in.time)}</td>
                                    <td><strong>{s.user_name}</strong></td>
                                    <td>{s.job_name ?? <span className="faint">—</span>}</td>
                                    <td>{fmtTime(s.in.time)}</td>
                                    <td>{s.out ? fmtTime(s.out.time) : <><span className="dot live" />on the clock</>}</td>
                                    <td>{s.out?.break_duration ? `${s.out.break_duration} min` : <span className="faint">—</span>}</td>
                                    <td>{s.out ? `${n(s.out.hours_worked).toFixed(2)} h` : ''}</td>
                                    <td>{s.out ? money(s.out.earned) : ''}</td>
                                    <td className="actions">
                                        {/* One obvious door for every correction (job, times, break); the rest in the menu. */}
                                        <button className="btn btn-sm" onClick={() => setEdit({ kind: 'shift', shift: s })}>Edit</button>
                                        <RowMenu items={[
                                            { label: (s.in.note || s.out?.note) ? 'Edit note' : 'Add a note', onClick: () => setEdit({ kind: 'note', shift: s }) },
                                            !s.out && { label: 'End shift now', onClick: () => setEdit({ kind: 'end', shift: s }) },
                                            { label: 'Delete shift', danger: true, onClick: () => setEdit({ kind: 'delete', shift: s }) },
                                        ]} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {edit?.kind === 'shift' && (
                <EditShiftDialog shift={edit.shift} jobs={jobs} onClose={() => setEdit(null)} onChanged={load}
                    onDone={msg => { setEdit(null); toast(msg); load(); }} />
            )}
            {edit?.kind === 'end' && session && org && (
                <Dialog title={`End ${edit.shift.user_name}'s shift?`} subtitle={`On the clock${edit.shift.job_name ? ` at ${edit.shift.job_name}` : ''} since ${fmtDay(edit.shift.in.time)} ${fmtTime(edit.shift.in.time)}. The shift ends now.`} onClose={() => setEdit(null)}
                    footer={<SaveFooter onCancel={() => setEdit(null)} saving={busy} label="End shift" onSave={() => run(() => team.endShift(session.userId, edit.shift.in.id, new Date().toISOString(), org.organization_id))} />}>
                    <p className="muted">You can adjust the times afterwards with Edit.</p>
                </Dialog>
            )}
            {edit?.kind === 'note' && session && (
                <NoteDialog initial={edit.shift.in.note ?? edit.shift.out?.note ?? ''} busy={busy} onClose={() => setEdit(null)} onSave={v => run(() => hoursApi.addNote(session.userId, edit.shift.in.id, v))} />
            )}
            {edit?.kind === 'delete' && session && (
                <Dialog title="Delete this shift?" subtitle={`${edit.shift.user_name}, ${fmtDay(edit.shift.in.time)} ${fmtTime(edit.shift.in.time)}${edit.shift.out ? ` – ${fmtTime(edit.shift.out.time)}` : ''}. It is removed from hours and payroll (soft-deleted, recoverable by support).`} onClose={() => setEdit(null)}
                    footer={<SaveFooter onCancel={() => setEdit(null)} saving={busy} label="Delete" onSave={() => run(() => hoursApi.deleteShift(session.userId, edit.shift.in.id, edit.shift.out?.id ?? null))} />}>
                    <p className="muted">Deleting changes the period's hours; a calculated run recalculates on its next load.</p>
                </Dialog>
            )}
            {edit?.kind === 'copy' && (
                <CopyShiftsDialog people={people} defaultTarget={person || undefined} onClose={() => setEdit(null)}
                    onDone={msg => { setEdit(null); toast(msg); load(); }} />
            )}
            {edit?.kind === 'add' && session && org && (
                <AddShiftDialog people={people} jobs={jobs.filter(j => !j.archived)} defaultPerson={person || undefined} busy={busy} onClose={() => setEdit(null)}
                    onSave={(p, j, tin, tout, brk) => run(() => hoursApi.addShift(session.userId, p, org.organization_id, j, new Date(tin).toISOString(), new Date(tout).toISOString(), brk))} />
            )}
        </>
    );
}

function NoteDialog({ initial, busy, onClose, onSave }: { initial: string; busy: boolean; onClose: () => void; onSave: (v: string) => void }) {
    const [v, setV] = useState(initial);
    return (
        <Dialog title="Shift note" onClose={onClose} footer={<SaveFooter onCancel={onClose} saving={busy} onSave={() => onSave(v.trim())} />}>
            <label className="field"><span>Note</span><textarea rows={3} value={v} onChange={e => setV(e.target.value)} autoFocus /></label>
        </Dialog>
    );
}
function AddShiftDialog({ people, jobs, defaultPerson, busy, onClose, onSave }: { people: RosterUser[]; jobs: Job[]; defaultPerson?: number; busy: boolean; onClose: () => void; onSave: (person: number, job: number, tin: string, tout: string, brk: number) => void }) {
    const today = new Date().toISOString().slice(0, 10);
    const [p, setP] = useState<number | ''>(defaultPerson ?? '');
    const [j, setJ] = useState<number | ''>(jobs.length === 1 ? jobs[0].id : '');
    const [tin, setTin] = useState(`${today}T07:00`);
    const [tout, setTout] = useState(`${today}T15:30`);
    const [brk, setBrk] = useState('30');
    const ok = p !== '' && j !== '' && Date.parse(tout) > Date.parse(tin);
    return (
        <Dialog title="Add a shift" subtitle="For a shift someone forgot to clock. Hours are the span minus the break." onClose={onClose}
            footer={<SaveFooter onCancel={onClose} saving={busy} label="Add" disabled={!ok} onSave={() => onSave(Number(p), Number(j), tin, tout, parseInt(brk) || 0)} />}>
            <div className="grid-2">
                <label className="field"><span>Person</span><select value={p} onChange={e => setP(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Choose</option>{people.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
                <label className="field"><span>Job</span><select value={j} onChange={e => setJ(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Choose</option>{jobs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="field"><span>Clock in</span><input type="datetime-local" value={tin} onChange={e => setTin(e.target.value)} /></label>
                <label className="field"><span>Clock out</span><input type="datetime-local" value={tout} onChange={e => setTout(e.target.value)} /></label>
                <label className="field"><span>Break (minutes)</span><input inputMode="numeric" value={brk} onChange={e => setBrk(e.target.value.replace(/\D/g, ''))} /></label>
            </div>
        </Dialog>
    );
}
