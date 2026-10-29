// Jobs — the admin list and the edits, same endpoints as the phones.
import { api, apiGet } from './client';

export type Job = {
    id: number; name: string; organization_id: number; created_at: string;
    latitude: number | null; longitude: number | null; address: string | null; description: string | null;
    budget: number | string | null; duration: number | string | null; archived: boolean;
    geofence_enabled: boolean | null; geofence_radius: number | null; active_workers?: number | null;
};

export const jobsApi = {
    list: (userId: number, organizationId: number) => apiGet<{ status: string; jobs: Job[] }>('/jobs', { userId, organizationId }),
    create: (userId: number, organizationId: number, j: { name: string; address?: string | null; latitude?: number | null; longitude?: number | null; description?: string | null }) =>
        api('/create-job', { userId, organizationId, ...j }),
    // One field at a time, like /update-user; '' clears address / latitude / longitude / description.
    update: (userId: number, organizationId: number, jobId: number, field: string, value: string) =>
        api('/update-job', { userId, organizationId, jobId, field, value }),
    setArchived: (userId: number, organizationId: number, jobId: number, archived: boolean) =>
        api('/job-archived', { userId, organizationId, jobId, archived }),
    setGeofence: (userId: number, organizationId: number, jobId: number, geofenceEnabled: boolean, geofenceRadius: number) =>
        api('/job-geofencing', { userId, organizationId, jobId, geofenceEnabled, geofenceRadius }),
};
