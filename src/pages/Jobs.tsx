// Jobs: the sites. Create, rename, address, description, archive, and the
// job's own geofence (needs a pin — the web has no map search yet, so a pin
// set on the phone is shown and respected; a job without one cannot fence).
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { jobsApi, type Job } from '../api/jobs';
import { useAuth } from '../auth';
import Dialog, { SaveFooter } from '../components/Dialog';

export default function Jobs() {
    const { session, org } = useAuth();
    const [jobs, setJobs] = useState<Job[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const [editing, setEditing] = useState<Job | 'new' | null>(null);

    const load = useCallback(() => {
        if (!session || !org) return;
        jobsApi.list(session.userId, org.organization_id)
            .then(r => { setJobs(r.jobs); setError(null); })
            .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load jobs'));
    }, [session, org]);
    useEffect(() => { setJobs(null); load(); }, [load]);

    async function archive(j: Job) {
        if (!session || !org) return;
        try { await jobsApi.setArchived(session.userId, org.organization_id, j.id, !j.archived); load(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Could not update the job'); }
    }

    if (error) return <div className="card danger">{error}</div>;
    if (!jobs) return <div className="card muted">Loading…</div>;
    const list = jobs.filter(j => showArchived || !j.archived).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));

    return (
        <>
            <div className="toolbar">
                <label className="check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
                <span className="spacer" />
                <button className="btn btn-primary" onClick={() => setEditing('new')}>New job</button>
            </div>
            <div className="card card-flush">
                <table className="table table-hover">
                    <thead><tr><th>Job</th><th>Address</th><th>Geofence</th><th>On site now</th><th></th></tr></thead>
                    <tbody>
                        {list.map(j => (
                            <tr key={j.id} className={j.archived ? 'muted' : ''}>
                                <td><button className="row-link linkish" onClick={() => setEditing(j)}><strong>{j.name}</strong></button>
                                    {j.archived && <span className="pill">Archived</span>}
                                    {j.description && <div className="faint small">{j.description}</div>}</td>
                                <td>{j.address ?? <span className="faint">—</span>}{j.latitude == null && <div className="faint small">No pin — set the address on the phone to place one</div>}</td>
                                <td>{j.geofence_enabled ? `On · ${j.geofence_radius ?? 100} m` : <span className="faint">Off</span>}</td>
                                <td>{j.active_workers ?? 0}</td>
                                <td className="actions"><button className="btn btn-sm" onClick={() => archive(j)}>{j.archived ? 'Unarchive' : 'Archive'}</button></td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={5} className="empty">No jobs yet.</td></tr>}
                    </tbody>
                </table>
            </div>
            {editing && <JobDialog job={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
        </>
    );
}

function JobDialog({ job, onClose, onDone }: { job: Job | null; onClose: () => void; onDone: () => void }) {
    const { session, org } = useAuth();
    const [name, setName] = useState(job?.name ?? '');
    const [address, setAddress] = useState(job?.address ?? '');
    const [description, setDescription] = useState(job?.description ?? '');
    const [fenceOn, setFenceOn] = useState(job?.geofence_enabled === true);
    const [radius, setRadius] = useState(String(job?.geofence_radius ?? 100));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasPin = job?.latitude != null && job?.longitude != null;

    async function save() {
        if (!session || !org) return;
        setSaving(true); setError(null);
        try {
            if (!job) {
                await jobsApi.create(session.userId, org.organization_id, { name: name.trim(), address: address.trim() || null, description: description.trim() || null });
            } else {
                const u = (field: string, v: string) => jobsApi.update(session.userId, org.organization_id, job.id, field, v);
                if (name.trim() !== job.name) await u('name', name.trim());
                if ((address.trim()) !== (job.address ?? '')) await u('address', address.trim());
                if ((description.trim()) !== (job.description ?? '')) await u('description', description.trim());
                if (hasPin && (fenceOn !== (job.geofence_enabled === true) || String(job.geofence_radius ?? 100) !== radius)) {
                    await jobsApi.setGeofence(session.userId, org.organization_id, job.id, fenceOn, parseInt(radius) || 100);
                }
            }
            onDone();
        } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setSaving(false); }
    }

    return (
        <Dialog title={job ? job.name : 'New job'} onClose={onClose} footer={<SaveFooter onCancel={onClose} onSave={save} saving={saving} disabled={!name.trim()} />}>
            <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} autoFocus /></label>
            <label className="field"><span>Address</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, city, province" />
                <small className="muted">{hasPin ? 'This job has a map pin from the phone; changing the text here keeps the pin.' : 'Typed here it is a label; placing the pin for the geofence needs the phone’s address search for now.'}</small></label>
            <label className="field"><span>Description</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
            {hasPin && (
                <>
                    <label className="check"><input type="checkbox" checked={fenceOn} onChange={e => setFenceOn(e.target.checked)} /> Geofence this job</label>
                    {fenceOn && <label className="field"><span>Radius (metres)</span><input inputMode="numeric" value={radius} onChange={e => setRadius(e.target.value.replace(/\D/g, ''))} /></label>}
                </>
            )}
            {error && <p className="error-line">{error}</p>}
        </Dialog>
    );
}
