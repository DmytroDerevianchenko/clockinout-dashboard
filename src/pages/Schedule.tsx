// Schedule: the week as seven columns of planned shifts. Build it (one
// "Add shifts" form multiplies people × days), copy last week, then publish:
// drafts become visible to the crew and each person gets one notification.
// Past days show how the plan met reality (on time, late, no show).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { scheduleApi, startOfWeek, addDays, dayKey, hoursBetween, at, type Planned, type NewShift, type Variance, type Warning } from '../api/schedule';
import { jobsApi, type Job } from '../api/jobs';
import { team, type RosterUser, money } from '../api/team';
import { fmtTime } from '../api/hours';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';
import { SkeletonCards } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function verdictPill(v: Variance | undefined) {
    if (!v) return null;
    switch (v.verdict) {
        case 'on_time': return <span className="pill live">On time</span>;
        case 'late': return <span className="pill danger">{v.startDeltaMin != null ? `${Math.abs(v.startDeltaMin)} min late` : 'Late'}</span>;
        case 'early': return <span className="pill">{v.startDeltaMin != null ? `${Math.abs(v.startDeltaMin)} min early` : 'Early'}</span>;
        case 'no_show': return <span className="pill danger">No show</span>;
        case 'pending': return <span className="pill caution">Not clocked in yet</span>;
        default: return null;
    }
}

export default function Schedule() {
    const { session, org } = useAuth();
    const toast = useToast();
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [shifts, setShifts] = useState<Planned[] | null>(null);
    const [variance, setVariance] = useState<Map<number, Variance>>(new Map());
    const [jobs, setJobs] = useState<Job[]>([]);
    const [people, setPeople] = useState<RosterUser[]>([]);
    const [error, setError] = useState<{ message: string; off: boolean } | null>(null);
    const [dialog, setDialog] = useState<{ kind: 'add'; day?: string } | { kind: 'edit'; shift: Planned } | null>(null);
    const [pending, setPending] = useState<{ items: NewShift[]; warnings: Warning[]; verb: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
    const from = weekStart.toISOString(), to = addDays(weekStart, 7).toISOString();

    const load = useCallback(() => {
        if (!session || !org) return;
        scheduleApi.list(session.userId, org.organization_id, from, to)
            .then(r => { setShifts(r.shifts); setError(null); })
            .catch(e => { setShifts([]); setError({ message: e instanceof ApiError ? e.message : 'Could not load the schedule', off: e instanceof ApiError && e.status === 403 }); });
        // How the plan met reality — only worth asking once the week has begun.
        if (weekStart.getTime() <= Date.now()) {
            scheduleApi.variance(session.userId, org.organization_id, from, to)
                .then(r => setVariance(new Map(r.entries.filter(e => e.scheduledShiftId != null).map(e => [e.scheduledShiftId as number, e]))))
                .catch(() => setVariance(new Map()));
        } else setVariance(new Map());
    }, [session, org, from, to, weekStart]);
    useEffect(() => { setShifts(null); load(); }, [load]);
    useEffect(() => {
        if (!session || !org) return;
        jobsApi.list(session.userId, org.organization_id).then(r => setJobs(r.jobs.filter(j => !j.archived))).catch(() => {});
        team.roster(session.userId, org.organization_id).then(r => setPeople(r.users.filter(u => u.status === 'active'))).catch(() => {});
    }, [session, org]);

    const drafts = (shifts ?? []).filter(s => s.status === 'draft').length;
    const hours = (shifts ?? []).reduce((t, s) => t + hoursBetween(s.startsAt, s.endsAt), 0);
    const cost = (shifts ?? []).reduce((t, s) => t + hoursBetween(s.startsAt, s.endsAt) * (s.hourlyRate ?? 0), 0);
    const range = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const today = dayKey(new Date());

    // Create with the phone's two-step: ask the server what would overlap, then confirm.
    async function create(items: NewShift[], verb: string) {
        if (!session || !org || items.length === 0) return;
        setBusy(true);
        try {
            const probe = await scheduleApi.create(session.userId, org.organization_id, items, true);
            if (probe.warnings?.length) { setPending({ items, warnings: probe.warnings, verb }); return; }
            await commit(items, verb);
        } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not create the shifts', 'error'); }
        finally { setBusy(false); }
    }
    async function commit(items: NewShift[], verb: string) {
        if (!session || !org) return;
        setBusy(true);
        try {
            const r = await scheduleApi.create(session.userId, org.organization_id, items, false);
            toast(`${verb} ${plural(r.count, 'shift', 'shifts')} as ${r.count === 1 ? 'a draft' : 'drafts'}`);
            setPending(null); setDialog(null); load();
        } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not create the shifts', 'error'); }
        finally { setBusy(false); }
    }
    async function copyLastWeek() {
        if (!session || !org) return;
        setBusy(true);
        try {
            const prev = await scheduleApi.list(session.userId, org.organization_id, addDays(weekStart, -7).toISOString(), weekStart.toISOString());
            if (prev.shifts.length === 0) { toast('Last week had no shifts to copy', 'error'); return; }
            const week = 7 * 86400000;
            const items = prev.shifts.map(s => ({ jobId: s.jobId, userId: s.userId, startsAt: new Date(Date.parse(s.startsAt) + week).toISOString(), endsAt: new Date(Date.parse(s.endsAt) + week).toISOString(), note: s.note }));
            setBusy(false);
            await create(items, 'Copied');
        } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not copy last week', 'error'); }
        finally { setBusy(false); }
    }
    async function publish() {
        if (!session || !org) return;
        setBusy(true);
        try { const r = await scheduleApi.publish(session.userId, org.organization_id, from, to); toast(`Published ${plural(r.published, 'shift', 'shifts')} · ${plural(r.notified, 'person', 'people')} notified`); load(); }
        catch (e) { toast(e instanceof ApiError ? e.message : 'Could not publish', 'error'); }
        finally { setBusy(false); }
    }

    if (error?.off) return (
        <div className="card">
            <h2>Scheduling is off</h2>
            <p className="muted">Plan the week ahead, publish it to the crew, and see afterwards who was on time. Turn it on under <Link to="/organization">Organization → Features → Scheduling</Link>; it appears on the phones at the same moment.</p>
        </div>
    );

    return (
        <>
            <div className="toolbar">
                <button className="btn" onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Previous week">‹</button>
                <button className="btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
                <button className="btn" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Next week">›</button>
                <strong>{range}</strong>
                <span className="spacer" />
                <button className="btn" disabled={busy} onClick={copyLastWeek}>Copy last week</button>
                <button className="btn" disabled={busy} onClick={() => setDialog({ kind: 'add' })}>Add shifts</button>
                <button className="btn btn-primary" disabled={busy || drafts === 0} onClick={publish}>{drafts ? `Publish ${plural(drafts, 'draft', 'drafts')}` : 'All published'}</button>
            </div>
            {error && <p className="error-line">{error.message}</p>}
            {!shifts ? <SkeletonCards n={4} /> : (
                <>
                    <div className="muted small" style={{ marginBottom: 10 }}>{plural(shifts.length, 'shift', 'shifts')} · {hours.toFixed(1)} h{cost > 0 ? ` · about ${money(cost)} in labour` : ''}{drafts ? ` · ${plural(drafts, 'draft', 'drafts')} not yet visible to the crew` : ''}</div>
                    <div className="week-grid">
                        {days.map(d => {
                            const key = dayKey(d);
                            const list = shifts.filter(s => dayKey(new Date(s.startsAt)) === key).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                            return (
                                <section key={key} className={'day' + (key === today ? ' today' : '')}>
                                    <header className="day-head">
                                        <span>{d.toLocaleDateString(undefined, { weekday: 'short' })} <strong>{d.getDate()}</strong></span>
                                        <button className="btn btn-sm btn-icon" title="Add a shift on this day" aria-label={`Add a shift on ${d.toLocaleDateString(undefined, { weekday: 'long' })}`} onClick={() => setDialog({ kind: 'add', day: key })}>+</button>
                                    </header>
                                    {list.length === 0 ? <div className="day-empty">—</div> : list.map(s => (
                                        <button key={s.id} className={'plan' + (s.status === 'draft' ? ' draft' : '')} onClick={() => setDialog({ kind: 'edit', shift: s })}>
                                            <span className="plan-time">{fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</span>
                                            <strong>{s.userName ?? 'Open slot'}</strong>
                                            <span className="faint small">{s.jobName}</span>
                                            <span className="plan-tags">{s.status === 'draft' && <span className="pill caution">Draft</span>}{verdictPill(variance.get(s.id))}</span>
                                        </button>
                                    ))}
                                </section>
                            );
                        })}
                    </div>
                </>
            )}

            {dialog?.kind === 'add' && <AddShiftsDialog days={days} startDay={dialog.day} jobs={jobs} people={people} busy={busy} onClose={() => setDialog(null)} onCreate={items => create(items, 'Added')} />}
            {dialog?.kind === 'edit' && <EditPlanDialog shift={dialog.shift} jobs={jobs} people={people} onClose={() => setDialog(null)} onDone={msg => { setDialog(null); toast(msg); load(); }} />}
            {pending && (
                <Dialog title={`${plural(pending.warnings.length, 'shift overlaps', 'shifts overlap')} one already scheduled`} onClose={() => setPending(null)}
                    footer={<SaveFooter onCancel={() => setPending(null)} saving={busy} label="Create anyway" onSave={() => commit(pending.items, pending.verb)} />}>
                    {pending.warnings.slice(0, 5).map(w => {
                        const item = pending.items[w.index], c = w.conflicts[0];
                        const who = people.find(p => p.id === item?.userId)?.full_name ?? 'Open slot';
                        return <p key={w.index} className="muted">{who}, {item ? new Date(item.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''}: already on {c?.jobName ?? 'a job'}{c ? ` ${fmtTime(c.startsAt)} – ${fmtTime(c.endsAt)}` : ''}.</p>;
                    })}
                    {pending.warnings.length > 5 && <p className="faint small">and {pending.warnings.length - 5} more.</p>}
                    <p className="muted small">The schedule never blocks a punch; an overlap is only a warning.</p>
                </Dialog>
            )}
        </>
    );
}

// People × days: one form builds the whole week for a crew.
function AddShiftsDialog({ days, startDay, jobs, people, busy, onClose, onCreate }: { days: Date[]; startDay?: string; jobs: Job[]; people: RosterUser[]; busy: boolean; onClose: () => void; onCreate: (items: NewShift[]) => void }) {
    const [jobId, setJobId] = useState<number | ''>(jobs.length === 1 ? jobs[0].id : '');
    const [who, setWho] = useState<Set<number>>(new Set());                 // 0 = an open slot
    const [on, setOn] = useState<Set<string>>(() => new Set(startDay ? [startDay] : days.slice(0, 5).map(dayKey)));
    const [start, setStart] = useState('07:00');
    const [end, setEnd] = useState('15:30');
    const [note, setNote] = useState('');
    const flip = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

    const items: NewShift[] = useMemo(() => {
        if (jobId === '' || !start || !end) return [];
        const out: NewShift[] = [];
        for (const day of days.map(dayKey).filter(k => on.has(k))) {
            const s = at(day, start);
            let e = at(day, end);
            if (e <= s) e = new Date(Date.parse(e) + 86400000).toISOString();     // a night shift ends the next morning
            for (const id of who) out.push({ jobId: Number(jobId), userId: id === 0 ? null : id, startsAt: s, endsAt: e, note: note.trim() || null });
        }
        return out;
    }, [jobId, who, on, start, end, note, days]);
    const total = items.reduce((t, i) => t + hoursBetween(i.startsAt, i.endsAt), 0);

    return (
        <Dialog title="Add shifts" wide onClose={onClose} subtitle="Everyone ticked gets a shift on every day ticked. They are saved as drafts: nobody sees them until you publish."
            footer={<SaveFooter onCancel={onClose} onSave={() => onCreate(items)} saving={busy} disabled={items.length === 0} label={items.length ? `Add ${plural(items.length, 'shift', 'shifts')}` : 'Add shifts'} />}>
            <div className="grid-2">
                <label className="field"><span>Job</span>
                    <select value={jobId} onChange={e => setJobId(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Choose a job</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></label>
                <label className="field"><span>Note (optional)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="Bring the nailer" /></label>
                <label className="field"><span>Starts</span><input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                <label className="field"><span>Ends</span><input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
            </div>
            <div className="eyebrow nopad">Days</div>
            <div className="chips">
                {days.map(d => { const k = dayKey(d); return <button key={k} type="button" className={'chip' + (on.has(k) ? ' on' : '')} aria-pressed={on.has(k)} onClick={() => setOn(s => flip(s, k))}>{d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}</button>; })}
            </div>
            <div className="eyebrow nopad">People</div>
            <div className="chips">
                {people.map(p => <button key={p.id} type="button" className={'chip' + (who.has(p.id) ? ' on' : '')} aria-pressed={who.has(p.id)} onClick={() => setWho(s => flip(s, p.id))}>{p.full_name}</button>)}
                <button type="button" className={'chip' + (who.has(0) ? ' on' : '')} aria-pressed={who.has(0)} onClick={() => setWho(s => flip(s, 0))}>Open slot</button>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>{items.length ? `Creates ${plural(items.length, 'shift', 'shifts')} · ${total.toFixed(1)} h` : 'Pick a job, at least one day and at least one person.'}</p>
        </Dialog>
    );
}

function EditPlanDialog({ shift, jobs, people, onClose, onDone }: { shift: Planned; jobs: Job[]; people: RosterUser[]; onClose: () => void; onDone: (message: string) => void }) {
    const { session } = useAuth();
    const [jobId, setJobId] = useState(shift.jobId);
    const [userId, setUserId] = useState<number | 0>(shift.userId ?? 0);
    const [day, setDay] = useState(dayKey(new Date(shift.startsAt)));
    const [start, setStart] = useState(hhmm(shift.startsAt));
    const [end, setEnd] = useState(hhmm(shift.endsAt));
    const [note, setNote] = useState(shift.note ?? '');
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run(fn: () => Promise<unknown>, message: string) {
        setSaving(true); setError(null);
        try { await fn(); onDone(message); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }
    function save() {
        if (!session || !day || !start || !end) return;
        const s = at(day, start);
        let e = at(day, end);
        if (e <= s) e = new Date(Date.parse(e) + 86400000).toISOString();
        run(() => scheduleApi.update(session.userId, { shiftId: shift.id, jobId, assignedUserId: userId === 0 ? null : userId, startsAt: s, endsAt: e, note: note.trim() || null }), 'Shift updated');
    }
    const published = shift.status === 'published';

    return (
        <Dialog title={confirmDelete ? 'Remove this shift?' : 'Planned shift'} wide={!confirmDelete} onClose={onClose}
            subtitle={confirmDelete ? (published && shift.userId ? `${shift.userName} will be told it is cancelled.` : 'It was a draft: nobody was told about it.') : published ? 'Published: a change is visible to the crew right away.' : 'Draft: not visible to the crew yet.'}
            footer={confirmDelete
                ? <SaveFooter onCancel={() => setConfirmDelete(false)} saving={saving} label="Remove" onSave={() => session && run(() => scheduleApi.remove(session.userId, shift.id), 'Shift removed')} />
                : <><button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)} style={{ marginRight: 'auto' }}>Remove</button><SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!day || !start || !end} /></>}>
            {!confirmDelete && (
                <>
                    <div className="grid-2">
                        <label className="field"><span>Job</span>
                            <select value={jobId} onChange={e => setJobId(Number(e.target.value))}>{jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}{!jobs.some(j => j.id === shift.jobId) && <option value={shift.jobId}>{shift.jobName}</option>}</select></label>
                        <label className="field"><span>Person</span>
                            <select value={userId} onChange={e => setUserId(Number(e.target.value))}><option value={0}>Open slot (nobody yet)</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}{shift.userId && !people.some(p => p.id === shift.userId) && <option value={shift.userId}>{shift.userName}</option>}</select></label>
                        <label className="field"><span>Day</span><input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
                        <label className="field"><span>Note</span><input value={note} onChange={e => setNote(e.target.value)} /></label>
                        <label className="field"><span>Starts</span><input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
                        <label className="field"><span>Ends</span><input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
                    </div>
                </>
            )}
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
