// Edit a shift: ONE dialog for everything about it that can be corrected —
// the job, the clock-in, the clock-out and the break. (The times used to be
// clickable in the table with nothing saying so, and the break and the job
// could not be changed here at all.)
//
// Each change is its own server call, because each has its own guard:
//   times  → /update-clockin-time   (the In/Out sequence must still alternate)
//   break  → /update-break-duration (recalculates hours and earnings)
//   job    → /update-shift-job      (completed shifts only; no overlap there)
// Only what actually changed is sent, in an order that cannot trip the
// sequence guard, and the first refusal stops the rest and is shown as is.
import { useState } from 'react';
import { ApiError } from '../api/client';
import { hoursApi, fmtDay, toLocalInput, type Shift } from '../api/hours';
import type { Job } from '../api/jobs';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';

export default function EditShiftDialog({ shift, jobs, onClose, onDone, onChanged }: {
    shift: Shift; jobs: Job[]; onClose: () => void; onDone: (message: string) => void;
    /** Something was saved before a later step failed: the list behind should refresh. */
    onChanged: () => void;
}) {
    const { session } = useAuth();
    const done = !!shift.out;
    const [jobId, setJobId] = useState<number>(shift.job_id);
    const [tin, setTin] = useState(toLocalInput(shift.in.time));
    const [tout, setTout] = useState(shift.out ? toLocalInput(shift.out.time) : '');
    const [brk, setBrk] = useState(String(shift.out?.break_duration ?? 0));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The org's live jobs, plus this shift's own job if it has since been archived.
    const options = jobs.filter(j => !j.archived || j.id === shift.job_id);
    const inIso = tin ? new Date(tin).toISOString() : '';
    const outIso = done && tout ? new Date(tout).toISOString() : '';
    const sameMinute = (a: string, b: string) => a.slice(0, 16) === b.slice(0, 16);
    const inChanged = !!inIso && !sameMinute(toLocalInput(shift.in.time), tin);
    const outChanged = done && !!outIso && !sameMinute(toLocalInput(shift.out!.time), tout);
    const brkChanged = done && (parseInt(brk) || 0) !== (shift.out!.break_duration ?? 0);
    const jobChanged = done && jobId !== shift.job_id;
    const invalid = !inIso || (done && (!outIso || outIso <= inIso));
    const dirty = inChanged || outChanged || brkChanged || jobChanged;

    async function save() {
        if (!session || invalid) return;
        setSaving(true); setError(null);
        let saved = false;
        try {
            // Moving a shift LATER: the clock-out goes first, or the new clock-in
            // would briefly sit after the old clock-out and break the In/Out walk.
            const outFirst = outChanged && inChanged && inIso >= shift.out!.time;
            const setIn = async () => { if (inChanged) { await hoursApi.setTime(session.userId, shift.in.id, inIso); saved = true; } };
            const setOut = async () => { if (outChanged) { await hoursApi.setTime(session.userId, shift.out!.id, outIso); saved = true; } };
            if (outFirst) { await setOut(); await setIn(); } else { await setIn(); await setOut(); }
            // After the times: a time edit recalculates with the stored break.
            if (brkChanged) { await hoursApi.setBreak(session.userId, shift.out!.id, parseInt(brk) || 0); saved = true; }
            if (jobChanged) { await hoursApi.setJob(session.userId, shift.in.id, jobId); saved = true; }
            onDone('Shift saved');
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not save');
            setSaving(false);
            if (saved) onChanged();
        }
    }

    return (
        <Dialog title="Edit shift" subtitle={`${shift.user_name} · ${fmtDay(shift.in.time)}. Hours and earnings are recalculated from what you change.`} wide onClose={onClose}
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!dirty || invalid} />}>
            <div className="grid-2">
                <label className="field"><span>Job</span>
                    <select value={jobId} disabled={!done} onChange={e => setJobId(Number(e.target.value))}>
                        {options.map(j => <option key={j.id} value={j.id}>{j.name}{j.archived ? ' (archived)' : ''}</option>)}
                        {!options.some(j => j.id === shift.job_id) && <option value={shift.job_id}>{shift.job_name ?? 'This job'}</option>}
                    </select>
                    {!done && <small className="muted">Still on the clock: end the shift first to change its job.</small>}
                </label>
                <label className="field"><span>Break (minutes)</span>
                    <input inputMode="numeric" value={brk} disabled={!done} onFocus={e => e.currentTarget.select()} onChange={e => setBrk(e.target.value.replace(/\D/g, ''))} />
                    {!done && <small className="muted">Set when the shift ends.</small>}
                </label>
                <label className="field"><span>Clock in</span><input type="datetime-local" value={tin} onChange={e => setTin(e.target.value)} /></label>
                <label className="field"><span>Clock out</span>
                    {done ? <input type="datetime-local" value={tout} onChange={e => setTout(e.target.value)} /> : <input value="Still on the clock" disabled />}
                </label>
            </div>
            {done && outIso && inIso && outIso <= inIso && <p className="error-line">Clock out must be after clock in.</p>}
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
