// ============================================================
// team.ts — the Team screen's calls, typed. Same endpoints, same bodies
// as the phones (shared KMP models), so the server sees one client.
// ============================================================
import { api, apiGet } from './client';
import { tx, lang } from '../i18n';

export type ActiveShift = { clockin_id: number; job_id: number; job_name: string | null; clock_in_time: string; note?: string | null };

export type RosterUser = {
    id: number; email: string; full_name: string; role: 'employer' | 'employee' | 'accountant';
    is_admin: boolean; has_password: boolean; organization_id: number;
    start_date: string | null; dob: string | null; taxpayer_id: string | null; verification_code: string | null;
    user_tz: string | null; week_hours: number; current_rate: number | null; salary_amount: number | null;
    notes: string | null; geofence_enabled: boolean | null; geofence_radius: number | null;
    phone_number: string | null; employment_type: string | null; status: string; joined: boolean;
    tax_registration_number: string | null;
    street: string | null; unit_number: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null;
    created_at: string; updated_at: string; last_login: string | null; joined_at: string | null; org_last_login: string | null;
    is_clocked_in: boolean; clock_in_time: string | null; current_job_name: string | null; current_clock_in_id: number | null; current_job_id: number | null;
    active_shifts: ActiveShift[];
    // Tax profile + jurisdiction + this year's opening balances
    td1_federal: number | string | null; td1_provincial: number | string | null; cpp_exempt: boolean; ei_exempt: boolean;
    pretax_deductions: number | string; tax_dependants: number; tax_jurisdiction_override: string | null;
    opening_year: number | null; opening_gross: number | string | null; opening_cpp: number | string | null; opening_cpp2: number | string | null;
    opening_ei: number | string | null; opening_federal_tax: number | string | null; opening_provincial_tax: number | string | null;
};
export type Overtime = { enabled: boolean; threshold: number };
export type RosterReply = { status: string; users: RosterUser[]; overtime: Overtime };

export type JobEntry = { id: number; name: string; archived?: boolean; address?: string | null };

const n = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
export const num = n;

export const team = {
    roster: (userId: number, organizationId: number) =>
        api<RosterReply>('/users', { userId, organizationId }),

    // One field, the server's whitelist decides (same as the phone's updateField).
    updateField: (userId: number, organizationId: number, targetUserId: number, field: string, value: string) =>
        api('/update-user', { userId, organizationId, targetUserId, field, value }),

    setTaxProfile: (targetUserId: number, orgId: number, p: {
        td1Federal: number | null; td1Provincial: number | null; cppExempt: boolean; eiExempt: boolean; pretaxDeductions: number; dependants: number;
    }) => api('/user-tax-profile', { targetUserId, orgId, ...p }),

    setOpeningBalances: (targetUserId: number, orgId: number, year: number, b: {
        gross: number; cpp: number; cpp2: number; ei: number; federalTax: number; provincialTax: number;
    }) => api('/user-opening-balances', { targetUserId, orgId, year, ...b }),

    jobs: (userId: number, organizationId: number) =>
        apiGet<{ status: string; jobs: JobEntry[] }>('/jobs', { userId, organizationId }),

    employerClockIn: (adminUserId: number, targetUserId: number, organizationId: number, jobId: number, clockInTime: string) =>
        api('/employer-clock-in', { adminUserId, targetUserId, organizationId, jobId, clockInTime }),

    endShift: (adminUserId: number, clockInId: number, clockOutTime: string, organizationId: number) =>
        api('/end-shift', { adminUserId, clockInId, clockOutTime, organizationId }),

    addNote: (userId: number, clockInId: number, note: string) =>
        api('/add-note', { userId, clockInId, note }),

    checkEmail: (userId: number, organizationId: number, email: string) =>
        api<{ status: string; exists: boolean; isMember: boolean; fullName?: string | null }>('/check-user-email', { userId, organizationId, email }),

    createUser: (body: {
        userId: number; organizationId: number; email: string; fullName: string; role: 'employee' | 'accountant';
        startDate: string; phoneNumber?: string | null; employmentType?: string | null; currentRate?: number | null;
        street?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; country?: string | null;
    }) => api('/create-user', body),

    sendInvite: (senderEmail: string, inviteEmail: string, organizationId: number) =>
        api<{ status: string; message?: string }>('/send-invite', { email: senderEmail, inviteEmail, organizationId }),

    // ── Balances: what the org owes each person (net − paid + adjustments), all time ──
    owed: (userId: number, organizationId: number) =>
        apiGet<{ status: string; employees: OwedRow[]; total_owed: number; total_overpaid: number }>('/payroll-owed', { userId, organizationId }),
    adjustments: (userId: number, organizationId: number, targetUserId: number) =>
        apiGet<{ status: string; adjustments: Adjustment[] }>('/balance-adjustments', { userId, organizationId, targetUserId }),
    addAdjustment: (userId: number, organizationId: number, a: { targetUserId: number; amount: number; adjustedOn?: string | null; kind: 'opening' | 'adjustment'; note?: string | null }) =>
        api('/balance-adjustments', { userId, organizationId, ...a }),
    deleteAdjustment: (userId: number, organizationId: number, id: number) =>
        api('/balance-adjustments/delete', { userId, organizationId, id }),
};
export type OwedRow = { user_id: number; full_name: string; status: string; net: number; paid: number; adjustments: number; owed: number };
// Positive = the organization owes the person; negative = the person owes the organization.
export type Adjustment = { id: number; user_id: number; amount: number; adjusted_on: string; kind: 'opening' | 'adjustment'; note: string | null; created_at: string };

// ── display helpers shared by the Team pages ──
export const money = (v: unknown) => `$${n(v).toLocaleString(lang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dateOnly = (iso: string | null | undefined) => iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(lang(), { year: 'numeric', month: 'short', day: 'numeric' }) : '';
export const dateTime = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
export const timeOnly = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' }) : '';
export const employmentLabel = (t: string | null | undefined) =>
    ({ full_time: tx('Full-time'), part_time: tx('Part-time'), casual: tx('Casual'), contractor: tx('Contractor'), salary: tx('Salaried') } as Record<string, string>)[t ?? ''] ?? (t ?? tx('Not set'));
export const statusLabel = (s: string) => ({ active: tx('Active'), inactive: tx('Inactive'), terminated: tx('Terminated'), pending: tx('Pending'), deleted: tx('Deleted') } as Record<string, string>)[s] ?? s;
export const PROVINCES = ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia',
    'Northwest Territories', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Saskatchewan', 'Yukon'];
