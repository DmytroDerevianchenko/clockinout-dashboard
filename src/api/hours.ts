// Hours — clock-in rows and the employer's edits, same endpoints as the
// phone's View Hours screen. The server returns one row per ACTION (Clock
// In, Clock Out); shifts are paired here, as the phone does.
import { api, apiGet } from './client';
import { lang } from '../i18n';

export type ClockRow = {
    id: number; time: string; user_id: number; user_name: string; user_type: string | null;
    job_id: number; job_name: string | null; action: 'Clock In' | 'Clock Out';
    hours_worked: number | string | null; break_duration: number | null; latitude: number | null; longitude: number | null;
    note: string | null; hourly_rate: number | null; earned: number | string | null; user_tz: string | null;
};
export type Shift = { user_id: number; user_name: string; job_id: number; job_name: string | null; in: ClockRow; out: ClockRow | null };

export type PeriodLite = { id: number; start_date: string; end_date: string; status: string };
// One of the source person's completed shifts, as /copy-shifts previews it.
// conflict: null = can be copied; 'overlap' = the target already has a shift there.
export type CopyCandidate = { clockInId: number; jobId: number; jobName: string; clockIn: string; clockOut: string; hours: number; breakMinutes: number; conflict: 'overlap' | 'job_deleted' | null };

export const hoursApi = {
    rows: (userId: number, organizationId: number, f: { userFilterId?: number; payPeriodId?: number; jobId?: number; year?: number }) =>
        apiGet<{ status: string; clockins: ClockRow[] }>('/clockins', { userId, organizationId, ...f }),
    periods: (organizationId: number, year: number) =>
        apiGet<{ status: string; payPeriods: PeriodLite[] }>('/pay-periods-list', { organizationId, year }),
    setTime: (userId: number, clockInId: number, newTime: string) => api('/update-clockin-time', { userId, clockInId, newTime }),
    // Completed shifts: the break taken, and the job the shift belongs to.
    setBreak: (userId: number, clockOutId: number, breakDuration: number) => api('/update-break-duration', { userId, clockOutId, breakDuration }),
    setJob: (userId: number, clockInId: number, jobId: number) => api<{ status: string; jobName?: string; changed?: boolean }>('/update-shift-job', { userId, clockInId, jobId }),
    addShift: (adminUserId: number, targetUserId: number, organizationId: number, jobId: number, clockInTime: string, clockOutTime: string, breakDuration: number) =>
        api('/add-shift', { adminUserId, targetUserId, organizationId, jobId, clockInTime, clockOutTime, breakDuration }),
    // Re-create a coworker's completed shifts for another person; dryRun previews (nothing written).
    copyShifts: (adminUserId: number, organizationId: number, p: { sourceUserId: number; targetUserId: number; from: string; to: string; clockInIds?: number[]; dryRun?: boolean }) =>
        api<{ status: string; created: number; shifts: CopyCandidate[]; skipped?: { clockInId: number; reason: string }[] }>('/copy-shifts', { adminUserId, organizationId, ...p }),
    deleteShift: (userId: number, clockInId: number, clockOutId: number | null) => api('/delete-clockin-shift', { userId, clockInId, clockOutId }),
    addNote: (userId: number, clockInId: number, note: string) => api('/add-note', { userId, clockInId, note }),
    csv: (userId: number, organizationId: number, f: { userFilterId?: number; payPeriodId?: number; jobId?: number; year?: number }) =>
        api<{ status: string; csv_url?: string }>('/hours-csv', { userId, organizationId, ...f }),
};

/** Pair Clock In / Clock Out rows into shifts, per person, in time order. */
export function pairShifts(rows: ClockRow[]): Shift[] {
    const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
    const open = new Map<number, Shift>();
    const out: Shift[] = [];
    for (const r of sorted) {
        if (r.action === 'Clock In') {
            const s: Shift = { user_id: r.user_id, user_name: r.user_name, job_id: r.job_id, job_name: r.job_name, in: r, out: null };
            open.set(r.user_id * 100000 + r.job_id, s); out.push(s);
        } else {
            const key = r.user_id * 100000 + r.job_id;
            const s = open.get(key) ?? [...open.values()].find(x => x.user_id === r.user_id);
            if (s) { s.out = r; open.delete(key); }
            else out.push({ user_id: r.user_id, user_name: r.user_name, job_id: r.job_id, job_name: r.job_name, in: r, out: null });
        }
    }
    return out.sort((a, b) => b.in.time.localeCompare(a.in.time));
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' });
export const fmtDay  = (iso: string) => new Date(iso).toLocaleDateString(lang(), { weekday: 'short', month: 'short', day: 'numeric' });
/** ISO local string for <input type="datetime-local"> */
export const toLocalInput = (iso: string) => { const d = new Date(iso); const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
