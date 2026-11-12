// The route of one shift: where the person clocked in and out, the location
// pings in between (when the organization tracks them), and the job's pin
// with its geofence. The same picture the phone's Route Map draws.
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiGet } from '../api/client';
import { fmtDay, fmtTime, type Shift } from '../api/hours';
import type { Job } from '../api/jobs';
import { useAuth } from '../auth';
import Dialog from './Dialog';
import MapView, { type MapPoint } from './MapView';
import { SkeletonLines } from './Skeleton';

type Ping = { id: number; action: string | null; latitude: number | string | null; longitude: number | string | null; last_updated: string; geofence: string | null };
const num = (v: unknown) => (v == null || v === '' ? NaN : Number(v));
const ok = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);

export default function RouteMapDialog({ shift, job, onClose }: { shift: Shift; job?: Job; onClose: () => void }) {
    const { session } = useAuth();
    const [pings, setPings] = useState<Ping[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session) return;
        let stale = false;
        // The shift's own window, both ends included; an open shift runs to now.
        apiGet<{ status: string; locations: Ping[] }>('/user_locations', { targetUserId: shift.user_id, jobId: shift.job_id, startTime: shift.in.time, endTime: shift.out?.time ?? new Date().toISOString() })
            .then(r => { if (!stale) setPings(r.locations ?? []); })
            .catch(e => { if (!stale) { setPings([]); setError(e instanceof ApiError ? e.message : 'Could not load the route'); } });
        return () => { stale = true; };
    }, [session, shift]);

    const { points, path, circle, outside } = useMemo(() => {
        const points: MapPoint[] = [];
        const trail = (pings ?? []).map(p => ({ lat: num(p.latitude), lon: num(p.longitude), t: p.last_updated, action: p.action ?? '', out: (p.geofence ?? '').toLowerCase().includes('out') })).filter(p => ok(p.lat, p.lon));
        const jLat = num(job?.latitude), jLon = num(job?.longitude);
        const circle = job && ok(jLat, jLon) && job.geofence_enabled ? { lat: jLat, lon: jLon, radius: job.geofence_radius ?? 100 } : undefined;
        if (job && ok(jLat, jLon)) points.push({ lat: jLat, lon: jLon, kind: 'job', label: `Job site · ${job.name}` });
        for (const p of trail) points.push({ lat: p.lat, lon: p.lon, kind: p.out ? 'outside' : 'ping', label: `${fmtTime(p.t)}${p.action ? ` · ${p.action}` : ''}${p.out ? ' · outside the geofence' : ''}` });
        const inLat = num(shift.in.latitude), inLon = num(shift.in.longitude);
        if (ok(inLat, inLon)) points.push({ lat: inLat, lon: inLon, kind: 'in', label: `Clock in · ${fmtTime(shift.in.time)}` });
        const outLat = num(shift.out?.latitude), outLon = num(shift.out?.longitude);
        if (shift.out && ok(outLat, outLon)) points.push({ lat: outLat, lon: outLon, kind: 'out', label: `Clock out · ${fmtTime(shift.out.time)}` });
        return { points, path: trail.map(p => [p.lat, p.lon] as [number, number]), circle, outside: trail.filter(p => p.out).length };
    }, [pings, job, shift]);

    const hasPlaces = points.some(p => p.kind !== 'job');
    return (
        <Dialog title="Route map" wide onClose={onClose}
            subtitle={`${shift.user_name} · ${shift.job_name ?? 'Job'} · ${fmtDay(shift.in.time)} ${fmtTime(shift.in.time)}${shift.out ? ` – ${fmtTime(shift.out.time)}` : ' – now'}`}
            footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
            {!pings ? <SkeletonLines n={4} /> : (
                <>
                    {error && <p className="error-line">{error}</p>}
                    {points.length === 0 ? <p className="muted">No location was recorded for this shift, and the job has no map pin.</p> : <MapView points={points} path={path} circle={circle} height={380} />}
                    <div className="map-legend">
                        <span><i className="lg in" />Clock in</span><span><i className="lg out" />Clock out</span><span><i className="lg job" />Job site{circle ? ' and geofence' : ''}</span>
                        {path.length > 0 && <span><i className="lg ping" />{path.length} location {path.length === 1 ? 'point' : 'points'}</span>}
                        {outside > 0 && <span className="danger"><i className="lg outside" />{outside} outside the geofence</span>}
                    </div>
                    {points.length > 0 && !hasPlaces && <p className="muted small">No location was recorded for this shift; only the job site is shown.</p>}
                </>
            )}
        </Dialog>
    );
}
