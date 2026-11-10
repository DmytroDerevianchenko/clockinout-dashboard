// Copy a coworker's shifts onto another person — the web twin of the
// phone's screen. A new hire worked the crew's days before being added to
// the app: pick who to copy FROM, who to add them TO, and the days. The
// server previews that person's completed shifts (the same code path as
// the save), each ticked unless the target already has a shift there.
//
// A source PERSON, not a free selection across the table: one person's
// shifts never overlap each other, so the copy cannot collide with itself.
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { hoursApi, fmtDay, fmtTime, type CopyCandidate } from '../api/hours';
import type { RosterUser } from '../api/team';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from './Dialog';
import { SkeletonLines } from './Skeleton';

const localDay = (d: Date) => { const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
// The range as instants: local start of the first day → local end of the last.
const startIso = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const endIso   = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

export default function CopyShiftsDialog({ people, defaultTarget, onClose, onDone }: {
    people: RosterUser[]; defaultTarget?: number; onClose: () => void; onDone: (message: string) => void;
}) {
    const { session, org } = useAuth();
    const [source, setSource] = useState<number | ''>('');
    const [target, setTarget] = useState<number | ''>(defaultTarget ?? '');
    // The usual case is "last week": seven days back through today.
    const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return localDay(d); });
    const [to, setTo] = useState(() => localDay(new Date()));
    const [preview, setPreview] = useState<CopyCandidate[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState<Set<number>>(new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const same = source !== '' && source === target;
    const ready = source !== '' && target !== '' && !same && !!from && !!to && from <= to;

    // Any change of the four choices asks the server again; a slow older
    // reply is ignored so it can never paint over the current choice.
    useEffect(() => {
        setPreview(null); setPicked(new Set()); setError(null);
        if (!ready || !session || !org) return;
        let stale = false;
        setLoading(true);
        hoursApi.copyShifts(session.userId, org.organization_id, { sourceUserId: Number(source), targetUserId: Number(target), from: startIso(from), to: endIso(to), dryRun: true })
            .then(r => { if (stale) return; setPreview(r.shifts); setPicked(new Set(r.shifts.filter(s => !s.conflict).map(s => s.clockInId))); })
            .catch(e => { if (!stale) { setPreview([]); setError(e instanceof ApiError ? e.message : 'Could not load the shifts'); } })
            .finally(() => { if (!stale) setLoading(false); });
        return () => { stale = true; };
    }, [session, org, source, target, from, to, ready]);

    const copyable = useMemo(() => (preview ?? []).filter(s => !s.conflict), [preview]);
    const chosen = copyable.filter(s => picked.has(s.clockInId));
    const hours = chosen.reduce((t, s) => t + s.hours, 0);
    const toggle = (id: number) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    async function save() {
        if (!session || !org || !ready || chosen.length === 0) return;
        setSaving(true); setError(null);
        try {
            const r = await hoursApi.copyShifts(session.userId, org.organization_id, {
                sourceUserId: Number(source), targetUserId: Number(target), from: startIso(from), to: endIso(to), clockInIds: chosen.map(s => s.clockInId),
            });
            const who = people.find(u => u.id === target)?.full_name ?? '';
            const skipped = r.skipped?.length ?? 0;
            onDone(`Added ${r.created} ${r.created === 1 ? 'shift' : 'shifts'} to ${who}${skipped ? ` · ${skipped} skipped` : ''}`);
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not copy the shifts'); setSaving(false); }
    }

    const active = people.filter(u => u.status === 'active');
    return (
        <Dialog title="Copy a coworker's shifts" wide onClose={onClose}
            subtitle="Their completed shifts in these days are re-created for the other person: same job, times and break, at that person's own rate."
            footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!ready || loading || chosen.length === 0}
                label={chosen.length === 0 ? 'Add shifts' : `Add ${chosen.length} ${chosen.length === 1 ? 'shift' : 'shifts'}`} />}>
            <div className="grid-2">
                <label className="field"><span>Copy from</span>
                    <select value={source} onChange={e => setSource(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Choose</option>{active.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
                <label className="field"><span>Add to</span>
                    <select value={target} onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Choose</option>{active.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
                {/* Moving one end past the other drags it along, so the range stays in order. */}
                <label className="field"><span>First day</span><input type="date" value={from} onChange={e => { const v = e.target.value; setFrom(v); if (v && to < v) setTo(v); }} /></label>
                <label className="field"><span>Last day</span><input type="date" value={to} onChange={e => { const v = e.target.value; setTo(v); if (v && from > v) setFrom(v); }} /></label>
            </div>
            <div className="eyebrow nopad">Shifts</div>
            {same ? <p className="muted">Pick two different people.</p>
                : !ready ? <p className="muted">Pick the two people to see the shifts.</p>
                : loading || !preview ? <SkeletonLines n={4} />
                : preview.length === 0 ? <p className="muted">No completed shifts in these days.</p>
                : (
                    <>
                        <table className="table">
                            <tbody>
                                {preview.map(s => (
                                    <tr key={s.clockInId} className={s.conflict ? 'row-off' : 'row-pick'} onClick={() => { if (!s.conflict) toggle(s.clockInId); }}>
                                        <td style={{ width: 28 }}><input type="checkbox" checked={!s.conflict && picked.has(s.clockInId)} disabled={!!s.conflict} onChange={() => toggle(s.clockInId)} onClick={e => e.stopPropagation()} aria-label={`Copy the shift of ${fmtDay(s.clockIn)}`} /></td>
                                        <td>{fmtDay(s.clockIn)}</td>
                                        <td>{s.jobName}</td>
                                        {s.conflict
                                            ? <td colSpan={2} className="caution">{s.conflict === 'job_deleted' ? 'The job was deleted' : 'Already on their timesheet'}</td>
                                            : <><td>{fmtTime(s.clockIn)} – {fmtTime(s.clockOut)}</td><td>{s.hours.toFixed(2)} h</td></>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {copyable.length > 0 && (
                            <div className="toolbar" style={{ marginTop: 8 }}>
                                <span className="muted small">{chosen.length} of {copyable.length} selected · {hours.toFixed(2)} h</span>
                                <span className="spacer" />
                                <button className="btn btn-sm" type="button" onClick={() => setPicked(chosen.length === copyable.length ? new Set() : new Set(copyable.map(s => s.clockInId)))}>
                                    {chosen.length === copyable.length ? 'Clear' : 'Select all'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
