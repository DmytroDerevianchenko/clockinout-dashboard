// Schedule — planned shifts, the same rail the phones' Schedule screen uses.
// A planned shift is a DRAFT until it is published; publishing sends each
// person one grouped notification. The schedule never blocks a punch: what
// actually happened is compared to the plan afterwards (variance).
//
// Two naming traps, encoded on purpose (see the shared ScheduleModels.kt):
//   • on create, the assignee is a NESTED userId inside each shift;
//   • on update it is `assignedUserId` at the top level, because a top-level
//     `userId` is always rewritten to the caller by the auth middleware.
import { api, apiGet } from './client';

export type Planned = {
    id: number; jobId: number; jobName: string; userId: number | null; userName: string | null; hourlyRate: number | null;
    startsAt: string; endsAt: string; note: string | null; status: 'draft' | 'published';
};
export type NewShift = { jobId: number; userId: number | null; startsAt: string; endsAt: string; note?: string | null };
export type Warning = { index: number; conflicts: { id: number | null; jobName: string; startsAt: string; endsAt: string }[] };
export type Variance = {
    scheduledShiftId: number | null; userId: number; jobId: number; ongoing: boolean; startDeltaMin: number | null; endDeltaMin: number | null;
    verdict: 'upcoming' | 'pending' | 'on_time' | 'late' | 'early' | 'no_show' | 'unscheduled';
};

export const scheduleApi = {
    list: (userId: number, organizationId: number, from: string, to: string) =>
        apiGet<{ status: string; shifts: Planned[]; isManagerView: boolean }>('/schedule', { userId, organizationId, from, to }),
    create: (userId: number, organizationId: number, shifts: NewShift[], dryRun = false) =>
        api<{ status: string; created: number[]; count: number; warnings: Warning[]; dryRun: boolean }>('/schedule/shifts', { userId, organizationId, shifts, dryRun }),
    update: (userId: number, p: { shiftId: number; jobId: number; assignedUserId: number | null; startsAt: string; endsAt: string; note: string | null }) =>
        api('/schedule/update', { userId, ...p }),
    remove: (userId: number, shiftId: number) => api('/schedule/delete', { userId, shiftId }),
    publish: (userId: number, organizationId: number, from: string, to: string) =>
        api<{ status: string; published: number; notified: number }>('/schedule/publish', { userId, organizationId, from, to }),
    variance: (userId: number, organizationId: number, from: string, to: string) =>
        apiGet<{ status: string; entries: Variance[] }>('/schedule/variance', { userId, organizationId, from, to }),
};

// ── Week arithmetic (local time, weeks start on Monday) ──────────────────────
export const startOfWeek = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hoursBetween = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 3600000);
/** A local day + "HH:mm" → the ISO instant. */
export const at = (day: string, time: string) => new Date(`${day}T${time}`).toISOString();
